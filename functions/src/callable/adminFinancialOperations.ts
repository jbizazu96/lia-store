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
import {requireActiveAdmin} from "../admin/adminAuthorizationService";

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
  await requireActiveAdmin(request);
  const [transfers, refunds, settlements] = await Promise.all([
    db.collection("paymentTransfers").orderBy("updatedAt", "desc").limit(100).get(),
    db.collection("paymentRefunds").orderBy("updatedAt", "desc").limit(100).get(),
    db.collection("paymentSettlements").orderBy("createdAt", "desc").limit(100).get(),
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
  const orderNumbers = new Map(orderSnapshots.map((snapshot) => [snapshot.id, text(snapshot.data()?.orderNumber) || snapshot.id.slice(0, 8).toUpperCase()]));
  const addOrderNumber = <T extends {orderId: string}>(item: T) => ({
    ...item,
    orderNumber: item.orderId ? orderNumbers.get(item.orderId) ?? item.orderId.slice(0, 8).toUpperCase() : null,
  });
  return {
    metrics: {
      completedTransferAmount: transferRows.filter((item) => item.status === "completed").reduce((total, item) => total + item.amount, 0),
      pendingTransferAmount: transferRows.filter((item) => ["pending", "eligible", "processing"].includes(item.status)).reduce((total, item) => total + item.amount, 0),
      failedTransfers: transferRows.filter((item) => item.status === "failed").length,
      pendingRefunds: refundRows.filter((item) => ["pending", "eligible", "processing"].includes(item.status)).length,
    },
    transfers: transferRows.map(addOrderNumber), refunds: refundRows.map(addOrderNumber), settlements: settlementRows.map(addOrderNumber),
  };
});

/*
 * The immutable ledger is the source for LIA revenue. We use allocation
 * events, rather than today's commission configuration, so historical
 * reporting remains correct after a commission rule changes.
 */
export const getAdminLiaFinanceReport = onCall({region: "us-central1"}, async (request) => {
  await requireActiveAdmin(request);
  const [allocations, completedRefunds, stripeFees, completedTransfers] = await Promise.all([
    db.collection("paymentLedger").where("event", "==", "allocation_created").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("paymentLedger").where("event", "==", "refund_completed").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("paymentLedger").where("event", "==", "stripe_processing_fee_recorded").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("paymentTransfers").where("status", "==", "completed").aggregate({total: AggregateField.sum("amount")}).get(),
  ]);
  let grossCustomerPayments = 0; let grossPlatformRevenue = 0; let salesTaxCollected = 0; let driverTipsCollected = 0;
  allocations.docs.forEach((document) => {
    const data = document.data(); const metadata = record(data.metadata);
    grossCustomerPayments += number(data.amount);
    grossPlatformRevenue += number(metadata.platformRevenue);
    salesTaxCollected += number(metadata.salesTax);
    driverTipsCollected += number(metadata.driverTip);
  });
  let refundAmount = 0; let platformRefundImpact = 0;
  completedRefunds.docs.forEach((document) => {
    const data = document.data(); const metadata = record(data.metadata);
    refundAmount += number(data.amount);
    platformRefundImpact += number(metadata.platformRevenueReductionAmount);
  });
  const stripeProcessingFees = stripeFees.docs.reduce(
    (total, document) => total + number(document.data().amount),
    0,
  );
  return {
    window: {allocationCount: allocations.size, limited: allocations.size === 500},
    revenue: {grossCustomerPayments, grossPlatformRevenue, refundAmount, platformRefundImpact, stripeProcessingFees, netPlatformRevenue: grossPlatformRevenue - platformRefundImpact - stripeProcessingFees, salesTaxCollected, driverTipsCollected, participantTransfersCompleted: completedTransfers.data().total ?? 0},
  };
});
