/*
|--------------------------------------------------------------------------
| Store Workspace Callables
|--------------------------------------------------------------------------
|
| Store pages call this module instead of using Firebase Admin SDK-backed
| Vercel routes or writing stores/{storeId} from the browser. Every callable
| derives the store from the authenticated owner and validates data before
| using the Admin SDK.
|
*/

import * as admin from "firebase-admin";
import Stripe from "stripe";
import {
  AggregateField,
  type DocumentData,
  FieldPath,
  FieldValue,
  getFirestore,
  type UpdateData,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";
import {
  grantStoreUploadClaim,
} from "../services/store/storeUploadClaimService";
import {PLATFORM_REPORTING_TIME_ZONE} from "../payment/pricing/paymentPricingConfig";
import {resolveDeliveryZoneForAddress} from "../delivery/deliveryZoneAssignmentService";
import {createCatalogSearchTokens, normalizeCatalogSearchText} from "../services/catalog/catalogSearchTokens";
import {requireApprovedStore, requireOwnedStore, requireStoreWorkspaceAccess} from "../services/store/storeAccessService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {hasStoreAddressChanged} from "../services/store/storeSettingsPolicy";
import {
  localDateKey,
  storeAnalyticsRange,
  type StoreAnalyticsPeriod,
} from "../reporting/storeAnalyticsPeriod";
import {backfillStorePerformanceSummaries} from "../reporting/storePerformanceSummaryService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const scheduleDays = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
const businessTypes = new Set([
  "grocery",
  "market",
  "specialty_food",
  "international_grocery",
  "asian_market",
  "latin_market",
  "convenience_store",
  "specialty_retail",
  "restaurant",
  "bakery",
  "pharmacy_health",
  "african_grocery",
  "african_restaurant",
  "home_based",
  "african_market",
  "other",
]);
const businessStructures = new Set([
  "sole_proprietorship",
  "dba",
  "llc",
  "partnership",
  "corporation",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeState(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeEin(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function requiredText(value: unknown, field: string, maximumLength: number): string {
  const normalized = text(value);
  if (!normalized) throw new HttpsError("invalid-argument", `${field} is required.`);
  if (normalized.length > maximumLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
    throw new HttpsError("invalid-argument", `${field} is too long or contains unsupported characters.`);
  }
  return normalized;
}

function settingsAuditData(params: {
  storeId: string;
  actorUid: string;
  action: string;
  changedFields: string[];
}) {
  return {
    storeId: params.storeId,
    actorUid: params.actorUid,
    actorType: "store_owner",
    action: params.action,
    changedFields: params.changedFields,
    createdAt: FieldValue.serverTimestamp(),
  };
}

const STORE_ORDER_INDEX_VERSION = 1;
const storeOrderStatuses = ["pending", "accepted", "preparing", "ready_for_pickup", "out_for_delivery", "completed", "cancelled"] as const;

function orderSearchFields(id: string, data: Record<string, unknown>) {
  const customer = isRecord(data.customer) ? data.customer : {};
  return {
    storeSearchTokens: createCatalogSearchTokens([
      id,
      data.orderNumber,
      customer.name,
      customer.email,
    ]),
  };
}

async function ensureStoreOrderIndex(store: FirebaseFirestore.DocumentSnapshot) {
  if (store.data()?.orderIndexVersion === STORE_ORDER_INDEX_VERSION) return;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let query = db.collection("orders")
      .where("store.id", "==", store.id)
      .where("checkoutStatus", "==", "confirmed")
      .orderBy("__name__")
      .limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    const customers = new Map<string, Record<string, unknown>>();
    page.docs.forEach((order) => {
      batch.update(order.ref, orderSearchFields(order.id, order.data()));
      const customer = isRecord(order.data().customer) ? order.data().customer : {};
      const customerId = text(customer.uid);
      if (customerId) customers.set(customerId, customer);
    });
    await batch.commit();
    const customerRows = Array.from(customers.entries());
    for (let index = 0; index < customerRows.length; index += 400) {
      const customerBatch = db.batch();
      customerRows.slice(index, index + 400).forEach(([customerId, customer]) => customerBatch.set(
        store.ref.collection("customers").doc(customerId),
        {customerId, name: text(customer.name), firstOrderBackfilledAt: FieldValue.serverTimestamp()},
        {merge: true},
      ));
      await customerBatch.commit();
    }
    cursor = page.docs.at(-1) ?? null;
    if (page.size < 400) break;
  }
  await store.ref.set({orderIndexVersion: STORE_ORDER_INDEX_VERSION}, {merge: true});
}

async function storeOrderCounts(storeId: string) {
  const orders = db.collection("orders")
    .where("store.id", "==", storeId)
    .where("checkoutStatus", "==", "confirmed")
    .where("payment.status", "==", "paid");
  const [total, ...statuses] = await Promise.all([
    orders.count().get(),
    ...storeOrderStatuses.map((status) => orders.where("status", "==", status).count().get()),
  ]);
  const counts = Object.fromEntries(storeOrderStatuses.map((status, index) => [status, statuses[index].data().count]));
  return {
    total: total.data().count,
    pending: counts.pending,
    accepted: counts.accepted,
    preparing: counts.preparing,
    readyForPickup: counts.ready_for_pickup,
    outForDelivery: counts.out_for_delivery,
    completed: counts.completed,
    cancelled: counts.cancelled,
  };
}

type StoreOrderFinancialSummary = {
  currency: string;
  merchandiseSubtotal: number;
  salesTax: number;
  grossStoreAmount: number;
  liaCommission: number | null;
  originalStoreEarning: number | null;
  refundedMerchandise: number;
  refundedSalesTax: number;
  storeRefundReversal: number;
  netStoreEarning: number | null;
  customerRefundTotal: number;
  refundStatus: string | null;
  settlementStatus: string;
  transferStatus: string;
};

/* Build an order-level financial projection only from immutable pricing,
 * settlement, refund and transfer records. Values returned to the browser
 * are dollars; all calculations remain integer cents here. */
async function storeOrderFinancialSummaries(
  storeId: string,
  orders: FirebaseFirestore.DocumentSnapshot[],
): Promise<Map<string, StoreOrderFinancialSummary>> {
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return new Map();
  const [settlements, refunds, transfers] = await Promise.all([
    documentsByReferences(orderIds.map((id) => db.collection("paymentSettlements").doc(id))),
    refundsForOrders(orderIds),
    documentsByReferences(orderIds.map((id) => db.collection("paymentTransfers").doc(`${id}_store`))),
  ]);
  const settlementByOrder = new Map(settlements.filter((item) => item.exists).map((item) => [item.id, item.data() ?? {}]));
  const transferByOrder = new Map(transfers.filter((item) => item.exists && item.data()?.recipient?.id === storeId).map((item) => [text(item.data()?.orderId) || item.id.replace(/_store$/, ""), item.data() ?? {}]));
  const refundsByOrder = new Map<string, FirebaseFirestore.DocumentData[]>();
  refunds.forEach((refund) => {
    const orderId = text(refund.data().orderId);
    refundsByOrder.set(orderId, [...(refundsByOrder.get(orderId) ?? []), refund.data()]);
  });

  return new Map(orders.map((order) => {
    const data = order.data() ?? {};
    const pricing = isRecord(data.pricing) ? data.pricing : {};
    const merchandise = nonNegativeCentAmount(pricing.subtotalAmount);
    const tax = nonNegativeCentAmount(pricing.taxAmount);
    const gross = merchandise + tax;
    const settlement = settlementByOrder.get(order.id);
    const transfer = transferByOrder.get(order.id);
    const storeAmount = settlement ? nonNegativeCentAmount(settlement.storeAmount) : null;
    let refundedMerchandise = 0;
    let refundedTax = 0;
    let storeReversal = 0;
    let customerRefundTotal = 0;
    const refundStatuses = new Set<string>();
    (refundsByOrder.get(order.id) ?? []).forEach((refund) => {
      const status = text(refund.status);
      if (status) refundStatuses.add(status);
      if (status === "completed" || status === "partially_completed") {
        const allocation = isRecord(refund.allocation) ? refund.allocation : {};
        refundedMerchandise += nonNegativeCentAmount(allocation.merchandiseAmount);
        refundedTax += nonNegativeCentAmount(allocation.taxAmount);
        customerRefundTotal += nonNegativeCentAmount(allocation.totalAmount);
      }
      const reversals = Array.isArray(refund.reversals) ? refund.reversals : [];
      storeReversal += reversals
        .filter((entry: unknown) => isRecord(entry) && entry.recipientType === "store" && entry.status === "completed")
        .reduce((sum: number, entry: unknown) => sum + nonNegativeCentAmount(isRecord(entry) ? entry.amount : 0), 0);
    });
    const refundStatus = refundStatuses.size === 0
      ? null
      : refundStatuses.has("processing") || refundStatuses.has("pending") || refundStatuses.has("eligible")
        ? "processing"
        : refundStatuses.has("failed") ? "failed"
          : refundStatuses.has("partially_completed") ? "partially_completed" : "completed";
    const summary: StoreOrderFinancialSummary = {
      currency: text(pricing.currency) || "usd",
      merchandiseSubtotal: merchandise / 100,
      salesTax: tax / 100,
      grossStoreAmount: gross / 100,
      liaCommission: storeAmount === null ? null : Math.max(0, gross - storeAmount) / 100,
      originalStoreEarning: storeAmount === null ? null : storeAmount / 100,
      refundedMerchandise: refundedMerchandise / 100,
      refundedSalesTax: refundedTax / 100,
      storeRefundReversal: storeReversal / 100,
      netStoreEarning: storeAmount === null ? null : Math.max(0, storeAmount - storeReversal) / 100,
      customerRefundTotal: customerRefundTotal / 100,
      refundStatus,
      settlementStatus: settlement ? text(settlement.status) || "pending" : "not_created",
      transferStatus: transfer ? text(transfer.status) || "pending" : "not_created",
    };
    return [order.id, summary];
  }));
}

/*
 * Storage upload authorization is refreshed when a store owner enters the
 * workspace. It must never block access to the dashboard, orders, or
 * settings: those callables have already independently verified ownership.
 *
 * A failed claim refresh only means the browser must retry its token refresh
 * before its next image upload. Keeping it non-blocking prevents an Auth
 * custom-claim permission/configuration issue from surfacing as a generic
 * `internal` error across every store page.
 */
async function refreshStoreUploadClaim(
  ownerId: string,
  storeId: string
): Promise<void> {
  try {
    await grantStoreUploadClaim(ownerId, storeId);
  } catch (error) {
    console.error(
      "Unable to refresh the store upload authorization claim.",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

function serialize(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  return value;
}

type StorePayoutTransfer = {
  id: string;
  data: FirebaseFirestore.DocumentData;
};

/*
 * A payment transfer keeps only the order ID. Resolve the store-owned order
 * server-side so payout detail never exposes another store's order data.
 */
async function buildStorePayoutDetails(
  storeId: string,
  transfers: StorePayoutTransfer[],
) {
  const orderReferences = [
    ...new Map(
      transfers
        .map((transfer) => text(transfer.data.orderId))
        .filter(Boolean)
        .map((orderId) => [orderId, db.collection("orders").doc(orderId)]),
    ).values(),
  ];
  const orders = orderReferences.length > 0
    ? await db.getAll(...orderReferences)
    : [];
  const orderRefunds = await refundsForOrders(
    orderReferences.map((reference) => reference.id),
  );
  const reversalByOrder = new Map<string, number>();
  orderRefunds.forEach((refund) => {
    const data = refund.data();
    const orderId = text(data.orderId);
    const reversals = Array.isArray(data.reversals) ? data.reversals.map((value: unknown) => isRecord(value) ? value : {}) : [];
    const completedStoreReversal = reversals
      .filter((reversal) => reversal.recipientType === "store" && reversal.status === "completed")
      .reduce((sum, reversal) => sum + nonNegativeCentAmount(reversal.amount), 0);
    reversalByOrder.set(
      orderId,
      (reversalByOrder.get(orderId) ?? 0) + completedStoreReversal,
    );
  });
  const orderDetailsById = new Map(
    orders
      .filter((order) => order.exists && order.data()?.store?.id === storeId)
      .map((order) => [order.id, {
        pricing: order.data()?.pricing,
        orderNumber: text(order.data()?.orderNumber) || null,
      }]),
  );

  return transfers.map((transfer) => {
    const data = transfer.data;
    const orderId = text(data.orderId);
    const order = orderDetailsById.get(orderId);
    const pricing = order?.pricing;
    const merchandiseSubtotal = nonNegativeCentAmount(pricing?.subtotalAmount);
    const salesTax = nonNegativeCentAmount(pricing?.taxAmount);
    const grossStoreOrderAmount = merchandiseSubtotal + salesTax;
    const transferAmount = nonNegativeCentAmount(data.amount);
    const reversedAmount = Math.min(
      transferAmount,
      reversalByOrder.get(orderId) ?? 0,
    );
    const netAmount = Math.max(0, transferAmount - reversedAmount);

    return {
      id: transfer.id,
      orderId,
      orderNumber: order?.orderNumber ?? null,
      amount: netAmount / 100,
      originalTransferAmount: transferAmount / 100,
      refundedAmount: reversedAmount / 100,
      netAmount: netAmount / 100,
      merchandiseSubtotal: merchandiseSubtotal / 100,
      salesTax: salesTax / 100,
      grossStoreOrderAmount: grossStoreOrderAmount / 100,
      liaCommission: Math.max(0, grossStoreOrderAmount - transferAmount) / 100,
      status: text(data.status) === "completed" ? "completed" : text(data.status) === "failed" ? "failed" : "pending",
      date: String(serialize(data.completedAt ?? data.updatedAt ?? data.createdAt) ?? ""),
      createdAt: String(serialize(data.createdAt) ?? ""),
      completedAt: String(serialize(data.completedAt) ?? ""),
      method: "Stripe Transfer",
    };
  });
}

/*
 * Convert the current date into a local calendar date for the configured
 * marketplace time zone. Earnings periods must not depend on the UTC time
 * zone of the Cloud Functions runtime.
 */
function datePartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday,
  };
}

function timeZoneOffsetMilliseconds(
  date: Date,
  timeZone: string,
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  ) - date.getTime();
}

function startOfDayInTimeZone(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(localMidnightAsUtc);

  /* Resolve the correct Central offset, including daylight-saving changes. */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    candidate = new Date(
      localMidnightAsUtc - timeZoneOffsetMilliseconds(candidate, timeZone),
    );
  }

  return candidate;
}

function percentageGrowth(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
}

function nonNegativeCentAmount(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : 0;
}

function settingsStore(data: Record<string, unknown>, id: string) {
  /*
   * Explicit owner-only allowlist. The caller has already passed
   * requireOwnedStore(), so the business registration details can be shown in
   * the owner's private settings without exposing them on a public store page.
   */
  return {
    id,
    name: text(data.name), email: text(data.email), phone: text(data.phone), description: text(data.description),
    address: text(data.address), city: text(data.city), state: text(data.state), zip: text(data.zip), country: text(data.country) || "US",
    formattedAddress: text(data.formattedAddress), latitude: typeof data.latitude === "number" ? data.latitude : 0,
    longitude: typeof data.longitude === "number" ? data.longitude : 0, placeId: text(data.placeId),
    logoUrl: text(data.logoUrl), bannerUrl: text(data.bannerUrl), category: text(data.category),
    logoImageStatus: text(data.logoImageStatus), bannerImageStatus: text(data.bannerImageStatus),
    logoImageId: text(data.logoImageId), bannerImageId: text(data.bannerImageId),
    rating: typeof data.rating === "number" ? data.rating : 0, isOpen: data.isOpen === true,
    schedule: Array.isArray(data.schedule) ? serialize(data.schedule) : [],
    isApproved: data.isApproved === true, isActive: data.isActive === true,
    businessType: text(data.businessType),
    registeredName: text(data.registeredName),
    ein: text(data.ein),
    businessStructure: text(data.businessStructure),
    storeFrontUrl: text(data.storeFrontUrl),
    storeInsideUrl: text(data.storeInsideUrl),
    orderNotifications: data.orderNotifications !== false,
    paymentNotifications: data.paymentNotifications !== false,
    productStockNotifications: data.productStockNotifications !== false,
    emailNotifications: data.emailNotifications !== false,
    pushNotifications: data.pushNotifications !== false,
    stripeAccountId: text(data.stripeAccountId),
    stripeAccountStatus: text(data.stripeAccountStatus) || "not_started",
    stripeChargesEnabled: data.stripeChargesEnabled === true,
    stripeTransfersEnabled: data.stripeTransfersEnabled === true,
    stripePayoutsEnabled: data.stripePayoutsEnabled === true,
    stripeDetailsSubmitted: data.stripeDetailsSubmitted === true,
    stripeRequiresAction: data.stripeRequiresAction === true,
    stripeIsReady: data.stripeIsReady === true,
  };
}

function settingsUser(data: Record<string, unknown>) {
  return {
    displayName: text(data.displayName), email: text(data.email), phone: text(data.phone), language: text(data.language),
  };
}

function validateSchedule(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length !== scheduleDays.length) {
    throw new HttpsError("invalid-argument", "Add each day of the week to the store schedule.");
  }
  const schedule = value.map((entry) => isRecord(entry) ? entry : {});
  const names = schedule.map((entry) => text(entry.day));
  if (new Set(names).size !== scheduleDays.length || !scheduleDays.every((day) => names.includes(day))) {
    throw new HttpsError("invalid-argument", "Include every day of the week only once.");
  }
  let hasOpenDay = false;
  for (const day of schedule) {
    const isClosed = day.isClosed === true;
    const open = text(day.open);
    const close = text(day.close);
    if (!isClosed) {
      hasOpenDay = true;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close) || close <= open) {
        throw new HttpsError("invalid-argument", "Each open day needs valid hours with a closing time after opening.");
      }
    }
  }
  if (!hasOpenDay) throw new HttpsError("invalid-argument", "Set opening hours for at least one day.");
  return schedule.map((day) => ({ day: text(day.day), open: text(day.open), close: text(day.close), isClosed: day.isClosed === true }));
}

