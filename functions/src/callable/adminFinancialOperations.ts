/*
|--------------------------------------------------------------------------
| Admin Financial Operations
|--------------------------------------------------------------------------
|
| Finance records are read only here. Stripe identifiers, idempotency keys,
| and connected-account IDs remain server-only; this page is for operational
| review before audited financial controls are introduced.
|
*/

import * as admin from "firebase-admin";
import {AggregateField, getFirestore} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function date(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate?: unknown}).toDate === "function") {
    const result = (value as {toDate: () => Date}).toDate();
    return result instanceof Date ? result.toISOString() : null;
  }
  return typeof value === "string" ? value : null;
}

export const getAdminFinanceOverview = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "finance");
  const [transfers, refunds, settlements, completedTransfers, pendingTransfers, failedTransfers, pendingRefunds] = await Promise.all([
    db.collection("paymentTransfers").orderBy("updatedAt", "desc").limit(100).get(),
    db.collection("paymentRefunds").orderBy("updatedAt", "desc").limit(100).get(),
    db.collection("paymentSettlements").orderBy("createdAt", "desc").limit(100).get(),
    db.collection("paymentTransfers").where("status", "==", "completed").aggregate({amount: AggregateField.sum("amount")}).get(),
    db.collection("paymentTransfers").where("status", "in", ["pending", "eligible", "processing"]).aggregate({amount: AggregateField.sum("amount")}).get(),
    db.collection("paymentTransfers").where("status", "==", "failed").count().get(),
    db.collection("paymentRefunds").where("status", "in", ["pending", "eligible", "processing"]).count().get(),
  ]);
  const transferRows = transfers.docs.map((document) => {
    const data = document.data(); const recipient = record(data.recipient);
    return {id: document.id, orderId: text(data.orderId), recipientType: text(recipient.type), recipientId: text(recipient.id), amount: number(data.amount), currency: text(data.currency) || "usd", status: text(data.status) || "pending", attemptCount: number(data.attemptCount), lastError: text(data.lastError) || null, updatedAt: date(data.updatedAt), completedAt: date(data.completedAt)};
  });
  const refundRows = refunds.docs.map((document) => {
    const data = document.data(); const allocation = record(data.allocation);
    return {id: document.id, orderId: text(data.orderId), scope: text(data.scope) || "full", reason: text(data.reason) || "other", amount: number(allocation.totalAmount), currency: "usd", status: text(data.status) || "pending", lastError: text(data.lastError) || null, updatedAt: date(data.updatedAt), completedAt: date(data.completedAt)};
  });
  const settlementRows = settlements.docs.map((document) => {
    const data = document.data();
    return {id: document.id, orderId: text(data.orderId), storeAmount: number(data.storeAmount), driverAmount: number(data.driverAmount), currency: text(data.currency) || "usd", status: text(data.status) || "pending", createdAt: date(data.createdAt), completedAt: date(data.completedAt)};
  });
  /*
   * Payment records use the Firestore order ID internally. Resolve each one
   * to the same human-readable order number used by Store Orders instead of
   * exposing the implementation ID to an administrator.
   */
  const orderIds = Array.from(new Set([...transferRows, ...refundRows, ...settlementRows].map((item) => item.orderId).filter(Boolean)));
  const orderSnapshots = orderIds.length
    ? await db.getAll(...orderIds.map((id) => db.collection("orders").doc(id)))
    : [];
  const orderNumbers = new Map(orderSnapshots.map((snapshot) => [snapshot.id, text(snapshot.data()?.orderNumber) || null]));
  const addOrderNumber = <T extends {orderId: string}>(item: T) => ({
    ...item,
    orderNumber: item.orderId ? orderNumbers.get(item.orderId) ?? null : null,
  });
  return {
    metrics: {
      completedTransferAmount: number(completedTransfers.data().amount),
      pendingTransferAmount: number(pendingTransfers.data().amount),
      failedTransfers: failedTransfers.data().count,
      pendingRefunds: pendingRefunds.data().count,
    },
    transfers: transferRows.map(addOrderNumber), refunds: refundRows.map(addOrderNumber), settlements: settlementRows.map(addOrderNumber),
  };
});

/*
 * The immutable ledger is the source for LIA revenue. We use allocation
 * events, rather than today's commission configuration, so historical
 * reporting remains correct after a commission rule changes.
 */
async function allLedgerEvents(event: string): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const documents: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let query = db.collection("paymentLedger").where("event", "==", event).orderBy("createdAt", "desc").limit(500);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    documents.push(...page.docs);
    cursor = page.docs.at(-1);
    if (page.size < 500 || !cursor) break;
  }
  return documents;
}

