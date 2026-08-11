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
import {
  AggregateField,
  FieldValue,
  getFirestore,
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

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const scheduleDays = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
const businessTypes = new Set([
  "grocery",
  "market",
  "specialty_food",
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

async function requireOwnedStore(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can access this workspace.");
  }
  if (["deletion_pending", "deletion_processing"].includes(user.data()?.accountDeletionState)) {
    throw new HttpsError("permission-denied", "Your account deletion request is under review. Store account access is unavailable.");
  }

  const storedId = text(user.data()?.storeId);
  if (storedId) {
    const store = await db.collection("stores").doc(storedId).get();
    if (store.exists && store.data()?.ownerId === uid) return store;
  }

  const stores = await db.collection("stores").where("ownerId", "==", uid).limit(1).get();
  const store = stores.docs[0];
  if (!store) throw new HttpsError("not-found", "No store was found for this account.");
  return store;
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

    return {
      id: transfer.id,
      orderId,
      orderNumber: order?.orderNumber ?? null,
      amount: transferAmount / 100,
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

function currentEarningsPeriodStarts(): {
  weekStart: Date;
  monthStart: Date;
} {
  const timeZone = PLATFORM_REPORTING_TIME_ZONE;
  const now = datePartsInTimeZone(new Date(), timeZone);
  const weekdayOffset: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const localToday = new Date(Date.UTC(now.year, now.month - 1, now.day));
  localToday.setUTCDate(
    localToday.getUTCDate() - (weekdayOffset[now.weekday] ?? 0),
  );

  return {
    weekStart: startOfDayInTimeZone(
      localToday.getUTCFullYear(),
      localToday.getUTCMonth() + 1,
      localToday.getUTCDate(),
      timeZone,
    ),
    monthStart: startOfDayInTimeZone(
      now.year,
      now.month,
      1,
      timeZone,
    ),
  };
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
  const [store, user] = await Promise.all([requireOwnedStore(request.auth.uid), db.collection("users").doc(request.auth.uid).get()]);
  await refreshStoreUploadClaim(request.auth.uid, store.id);
  return { store: settingsStore(store.data() ?? {}, store.id), user: settingsUser(user.data() ?? {}) };
});

export const getStoreWorkspaceEntry = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open the store app.");
  const user = await db.collection("users").doc(request.auth.uid).get();
  if (user.data()?.accountType !== "store_owner") throw new HttpsError("permission-denied", "Only store owners can access this workspace.");
  try {
    const store = await requireOwnedStore(request.auth.uid);
    await refreshStoreUploadClaim(request.auth.uid, store.id);
    const data = store.data() ?? {};
    const orders = await db.collection("orders")
      .where("store.id", "==", store.id)
      .where("checkoutStatus", "==", "confirmed")
      .where("status", "in", ["pending", "accepted", "preparing", "ready_for_pickup"])
      .get();
    const pendingOrderCount = orders.size;
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
      },
      pendingOrderCount,
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
export const getStoreWorkspaceOrders = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store orders.");
  const store = await requireOwnedStore(request.auth.uid);
  const orders = await db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return {
    orders: orders.docs.map((order) => ({
      id: order.id,
      ...(serialize(order.data()) as Record<string, unknown>),
    })),
  };
});

export const getStoreWorkspaceOrder = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view a store order.");
  const input = isRecord(request.data) ? request.data : {};
  const orderId = text(input.orderId);
  if (!orderId || orderId.includes("/")) throw new HttpsError("invalid-argument", "A valid order ID is required.");

  const store = await requireOwnedStore(request.auth.uid);
  const order = await db.collection("orders").doc(orderId).get();
  if (!order.exists || order.data()?.checkoutStatus !== "confirmed" || order.data()?.store?.id !== store.id) {
    throw new HttpsError("not-found", "The order could not be found.");
  }

  return {
    order: {
      id: order.id,
      ...(serialize(order.data()) as Record<string, unknown>),
    },
  };
});

/* Dashboard aggregates are computed server-side from confirmed orders and
 * completed store transfer obligations, never from customer checkout totals. */