async function geocode(address: string) {
  const response = await fetch("https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(address) + "&key=" + encodeURIComponent(googleMapsApiKey.value()));
  if (!response.ok) return null;
  const body = await response.json() as { status?: unknown; results?: Array<{ formatted_address?: unknown; place_id?: unknown; geometry?: { location?: { lat?: unknown; lng?: unknown } } }> };
  const result = body.status === "OK" ? body.results?.[0] : null;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  return typeof latitude === "number" && typeof longitude === "number"
    ? { latitude, longitude, formattedAddress: text(result?.formatted_address) || address, placeId: text(result?.place_id) || null }
    : null;
}

export const getStoreWorkspaceSettings = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open store settings.");
  const [store, user] = await Promise.all([requireApprovedStore(request.auth.uid), db.collection("users").doc(request.auth.uid).get()]);
  await refreshStoreUploadClaim(request.auth.uid, store.id);
  return { store: settingsStore(store.data() ?? {}, store.id), user: settingsUser(user.data() ?? {}) };
});

export const getStoreWorkspaceEntry = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open the store app.");
  const user = await db.collection("users").doc(request.auth.uid).get();
  const accountType = user.data()?.accountType;
  if (accountType !== "store_owner" && accountType !== "store_staff") throw new HttpsError("permission-denied", "Only authorized store users can access this workspace.");
  try {
    const resolved = accountType === "store_staff" ? await requireStoreWorkspaceAccess(request.auth.uid) : null;
    const store = resolved?.store ?? await requireOwnedStore(request.auth.uid);
    const access = resolved?.access ?? {uid: request.auth.uid, storeId: store.id, ownerId: request.auth.uid, role: "owner" as const, permissions: {orders: "write" as const, products: "write" as const}};
    if (access.role === "owner" || access.permissions.products === "write") {
      await refreshStoreUploadClaim(request.auth.uid, store.id);
    }
    const data = store.data() ?? {};
    const applicationReview = isRecord(data.applicationReview) ? data.applicationReview : {};
    const suspension = isRecord(data.suspension) ? data.suspension : {};
    const performance = await store.ref.collection("reporting").doc("lifetime").get();
    const canSeeOrders = access.role === "owner" || Boolean(access.permissions.orders);
    const pendingOrderCount = !canSeeOrders ? 0 : performance.exists
      ? nonNegativeCentAmount(performance.data()?.activeOrders)
      : (await db.collection("orders")
        .where("store.id", "==", store.id)
        .where("checkoutStatus", "==", "confirmed")
        .where("payment.status", "==", "paid")
        .where("status", "in", ["pending", "accepted", "preparing", "ready_for_pickup"])
        .count()
        .get()).data().count;
    return {
      hasStore: true,
      store: {
        id: store.id,
        name: text(data.name) || "Your Store",
        logoUrl: text(data.logoUrl),
        isApproved: data.isApproved === true,
        isActive: data.isActive === true,
        onboardingCompleted: data.onboardingCompleted === true,
        onboardingStep: text(data.onboardingStep) || "owner",
        status: text(data.status) || "draft",
        rejectionReason: text(applicationReview.reason) || null,
        suspensionReason: text(suspension.reason) || null,
        approvalRevoked: Boolean(data.approvalRevokedAt),
      },
      pendingOrderCount,
      access,
    };
  } catch (error) {
    if (error instanceof HttpsError && error.code === "not-found") {
      return { hasStore: false, store: null, pendingOrderCount: 0 };
    }
    throw error;
  }
});