export const getAdminLiaFinanceReport = onCall({region: "us-central1", timeoutSeconds: 300}, async (request) => {
  await requireAdminPermission(request, "finance");
  const [allocations, completedRefunds, stripeFees, completedTransfers] = await Promise.all([
    allLedgerEvents("allocation_created"),
    allLedgerEvents("refund_completed"),
    allLedgerEvents("stripe_processing_fee_recorded"),
    db.collection("paymentTransfers").where("status", "==", "completed").aggregate({total: AggregateField.sum("amount")}).get(),
  ]);
  let grossCustomerPayments = 0; let grossPlatformRevenue = 0; let salesTaxCollected = 0; let driverTipsCollected = 0;
  type StoreReport = {
    storeId: string; storeName: string; orderIds: Set<string>;
    grossCustomerPayments: number; grossProductSales: number; salesTaxCollected: number;
    storeCommission: number; storeAllocation: number; storeRefundReversals: number;
    driverAllocation: number; driverTips: number; customerRefunds: number;
    liaRevenue: number; liaRefundImpact: number; stripeProcessingFees: number;
  };
  const orderIds = [...new Set([...allocations, ...completedRefunds, ...stripeFees].map((document) => text(document.data().orderId)).filter(Boolean))];
  const orderDocuments = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (let start = 0; start < orderIds.length; start += 200) {
    const page = await db.getAll(...orderIds.slice(start, start + 200).map((id) => db.collection("orders").doc(id)));
    page.forEach((document) => orderDocuments.set(document.id, document));
  }
  const stores = new Map<string, StoreReport>();
  const storeForOrder = (orderId: string): StoreReport | null => {
    const order = orderDocuments.get(orderId)?.data() ?? {};
    const orderStore = record(order.store);
    const storeId = text(orderStore.id) || text(order.storeId);
    if (!storeId) return null;
    const existing = stores.get(storeId);
    if (existing) return existing;
    const created: StoreReport = {storeId, storeName: text(orderStore.name) || "Store", orderIds: new Set(), grossCustomerPayments: 0, grossProductSales: 0, salesTaxCollected: 0, storeCommission: 0, storeAllocation: 0, storeRefundReversals: 0, driverAllocation: 0, driverTips: 0, customerRefunds: 0, liaRevenue: 0, liaRefundImpact: 0, stripeProcessingFees: 0};
    stores.set(storeId, created);
    return created;
  };
  allocations.forEach((document) => {
    const data = document.data(); const metadata = record(data.metadata);
    grossCustomerPayments += number(data.amount);
    grossPlatformRevenue += number(metadata.platformRevenue);
    salesTaxCollected += number(metadata.salesTax);
    driverTipsCollected += number(metadata.driverTip);
    const orderId = text(data.orderId);
    const store = storeForOrder(orderId);
    if (!store) return;
    const order = orderDocuments.get(orderId)?.data() ?? {};
    const pricing = record(order.pricing);
    const grossProductSales = number(pricing.subtotalAmount);
    const commissionBasisPoints = number(metadata.storeCommissionBasisPoints);
    store.orderIds.add(orderId);
    store.grossCustomerPayments += number(data.amount);
    store.grossProductSales += grossProductSales;
    store.salesTaxCollected += number(metadata.salesTax);
    store.storeCommission += Math.round(grossProductSales * commissionBasisPoints / 10_000);
    store.storeAllocation += number(metadata.storeAmount);
    store.driverAllocation += number(metadata.driverAmount);
    store.driverTips += number(metadata.driverTip);
    store.liaRevenue += number(metadata.platformRevenue);
  });
  let refundAmount = 0; let platformRefundImpact = 0;
  completedRefunds.forEach((document) => {
    const data = document.data(); const metadata = record(data.metadata);
    refundAmount += number(data.amount);
    platformRefundImpact += number(metadata.platformRevenueReductionAmount);
    const store = storeForOrder(text(data.orderId));
    if (store) {
      store.customerRefunds += number(data.amount);
      store.storeRefundReversals += number(metadata.storeReversalAmount);
      store.liaRefundImpact += number(metadata.platformRevenueReductionAmount);
    }
  });
  const stripeProcessingFees = stripeFees.reduce(
    (total, document) => total + number(document.data().amount),
    0,
  );
  stripeFees.forEach((document) => {
    const store = storeForOrder(text(document.data().orderId));
    if (store) store.stripeProcessingFees += number(document.data().amount);
  });
  return {
    window: {allocationCount: allocations.length, limited: false},
    revenue: {grossCustomerPayments, grossPlatformRevenue, refundAmount, platformRefundImpact, stripeProcessingFees, netPlatformRevenue: grossPlatformRevenue - platformRefundImpact - stripeProcessingFees, salesTaxCollected, driverTipsCollected, participantTransfersCompleted: completedTransfers.data().total ?? 0},
    stores: [...stores.values()].map((store) => ({
      storeId: store.storeId,
      storeName: store.storeName,
      orderCount: store.orderIds.size,
      grossCustomerPayments: store.grossCustomerPayments,
      grossProductSales: store.grossProductSales,
      salesTaxCollected: store.salesTaxCollected,
      storeCommission: store.storeCommission,
      storeAllocation: store.storeAllocation,
      storeRefundReversals: store.storeRefundReversals,
      netStoreAllocation: store.storeAllocation - store.storeRefundReversals,
      driverAllocation: store.driverAllocation,
      driverTips: store.driverTips,
      customerRefunds: store.customerRefunds,
      liaRevenue: store.liaRevenue,
      liaRefundImpact: store.liaRefundImpact,
      stripeProcessingFees: store.stripeProcessingFees,
      netLiaRevenue: store.liaRevenue - store.liaRefundImpact - store.stripeProcessingFees,
    })).sort((first, second) => first.storeName.localeCompare(second.storeName)),
  };
});