export const getStoreWorkspaceDashboard = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view the store dashboard.");
  const store = await requireOwnedStore(request.auth.uid);
  const storeData = store.data() ?? {};
  const confirmedOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed");
  const activeOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed")
    .where("status", "in", ["pending", "accepted", "preparing", "ready_for_pickup"]);

  const [orderCount, pendingCount, recentOrders, completedTransfers] = await Promise.all([
    confirmedOrders.count().get(),
    activeOrders.count().get(),
    confirmedOrders.orderBy("createdAt", "desc").limit(4).get(),
    db.collection("paymentTransfers")
      .where("recipient.id", "==", store.id)
      .where("recipient.type", "==", "store")
      .where("status", "==", "completed")
      .aggregate({ total: AggregateField.sum("amount") })
      .get(),
  ]);

  const totalRevenueCents = completedTransfers.data().total ?? 0;
  const recent = recentOrders.docs.map((order) => order.data());
  const customerIds = new Set(recent.map((order) => text(isRecord(order.customer) ? order.customer.uid : "")).filter(Boolean));

  return {
    storeName: text(storeData.name) || "Your Store",
    stats: {
      totalOrders: orderCount.data().count,
      totalRevenue: totalRevenueCents / 100,
      totalCustomers: customerIds.size,
      averageRating: typeof storeData.rating === "number" ? storeData.rating : 0,
      pendingOrders: pendingCount.data().count,
      todayOrders: recent.filter((order) => {
        const createdAt = order.createdAt?.toDate?.();
        return createdAt instanceof Date && createdAt.toDateString() === new Date().toDateString();
      }).length,
      weeklyGrowth: 0,
      revenueGrowth: 0,
    },
    recentOrders: recent.map((order, index) => ({
      id: recentOrders.docs[index].id,
      customerName: text(isRecord(order.customer) ? order.customer.name : "") || "Customer",
      /*
       * Recent Orders shows the same gross store order amount as the store
       * order-detail page: merchandise subtotal plus sales tax. This is not
       * the eventual transfer amount, which is shown separately in Earnings
       * after LIA's merchandise commission is applied.
       */
      storeTotal:
        (typeof order.pricing?.subtotal === "number"
          ? order.pricing.subtotal
          : 0) +
        (typeof order.pricing?.tax === "number"
          ? order.pricing.tax
          : 0),
      status: text(order.status) || "pending",
      createdAt: serialize(order.createdAt) as string,
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
    })),
  };
});