/*
 * Store orders are private operational records. Return only confirmed orders
 * after deriving the store from the authenticated owner; the browser never
 * queries orders/{orderId} or orders by store ID directly.
 */
export const getStoreWorkspaceOrders = onCall({region: "us-central1", timeoutSeconds: 300}, async (request) => {
  const startedAt = Date.now();
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store orders.");
  const input = isRecord(request.data) ? request.data : {};
  const requestedSize = Number(input.pageSize);
  const pageSize = Number.isInteger(requestedSize) ? Math.min(Math.max(requestedSize, 1), 50) : 25;
  const status = text(input.status);
  const search = normalizeCatalogSearchText(text(input.search));
  const from = storedDate(input.from);
  const to = storedDate(input.to);
  const {store, access} = await requireStoreWorkspaceAccess(request.auth.uid, "orders", "read");
  await enforceCallableAbuseProtection({
    operation: search ? "store-order-search" : "store-order-history",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: search ? 60 : 180,
    windowSeconds: 600,
  });
  const searchToken = search.length >= 2 ? search.slice(0, 40) : "";
  const cursor = text(input.cursor);
  /*
   * Browsing order history must never wait for a legacy search migration.
   * New orders receive search tokens when they are created. Only a deliberate
   * text search can request the bounded one-time backfill for older orders.
   */
  if (searchToken) await ensureStoreOrderIndex(store);
  const preparedAt = Date.now();
  let query: FirebaseFirestore.Query = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed")
    .where("payment.status", "==", "paid");
  if (storeOrderStatuses.includes(status as typeof storeOrderStatuses[number])) query = query.where("status", "==", status);
  if (searchToken) query = query.where("storeSearchTokens", "array-contains", searchToken);
  if (from) query = query.where("payment.paidAt", ">=", from);
  if (to) query = query.where("payment.paidAt", "<=", to);
  query = query.orderBy("payment.paidAt", "desc").limit(pageSize);
  if (cursor) {
    const cursorOrder = await db.collection("orders").doc(cursor).get();
    if (!cursorOrder.exists || cursorOrder.data()?.store?.id !== store.id) {
      throw new HttpsError("invalid-argument", "The order-history cursor is invalid.");
    }
    query = query.startAfter(cursorOrder);
  }
  const [orders, stats] = await Promise.all([query.get(), storeOrderCounts(store.id)]);
  const ordersLoadedAt = Date.now();
  const financials = access.role === "owner" ? await storeOrderFinancialSummaries(store.id, orders.docs) : new Map<string, unknown>();
  const completedAt = Date.now();

  console.info("Store order history loaded.", {
    storeId: store.id,
    resultCount: orders.size,
    search: Boolean(searchToken),
    preparationMs: preparedAt - startedAt,
    orderAndCountMs: ordersLoadedAt - preparedAt,
    financialSummaryMs: completedAt - ordersLoadedAt,
    totalMs: completedAt - startedAt,
  });

  return {
    orders: orders.docs.map((order) => ({
      id: order.id,
      ...(serialize(order.data()) as Record<string, unknown>),
      storeFinancials: financials.get(order.id),
    })),
    stats,
    nextCursor: orders.size === pageSize ? orders.docs.at(-1)?.id ?? null : null,
  };
});

export const getStoreWorkspaceOrder = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view a store order.");
  const input = isRecord(request.data) ? request.data : {};
  const orderId = text(input.orderId);
  if (!orderId || orderId.includes("/")) throw new HttpsError("invalid-argument", "A valid order ID is required.");

  const {store, access} = await requireStoreWorkspaceAccess(request.auth.uid, "orders", "read");
  const order = await db.collection("orders").doc(orderId).get();
  if (!order.exists || order.data()?.checkoutStatus !== "confirmed" || order.data()?.payment?.status !== "paid" || order.data()?.store?.id !== store.id) {
    throw new HttpsError("not-found", "The order could not be found.");
  }
  await enforceCallableAbuseProtection({operation: "store-order-detail", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 240, windowSeconds: 600});
  const financials = access.role === "owner" ? await storeOrderFinancialSummaries(store.id, [order]) : new Map<string, unknown>();

  return {
    order: {
      id: order.id,
      ...(serialize(order.data()) as Record<string, unknown>),
      storeFinancials: financials.get(order.id),
    },
  };
});

/* Dashboard aggregates are computed server-side from confirmed orders and
 * completed store transfer obligations, never from customer checkout totals. */
export const getStoreWorkspaceDashboard = onCall({region: "us-central1", timeoutSeconds: 300}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view the store dashboard.");
  await enforceCallableAbuseProtection({operation: "store-dashboard", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 240, windowSeconds: 3_600});
  const store = await requireApprovedStore(request.auth.uid);
  await ensureStoreOrderIndex(store);
  const storeData = store.data() ?? {};
  const timeZone = await storeTimeZone(store);
  const week = storeAnalyticsRange("week", timeZone);
  const nowParts = datePartsInTimeZone(new Date(), timeZone);
  const todayStart = startOfDayInTimeZone(nowParts.year, nowParts.month, nowParts.day, timeZone);
  const tomorrowDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
  const tomorrowStart = startOfDayInTimeZone(tomorrowDate.getUTCFullYear(), tomorrowDate.getUTCMonth() + 1, tomorrowDate.getUTCDate(), timeZone);
  const confirmedOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed")
    .where("payment.status", "==", "paid");
  const [lifetime, currentWeek, previousWeek, today, customerCount, recentOrders] = await Promise.all([
    lifetimePerformance(store),
    periodPerformance(store, week.start, week.end, timeZone),
    periodPerformance(store, week.previousStart, week.previousEnd, timeZone),
    periodPerformance(store, todayStart, tomorrowStart, timeZone),
    store.ref.collection("customers").count().get(),
    confirmedOrders.orderBy("payment.paidAt", "desc").limit(4).get(),
  ]);
  const recentFinancials = await storeOrderFinancialSummaries(store.id, recentOrders.docs);
  const recent = recentOrders.docs.map((order) => order.data());
  const growth = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const lifetimeNetEarnings = Math.max(0, lifetime.grossStoreEntitlement - lifetime.storeRefundImpact);
  const weekNetEarnings = Math.max(0, currentWeek.totals.grossStoreEntitlement - currentWeek.totals.storeRefundImpact);
  const previousWeekNetEarnings = Math.max(0, previousWeek.totals.grossStoreEntitlement - previousWeek.totals.storeRefundImpact);

  return {
    storeName: text(storeData.name) || "Your Store",
    timeZone,
    stats: {
      totalOrders: lifetime.paidOrders,
      netStoreEarnings: lifetimeNetEarnings / 100,
      currentWeekNetEarnings: weekNetEarnings / 100,
      refundDeductions: lifetime.storeRefundImpact / 100,
      totalCustomers: customerCount.data().count,
      averageRating: typeof storeData.rating === "number" ? storeData.rating : 0,
      pendingOrders: lifetime.pendingOrders,
      activeOrders: lifetime.activeOrders,
      todayOrders: today.totals.paidOrders,
      weeklyGrowth: growth(currentWeek.totals.paidOrders, previousWeek.totals.paidOrders),
      earningsGrowth: growth(weekNetEarnings, previousWeekNetEarnings),
    },
    recentOrders: recent.map((order, index) => {
      const orderId = recentOrders.docs[index].id;
      const financials = recentFinancials.get(orderId);
      const grossStoreOrderAmount = financials?.grossStoreAmount ?? (
        nonNegativeCentAmount(order.pricing?.subtotalAmount) +
        nonNegativeCentAmount(order.pricing?.taxAmount)
      ) / 100;
      return {
      id: orderId,
      customerName: text(isRecord(order.customer) ? order.customer.name : "") || "Customer",
      grossStoreOrderAmount,
      displayStoreAmount: financials?.netStoreEarning ?? grossStoreOrderAmount,
      amountType: financials?.netStoreEarning === null || financials?.netStoreEarning === undefined ? "gross" : "net",
      status: text(order.status) || "pending",
      paidAt: serialize(isRecord(order.payment) ? order.payment.paidAt : null) as string,
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
    };}),
  };
});