export const getStoreWorkspaceFinancials = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store financials.");
  const store = await requireOwnedStore(request.auth.uid);
  const transfers = db.collection("paymentTransfers")
    .where("recipient.id", "==", store.id)
    .where("recipient.type", "==", "store");
  const confirmedOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed");
  const completedStoreTransfers = transfers.where("status", "==", "completed");
  const { weekStart, monthStart } = currentEarningsPeriodStarts();

  const [
    completedTransfers,
    pendingTransfers,
    weeklyTransfers,
    monthlyTransfers,
    transferHistory,
    orderCount,
    recentOrders,
  ] = await Promise.all([
    completedStoreTransfers.aggregate({ total: AggregateField.sum("amount") }).get(),
    transfers.where("status", "in", ["pending", "eligible", "processing"]).aggregate({ total: AggregateField.sum("amount") }).get(),
    completedStoreTransfers
      .where("completedAt", ">=", weekStart.toISOString())
      .aggregate({ total: AggregateField.sum("amount") })
      .get(),
    completedStoreTransfers
      .where("completedAt", ">=", monthStart.toISOString())
      .aggregate({ total: AggregateField.sum("amount") })
      .get(),
    /* The earnings dashboard previews only the ten most recent payouts. */
    transfers.orderBy("updatedAt", "desc").limit(10).get(),
    confirmedOrders.count().get(),
    confirmedOrders.orderBy("createdAt", "desc").limit(100).get(),
  ]);

  const totalEarnings = (completedTransfers.data().total ?? 0) / 100;
  const pendingBalance = (pendingTransfers.data().total ?? 0) / 100;
  const recent = recentOrders.docs.map((order) => order.data());
  const customers = new Set(recent.map((order) => text(isRecord(order.customer) ? order.customer.uid : "")).filter(Boolean));
  const transferRows = transferHistory.docs.map((transfer) => ({
    id: transfer.id,
    data: transfer.data(),
  }));
  const payouts = await buildStorePayoutDetails(store.id, transferRows);

  return {
    analytics: {
      totalOrders: orderCount.data().count,
      totalRevenue: totalEarnings,
      averageOrderValue: orderCount.data().count ? totalEarnings / orderCount.data().count : 0,
      totalCustomers: customers.size,
      averageRating: typeof store.data()?.rating === "number" ? store.data()?.rating : 0,
      peakHours: Array(24).fill(0), dailyOrders: Array(7).fill(0), weeklyGrowth: 0, revenueGrowth: 0, topProducts: [],
    },
    earnings: {
      totalEarnings,
      /* Completed transfers have already left LIA's balance for the store. */
      availableBalance: 0,
      pendingBalance,
      weeklyEarnings: (weeklyTransfers.data().total ?? 0) / 100,
      monthlyEarnings: (monthlyTransfers.data().total ?? 0) / 100,
      payouts,
    },
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
  const store = await requireOwnedStore(request.auth.uid);
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
  const payload = isRecord(request.data) ? request.data : {};
  const storeInput = isRecord(payload.store) ? payload.store : {};
  const userInput = isRecord(payload.user) ? payload.user : {};
  const name = text(storeInput.name);
  const email = text(storeInput.email);
  const phone = text(storeInput.phone);
  const description = text(storeInput.description);
  const address = text(storeInput.address);
  const city = text(storeInput.city);
  const state = normalizeState(text(storeInput.state));
  const zip = text(storeInput.zip);
  const businessType = text(storeInput.businessType);
  const registeredName = text(storeInput.registeredName);
  const businessStructure = text(storeInput.businessStructure);
  const ein = normalizeEin(text(storeInput.ein));
  const notificationSettings = {
    orderNotifications: storeInput.orderNotifications !== false,
    paymentNotifications: storeInput.paymentNotifications !== false,
    productStockNotifications: storeInput.productStockNotifications !== false,
    emailNotifications: storeInput.emailNotifications !== false,
    pushNotifications: storeInput.pushNotifications !== false,
  };
  if (!name || !email.includes("@") || !phone || !description || !address || !city || !state || !zip) {
    throw new HttpsError("invalid-argument", "Complete all store details with a valid email and two-letter state.");
  }
  if (!businessTypes.has(businessType) || !registeredName || !businessStructures.has(businessStructure) || ein === null) {
    throw new HttpsError("invalid-argument", "Complete valid business information. An EIN must use the format 00-0000000.");
  }
  const location = await geocode(`${address}, ${city}, ${state} ${zip}`);
  if (!location) throw new HttpsError("invalid-argument", "We could not verify the store address.");
  const zone = await resolveDeliveryZoneForAddress(city, state, zip, location.placeId);
  const store = await requireOwnedStore(request.auth.uid);
  await store.ref.update({
    name, email, phone, description,
    address: upper(address), city: upper(city), state, zip: upper(zip), country: "US",
    formattedAddress: upper(location.formattedAddress), latitude: location.latitude, longitude: location.longitude,
    homeZoneId: zone?.id ?? null, homeZoneName: zone?.name ?? null, zoneAssignmentSource: "automatic",
    businessType, registeredName, ein, businessStructure,
    category: text(storeInput.category), isOpen: storeInput.isOpen === true,
    ...notificationSettings,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("users").doc(request.auth.uid).set({
    displayName: text(userInput.displayName), phone: text(userInput.phone), language: text(userInput.language), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const [updatedStore, updatedUser] = await Promise.all([store.ref.get(), db.collection("users").doc(request.auth.uid).get()]);
  return { store: settingsStore(updatedStore.data() ?? {}, store.id), user: settingsUser(updatedUser.data() ?? {}) };
});

export const saveStoreWorkspaceSchedule = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save store hours.");
  const schedule = validateSchedule(isRecord(request.data) ? request.data.schedule : undefined);
  const store = await requireOwnedStore(request.auth.uid);
  await store.ref.update({ schedule, updatedAt: FieldValue.serverTimestamp() });
  return { schedule };
});