export const getStoreWorkspaceFinancials = onCall({
  region: "us-central1",
  timeoutSeconds: 300,
  secrets: [stripeSecretKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store financials.");
  await enforceCallableAbuseProtection({
    operation: "store-financials",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: 120,
    windowSeconds: 3_600,
  });
  const store = await requireApprovedStore(request.auth.uid);
  const data = store.data() ?? {};
  const timeZone = await storeTimeZone(store);
  const week = storeAnalyticsRange("week", timeZone);
  const month = storeAnalyticsRange("month", timeZone);
  const transfers = db.collection("paymentTransfers")
    .where("recipient.id", "==", store.id)
    .where("recipient.type", "==", "store");
  const [
    lifetime,
    weekly,
    monthly,
    pendingTransfers,
    transferHistory,
  ] = await Promise.all([
    lifetimePerformance(store),
    periodPerformance(store, week.start, week.end, timeZone).then((result) => result.totals),
    periodPerformance(store, month.start, month.end, timeZone).then((result) => result.totals),
    transfers.where("status", "in", ["pending", "eligible", "processing"]).aggregate({ total: AggregateField.sum("amount") }).get(),
    /* The earnings dashboard previews only the ten most recent payouts. */
    transfers.orderBy("updatedAt", "desc").limit(10).get(),
  ]);
  const totalEarnings = Math.max(0, lifetime.grossStoreEntitlement - lifetime.storeRefundImpact) / 100;
  const pendingBalance = (pendingTransfers.data().total ?? 0) / 100;
  const transferRows = transferHistory.docs.map((transfer) => ({
    id: transfer.id,
    data: transfer.data(),
  }));
  const payouts = await buildStorePayoutDetails(store.id, transferRows);
  const stripeAccountId = text(data.stripeAccountId);
  let stripeAvailableBalance: number | null = null;
  let stripePendingBalance: number | null = null;
  if (stripeAccountId && data.stripeIsReady === true) {
    const balance = await new Stripe(stripeSecretKey.value()).balance.retrieve(
      {},
      {stripeAccount: stripeAccountId},
    );
    stripeAvailableBalance = balance.available
      .filter((entry) => entry.currency === "usd")
      .reduce((sum, entry) => sum + entry.amount, 0) / 100;
    stripePendingBalance = balance.pending
      .filter((entry) => entry.currency === "usd")
      .reduce((sum, entry) => sum + entry.amount, 0) / 100;
  }

  return {
    earnings: {
      totalEarnings,
      grossStoreEarnings: lifetime.grossStoreEntitlement / 100,
      storeCommission: lifetime.storeCommission / 100,
      refundDeductions: lifetime.storeRefundImpact / 100,
      grossMerchandiseSales: lifetime.grossMerchandise / 100,
      salesTax: lifetime.salesTax / 100,
      availableBalance: stripeAvailableBalance,
      stripePendingBalance,
      pendingBalance,
      weeklyEarnings: Math.max(0, weekly.grossStoreEntitlement - weekly.storeRefundImpact) / 100,
      monthlyEarnings: Math.max(0, monthly.grossStoreEntitlement - monthly.storeRefundImpact) / 100,
      timeZone,
      stripe: {
        accountId: stripeAccountId || null,
        status: text(data.stripeAccountStatus) || "not_started",
        isReady: data.stripeIsReady === true,
        payoutsEnabled: data.stripePayoutsEnabled === true,
        requiresAction: data.stripeRequiresAction === true,
      },
      stripeProcessingFeesPaidBy: "lia_platform",
      payouts,
    },
  };
});

function storedDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

async function storeTimeZone(store: FirebaseFirestore.DocumentSnapshot): Promise<string> {
  const zoneId = text(store.data()?.homeZoneId);
  if (!zoneId) return PLATFORM_REPORTING_TIME_ZONE;
  const zone = await db.collection("deliveryZones").doc(zoneId).get();
  const candidate = text(zone.data()?.timeZone);
  try {
    new Intl.DateTimeFormat("en-US", {timeZone: candidate}).format();
    return candidate;
  } catch {
    return PLATFORM_REPORTING_TIME_ZONE;
  }
}

type StorePerformanceTotals = {
  paidOrders: number; deliveredOrders: number; cancelledOrders: number;
  openOrders: number; pendingOrders: number; activeOrders: number;
  grossMerchandise: number; salesTax: number; grossStoreEntitlement: number;
  storeCommission: number; refundedMerchandise: number; refundedSalesTax: number;
  storeRefundImpact: number; customerRefundTotal: number; refundCount: number;
  peakHours: number[]; productSales: Record<string, {name: string; sales: number}>;
  customerIds: Set<string>;
};

const performanceNumberFields = [
  "paidOrders", "deliveredOrders", "cancelledOrders", "openOrders",
  "pendingOrders", "activeOrders", "grossMerchandise", "salesTax",
  "grossStoreEntitlement", "storeCommission", "refundedMerchandise",
  "refundedSalesTax", "storeRefundImpact", "customerRefundTotal", "refundCount",
] as const;

function emptyPerformanceTotals(): StorePerformanceTotals {
  return {
    paidOrders: 0, deliveredOrders: 0, cancelledOrders: 0, openOrders: 0,
    pendingOrders: 0, activeOrders: 0, grossMerchandise: 0, salesTax: 0,
    grossStoreEntitlement: 0, storeCommission: 0, refundedMerchandise: 0,
    refundedSalesTax: 0, storeRefundImpact: 0, customerRefundTotal: 0,
    refundCount: 0, peakHours: Array(24).fill(0), productSales: {}, customerIds: new Set(),
  };
}

function addPerformanceDocument(target: StorePerformanceTotals, data: Record<string, unknown>) {
  performanceNumberFields.forEach((field) => { target[field] += nonNegativeCentAmount(data[field]); });
  const hours = Array.isArray(data.peakHours) ? data.peakHours : [];
  hours.slice(0, 24).forEach((value, index) => { target.peakHours[index] += nonNegativeCentAmount(value); });
  const products = isRecord(data.productSales) ? data.productSales : {};
  Object.entries(products).forEach(([id, value]) => {
    const item = isRecord(value) ? value : {};
    const existing = target.productSales[id] ?? {name: text(item.name) || "Product", sales: 0};
    existing.name = text(item.name) || existing.name;
    existing.sales += nonNegativeCentAmount(item.sales);
    target.productSales[id] = existing;
  });
  const customers = isRecord(data.customerOrderCounts) ? data.customerOrderCounts : {};
  Object.keys(customers).forEach((id) => target.customerIds.add(id));
}

const initializedPerformanceStores = new Set<string>();
const performanceBackfills = new Map<string, Promise<number>>();
async function ensureStorePerformanceSummary(store: FirebaseFirestore.DocumentSnapshot) {
  if (store.data()?.performanceSummaryVersion === 1 || initializedPerformanceStores.has(store.id)) return;
  let backfill = performanceBackfills.get(store.id);
  if (!backfill) {
    backfill = backfillStorePerformanceSummaries(store.id);
    performanceBackfills.set(store.id, backfill);
  }
  try {
    await backfill;
    initializedPerformanceStores.add(store.id);
  } finally {
    performanceBackfills.delete(store.id);
  }
}

async function lifetimePerformance(store: FirebaseFirestore.DocumentSnapshot) {
  await ensureStorePerformanceSummary(store);
  const snapshot = await store.ref.collection("reporting").doc("lifetime").get();
  const totals = emptyPerformanceTotals();
  if (snapshot.exists) addPerformanceDocument(totals, snapshot.data() ?? {});
  return totals;
}

async function periodPerformance(
  store: FirebaseFirestore.DocumentSnapshot,
  start: Date,
  end: Date,
  timeZone: string,
) {
  await ensureStorePerformanceSummary(store);
  const startDay = localDateKey(start, timeZone, false);
  const endDay = localDateKey(end, timeZone, false);
  const snapshot = await store.ref.collection("dailyPerformance")
    .where(FieldPath.documentId(), ">=", startDay)
    .where(FieldPath.documentId(), "<", endDay)
    .get();
  const totals = emptyPerformanceTotals();
  snapshot.docs.forEach((document) => addPerformanceDocument(totals, document.data()));
  return {totals, documents: snapshot.docs};
}

async function documentsByReferences(references: FirebaseFirestore.DocumentReference[]) {
  const documents: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let index = 0; index < references.length; index += 300) {
    documents.push(...await db.getAll(...references.slice(index, index + 300)));
  }
  return documents;
}

async function refundsForOrders(orderIds: string[]) {
  const refunds: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let index = 0; index < orderIds.length; index += 30) {
    const ids = orderIds.slice(index, index + 30);
    if (ids.length === 0) continue;
    const result = await db.collection("paymentRefunds").where("orderId", "in", ids).get();
    refunds.push(...result.docs);
  }
  return refunds;
}

/* Calendar-period analytics use one paid-order cohort and immutable financial records. */
export const getStoreWorkspaceAnalytics = onCall({region: "us-central1", timeoutSeconds: 300}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store analytics.");
  const input = isRecord(request.data) ? request.data : {};
  const requestedPeriod = text(input.period);
  const period: StoreAnalyticsPeriod = requestedPeriod === "month" || requestedPeriod === "year" ? requestedPeriod : "week";
  const store = await requireApprovedStore(request.auth.uid);
  const timeZone = await storeTimeZone(store);
  const {start, end, previousStart, previousEnd} = storeAnalyticsRange(period, timeZone);
  const completedTransfers = db.collection("paymentTransfers")
    .where("recipient.id", "==", store.id)
    .where("recipient.type", "==", "store")
    .where("status", "==", "completed");
  const [current, previous, completedPayouts] = await Promise.all([
    periodPerformance(store, start, end, timeZone),
    periodPerformance(store, previousStart, previousEnd, timeZone),
    completedTransfers.where("completedAt", ">=", start.toISOString()).where("completedAt", "<", end.toISOString()).aggregate({total: AggregateField.sum("amount")}).get(),
  ]);
  const buckets = new Map<string, number>();
  current.documents.forEach((document) => {
    const data = document.data();
    const key = period === "year" ? document.id.slice(0, 7) : document.id;
    buckets.set(key, (buckets.get(key) ?? 0) + nonNegativeCentAmount(data.paidOrders));
  });

  const series: Array<{label: string; value: number}> = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const key = localDateKey(cursor, timeZone, period === "year");
    if (!series.some((entry) => entry.label === key)) series.push({label: key, value: buckets.get(key) ?? 0});
    if (period === "year") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const accounting = current.totals;
  const previousAccounting = previous.totals;
  const orderCount = accounting.paidOrders;
  const netMerchandise = Math.max(0, accounting.grossMerchandise - accounting.refundedMerchandise);
  const netStoreEarnings = Math.max(0, accounting.grossStoreEntitlement - accounting.storeRefundImpact);
  const previousNetStoreEarnings = Math.max(0, previousAccounting.grossStoreEntitlement - previousAccounting.storeRefundImpact);

  return {
    period,
    timeZone,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    totalOrders: orderCount,
    completedOrders: accounting.deliveredOrders,
    cancelledOrders: accounting.cancelledOrders,
    openOrders: accounting.openOrders,
    grossMerchandiseSales: accounting.grossMerchandise / 100,
    refundedMerchandise: accounting.refundedMerchandise / 100,
    netMerchandiseSales: netMerchandise / 100,
    salesTax: accounting.salesTax / 100,
    refundedSalesTax: accounting.refundedSalesTax / 100,
    netSalesTax: Math.max(0, accounting.salesTax - accounting.refundedSalesTax) / 100,
    storeCommission: accounting.storeCommission / 100,
    grossStoreEarnings: accounting.grossStoreEntitlement / 100,
    storeRefundImpact: accounting.storeRefundImpact / 100,
    netStoreEarnings: netStoreEarnings / 100,
    completedPayouts: (completedPayouts.data().total ?? 0) / 100,
    customerRefundTotal: accounting.customerRefundTotal / 100,
    refundCount: accounting.refundCount,
    averageOrderValue: orderCount ? netMerchandise / orderCount / 100 : 0,
    totalCustomers: accounting.customerIds.size,
    averageRating: typeof store.data()?.rating === "number" ? store.data()?.rating : 0,
    peakHours: accounting.peakHours,
    orderSeries: series,
    orderGrowth: percentageGrowth(orderCount, previousAccounting.paidOrders),
    revenueGrowth: percentageGrowth(netStoreEarnings, previousNetStoreEarnings),
    topProducts: Object.values(accounting.productSales).sort((left, right) => right.sales - left.sales).slice(0, 5),
  };
});

/*
 * Payout history is paginated so a long-running store account does not load
 * every transfer when it opens its earnings page. The cursor is verified
 * against the authenticated owner's store before it is used.
 */
export const getStoreWorkspacePayouts = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store payouts.");

  const input = isRecord(request.data) ? request.data : {};
  const requestedPageSize = Number(input.pageSize);
  const pageSize = Number.isInteger(requestedPageSize)
    ? Math.min(Math.max(requestedPageSize, 1), 50)
    : 25;
  const cursor = text(input.cursor);
  const store = await requireApprovedStore(request.auth.uid);
  let query = db.collection("paymentTransfers")
    .where("recipient.id", "==", store.id)
    .where("recipient.type", "==", "store")
    .orderBy("updatedAt", "desc")
    .limit(pageSize);

  if (cursor) {
    const cursorTransfer = await db.collection("paymentTransfers").doc(cursor).get();
    if (
      !cursorTransfer.exists ||
      cursorTransfer.data()?.recipient?.id !== store.id ||
      cursorTransfer.data()?.recipient?.type !== "store"
    ) {
      throw new HttpsError("invalid-argument", "The payout history cursor is invalid.");
    }
    query = query.startAfter(cursorTransfer);
  }

  const result = await query.get();
  const payouts = await buildStorePayoutDetails(
    store.id,
    result.docs.map((transfer) => ({ id: transfer.id, data: transfer.data() })),
  );

  return {
    payouts,
    nextCursor: result.size === pageSize
      ? result.docs.at(-1)?.id ?? null
      : null,
  };
});

export const saveStoreWorkspaceSettings = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save store settings.");
  await enforceCallableAbuseProtection({
    operation: "store-settings-save",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: 60,
    windowSeconds: 3_600,
  });
  const payload = isRecord(request.data) ? request.data : {};
  const section = text(payload.section);
  if (!["profile", "business", "notifications"].includes(section)) {
    throw new HttpsError("invalid-argument", "Choose a valid settings section to save.");
  }
  const storeInput = isRecord(payload.store) ? payload.store : {};
  const userInput = isRecord(payload.user) ? payload.user : {};
  const store = await requireApprovedStore(request.auth.uid);
  const existing = store.data() ?? {};
  const updates: Record<string, unknown> = {updatedAt: FieldValue.serverTimestamp()};
  const userUpdates: Record<string, unknown> = {updatedAt: FieldValue.serverTimestamp()};

  if (section === "profile") {
  const name = requiredText(storeInput.name, "Store name", 120);
  const email = requiredText(storeInput.email, "Store email", 254).toLowerCase();
  const phone = requiredText(storeInput.phone, "Phone number", 30);
  const description = requiredText(storeInput.description, "Store description", 1_500);
  const address = requiredText(storeInput.address, "Street address", 200);
  const city = requiredText(storeInput.city, "City", 100);
  const state = normalizeState(text(storeInput.state));
  const zip = requiredText(storeInput.zip, "ZIP code", 10);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !state || !/^\d{5}(?:-\d{4})?$/.test(zip)) {
    throw new HttpsError("invalid-argument", "Complete all store details with a valid email and two-letter state.");
  }
    Object.assign(updates, {name, email, phone, description});
    Object.assign(userUpdates, {
      displayName: text(userInput.displayName),
      phone: text(userInput.phone),
      language: text(userInput.language),
    });

    const normalizedAddress = upper(address);
    const normalizedCity = upper(city);
    const normalizedZip = upper(zip);
    const addressChanged = hasStoreAddressChanged(existing, {
      address: normalizedAddress,
      city: normalizedCity,
      state,
      zip: normalizedZip,
    });

    if (addressChanged) {
      await enforceCallableAbuseProtection({
        operation: "store-settings-address-geocode",
        uid: request.auth.uid,
        appCheckVerified: Boolean(request.app),
        maximumRequests: 10,
        windowSeconds: 3_600,
      });
      const location = await geocode(`${address}, ${city}, ${state} ${zip}`);
      if (!location) throw new HttpsError("invalid-argument", "We could not verify the store address.");
      const zone = await resolveDeliveryZoneForAddress(city, state, zip, location.placeId);
      const hasAdminZoneOverride = text(existing.zoneAssignmentSource) === "admin";
      Object.assign(updates, {
        address: normalizedAddress, city: normalizedCity, state, zip: normalizedZip, country: "US",
        formattedAddress: upper(location.formattedAddress), latitude: location.latitude, longitude: location.longitude,
        placeId: location.placeId,
        ...(hasAdminZoneOverride ? {
          zoneReviewRequired: true,
          suggestedHomeZoneId: zone?.id ?? null,
          suggestedHomeZoneName: zone?.name ?? null,
        } : {
          homeZoneId: zone?.id ?? null,
          homeZoneName: zone?.name ?? null,
          zoneAssignmentSource: "automatic",
          zoneReviewRequired: false,
        }),
      });
    }
  } else if (section === "business") {
    const businessType = text(storeInput.businessType);
    const registeredName = requiredText(storeInput.registeredName, "Registered business name", 160);
    const businessStructure = text(storeInput.businessStructure);
    const ein = normalizeEin(text(storeInput.ein));
    if (!businessTypes.has(businessType) || !registeredName || !businessStructures.has(businessStructure) || ein === null) {
      throw new HttpsError("invalid-argument", "Complete valid business information. An EIN must use the format 00-0000000.");
    }
    Object.assign(updates, {businessType, registeredName, ein, businessStructure});
  } else {
    Object.assign(updates, {
      orderNotifications: storeInput.orderNotifications !== false,
      paymentNotifications: storeInput.paymentNotifications !== false,
      productStockNotifications: storeInput.productStockNotifications !== false,
      emailNotifications: storeInput.emailNotifications !== false,
      pushNotifications: storeInput.pushNotifications !== false,
    });
  }

  const changedFields = Object.keys(updates).filter((field) => field !== "updatedAt" && existing[field] !== updates[field]);
  const batch = db.batch();
  batch.update(store.ref, updates as UpdateData<DocumentData>);
  if (section === "profile") {
    batch.set(db.collection("users").doc(request.auth.uid), userUpdates, {merge: true});
  }
  batch.create(store.ref.collection("settingsAuditLogs").doc(), settingsAuditData({
    storeId: store.id,
    actorUid: request.auth.uid,
    action: `settings_${section}_updated`,
    changedFields,
  }));
  await batch.commit();
  const [updatedStore, updatedUser] = await Promise.all([store.ref.get(), db.collection("users").doc(request.auth.uid).get()]);
  return { store: settingsStore(updatedStore.data() ?? {}, store.id), user: settingsUser(updatedUser.data() ?? {}) };
});

export const saveStoreWorkspaceSchedule = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save store hours.");
  await enforceCallableAbuseProtection({operation: "store-schedule-save", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 30, windowSeconds: 3_600});
  const schedule = validateSchedule(isRecord(request.data) ? request.data.schedule : undefined);
  const store = await requireApprovedStore(request.auth.uid);
  const batch = db.batch();
  batch.update(store.ref, { schedule, updatedAt: FieldValue.serverTimestamp() });
  batch.create(store.ref.collection("settingsAuditLogs").doc(), settingsAuditData({
    storeId: store.id,
    actorUid: request.auth.uid,
    action: "settings_schedule_updated",
    changedFields: ["schedule"],
  }));
  await batch.commit();
  return { schedule };
});

export const getStoreSettingsAudit = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store activity.");
  const store = await requireApprovedStore(request.auth.uid);
  const snapshot = await store.ref.collection("settingsAuditLogs").orderBy("createdAt", "desc").limit(25).get();
  return {entries: snapshot.docs.map((entry) => ({
    id: entry.id,
    action: text(entry.data().action),
    changedFields: Array.isArray(entry.data().changedFields) ? entry.data().changedFields.filter((field: unknown): field is string => typeof field === "string") : [],
    createdAt: entry.data().createdAt?.toDate?.().toISOString?.() ?? null,
  }))};
});
