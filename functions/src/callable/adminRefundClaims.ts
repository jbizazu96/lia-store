/*
|--------------------------------------------------------------------------
| Admin Refund Claim Review
|--------------------------------------------------------------------------
|
| Admins decide customer claims here, but cannot write Stripe payment data.
| Approval validates the original order, immutable allocation policy, paid
| participant transfers, and existing refunds before creating the trusted
| marketplace refund obligation processed by the scheduler.
|
*/

import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireActiveAdmin} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {
  calculatePaymentRefundAllocation,
  isPaymentRefundAllocationError,
} from "../payment/marketplace/paymentRefundAllocationService";
import {
  createRefund,
  PaymentRefundServiceError,
} from "../payment/marketplace/paymentRefundService";
import {parseMarketplacePricingPolicy} from "../payment/pricing/marketplacePricingPolicy";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const CLAIM_REASONS = new Set(["missing_items", "incorrect_items", "damaged_items", "quality_issue", "delivery_failed", "duplicate_charge", "other"]);

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function identifier(value: unknown, label: string): string { const id = text(value); if (!id || id.includes("/") || id.includes("\\")) throw new HttpsError("invalid-argument", `${label} is required.`); return id; }
function timestamp(value: unknown): string | null { if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") { const result = value.toDate(); return result instanceof Date ? result.toISOString() : null; } return typeof value === "string" ? value : null; }
function status(value: unknown): string { return text(value) || "pending_review"; }
function amounts(value: unknown) { const input = record(value); return {merchandiseAmount: number(input.merchandiseAmount), taxAmount: number(input.taxAmount), deliveryFeeAmount: number(input.deliveryFeeAmount), serviceFeeAmount: number(input.serviceFeeAmount), driverTipAmount: number(input.driverTipAmount)}; }

function refundValidationError(
  error: unknown
): HttpsError {
  if (
    isPaymentRefundAllocationError(error) ||
    error instanceof PaymentRefundServiceError
  ) {
    return new HttpsError(
      "failed-precondition",
      error.message
    );
  }

  return new HttpsError(
    "internal",
    "The refund could not be prepared. Please try again."
  );
}

function summary(
  document: FirebaseFirestore.QueryDocumentSnapshot,
  orderData: Record<string, unknown>
) {
  const data = document.data();
  const customer = record(orderData.customer);

  return {
    id: document.id,
    orderNumber: text(orderData.orderNumber) || "Unavailable",
    customerName: text(customer.name) || "Customer",
    reason: text(data.reason),
    status: status(data.status),
    createdAt: timestamp(data.createdAt),
    refundId: text(data.refundId) || null,
  };
}

export const getAdminRefundClaims = onCall({region: "us-central1"}, async (request) => {
  await requireActiveAdmin(request); const requestedStatus = text(record(request.data).status) || "pending_review";
  const valid = new Set(["pending_review", "approved", "rejected", "all"]); if (!valid.has(requestedStatus)) throw new HttpsError("invalid-argument", "Choose a valid claim status.");
  const snapshot = requestedStatus === "all" ? await db.collection("refundClaims").orderBy("createdAt", "desc").limit(100).get() : await db.collection("refundClaims").where("status", "==", requestedStatus).limit(100).get();
  const orders = snapshot.docs.length
    ? await db.getAll(
      ...snapshot.docs.map((document) =>
        db.collection("orders").doc(text(document.data().orderId))
      )
    )
    : [];
  const all = snapshot.docs
    .map((document, index) =>
      summary(document, record(orders[index]?.data()))
    )
    .sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? "")
    );
  const countsSnapshot = await db.collection("refundClaims").limit(500).get(); const counts = {pending_review: 0, approved: 0, rejected: 0}; countsSnapshot.docs.forEach((document) => { const value = status(document.data().status); if (value in counts) counts[value as keyof typeof counts] += 1; });
  return {claims: all, counts, limited: snapshot.size === 100 || countsSnapshot.size === 500};
});

export const getAdminRefundClaim = onCall({region: "us-central1"}, async (request) => {
  await requireActiveAdmin(request); const claimId = identifier(record(request.data).claimId, "Claim"); const claim = await db.collection("refundClaims").doc(claimId).get();
  if (!claim.exists) throw new HttpsError("not-found", "The refund claim was not found.");
  const data = claim.data() ?? {}; const order = await db.collection("orders").doc(identifier(data.orderId, "Order")).get(); const orderData = order.data() ?? {}; const pricing = record(orderData.pricing); const customer = record(orderData.customer); const decision = record(data.decision); const refundId = text(data.refundId); const refund = refundId ? await db.collection("paymentRefunds").doc(refundId).get() : null;
  return {id: claim.id, status: status(data.status), reason: text(data.reason), description: text(data.description), createdAt: timestamp(data.createdAt), customer: {id: text(data.customerId), name: text(customer.name) || "Customer", email: text(customer.email) || null}, order: {id: order.id, orderNumber: text(orderData.orderNumber) || "Unavailable", status: text(orderData.status), currency: text(pricing.currency) || "usd", pricing: {merchandiseAmount: number(pricing.subtotalAmount), taxAmount: number(pricing.taxAmount), deliveryFeeAmount: number(pricing.deliveryFeeAmount), serviceFeeAmount: number(pricing.serviceFeeAmount), driverTipAmount: number(pricing.tipAmount), totalAmount: number(pricing.totalAmount)}}, decision: {reason: text(decision.reason) || null, decidedAt: timestamp(decision.decidedAt), decidedBy: text(decision.decidedBy) || null}, refund: refund?.exists ? {id: refund.id, status: text(refund.data()?.status), amount: number(record(refund.data()?.allocation).totalAmount), completedAt: timestamp(refund.data()?.completedAt), lastError: text(refund.data()?.lastError) || null} : null};
});

export const decideAdminRefundClaim = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireActiveAdmin(request); const input = record(request.data); const claimId = identifier(input.claimId, "Claim"); const decision = text(input.decision); const note = text(input.note);
  if (decision !== "approved" && decision !== "rejected") throw new HttpsError("invalid-argument", "Choose approve or reject.");
  if (note.length > 2_000 || (decision === "rejected" && !note)) throw new HttpsError("invalid-argument", "A rejection reason of up to 2,000 characters is required.");
  const claimReference = db.collection("refundClaims").doc(claimId); const claim = await claimReference.get(); const claimData = claim.data() ?? {};
  if (!claim.exists || status(claimData.status) !== "pending_review") throw new HttpsError("failed-precondition", "This claim is no longer waiting for review.");
  if (decision === "rejected") { await claimReference.update({status: "rejected", "decision.reason": note, "decision.decidedAt": FieldValue.serverTimestamp(), "decision.decidedBy": administrator.uid, updatedAt: FieldValue.serverTimestamp()}); await writeAdminAuditLog(administrator, {action: "refund_claim_rejected", targetType: "refund_claim", targetId: claimId, reason: note}); return {success: true, refundId: null}; }
  const orderId = identifier(claimData.orderId, "Order"); const [order, ledger, transfers, existingRefunds] = await Promise.all([db.collection("orders").doc(orderId).get(), db.collection("paymentLedger").doc(`${orderId}_allocation_created`).get(), db.collection("paymentTransfers").where("orderId", "==", orderId).get(), db.collection("paymentRefunds").where("orderId", "==", orderId).get()]);
  const orderData = order.data() ?? {}; const payment = record(orderData.payment); const pricing = record(orderData.pricing); const metadata = record(ledger.data()?.metadata); const requested = amounts(input.amounts); const scope = input.scope === "partial" ? "partial" : "full";
  if (!order.exists || orderData.checkoutStatus !== "confirmed" || payment.status !== "paid" || orderData.status !== "completed") throw new HttpsError("failed-precondition", "Only paid, completed orders can receive a claim refund.");
  if (!CLAIM_REASONS.has(text(claimData.reason))) throw new HttpsError("failed-precondition", "The claim reason is invalid.");
  let policy;

  try {
    policy = parseMarketplacePricingPolicy(
      record(orderData.pricingPolicy)
    );
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "This order is missing its immutable pricing policy and cannot be refunded automatically."
    );
  }
  const rawStoreCommissionBasisPoints = metadata.storeCommissionBasisPoints;
  const rawDriverCommissionBasisPoints = metadata.driverCommissionBasisPoints;
  const storeCommissionBasisPoints = number(rawStoreCommissionBasisPoints);
  const driverCommissionBasisPoints = number(rawDriverCommissionBasisPoints);
  if (
    !ledger.exists ||
    typeof rawStoreCommissionBasisPoints !== "number" ||
    typeof rawDriverCommissionBasisPoints !== "number" ||
    storeCommissionBasisPoints > 5_000 ||
    driverCommissionBasisPoints > 5_000
  ) throw new HttpsError("failed-precondition", "The original settlement allocation is not ready for a refund.");
  if (
    scope === "partial" &&
    requested.merchandiseAmount +
      requested.taxAmount +
      requested.deliveryFeeAmount +
      requested.serviceFeeAmount +
      requested.driverTipAmount <= 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Select at least one refund amount greater than zero."
    );
  }

  let allocation;

  try {
    allocation = calculatePaymentRefundAllocation({scope, originalPayment: {merchandiseAmount: number(pricing.subtotalAmount), taxAmount: number(pricing.taxAmount), deliveryFeeAmount: number(pricing.deliveryFeeAmount), serviceFeeAmount: number(pricing.serviceFeeAmount), driverTipAmount: number(pricing.tipAmount), totalAmount: number(pricing.totalAmount)}, allocationPolicy: {storeCommissionBasisPoints, driverCommissionBasisPoints, freeDeliveryMinimumCents: policy.freeDeliveryMinimumCents, freeDeliveryDriverIncentiveWithoutTipCents: policy.freeDeliveryDriverIncentiveWithoutTipCents, freeDeliveryDriverIncentiveWithTipCents: policy.freeDeliveryDriverIncentiveWithTipCents}, ...(scope === "partial" ? {requestedAmounts: requested} : {})});
  } catch (error) {
    throw refundValidationError(error);
  }
  const priorRefunded = existingRefunds.docs.filter((document) => text(document.data().status) !== "cancelled").reduce((total, document) => total + number(record(document.data().allocation).totalAmount), 0); if (priorRefunded + allocation.totalAmount > number(pricing.totalAmount)) throw new HttpsError("failed-precondition", "This refund would exceed the remaining customer payment.");
  const transferFor = (recipientType: "store" | "driver") =>
    transfers.docs
      .map((document) => {
        const transfer = document.data();

        return {
          id: document.id,
          recipient: record(transfer.recipient),
          status: text(transfer.status),
          stripeTransferId: text(transfer.stripeTransferId),
        };
      })
      .find((item) =>
        item.recipient.type === recipientType &&
        item.status === "completed" &&
        item.stripeTransferId.startsWith("tr_")
      );
  const storeTransfer = transferFor("store"); const driverTransfer = transferFor("driver"); if ((allocation.storeReversalAmount > 0 && !storeTransfer) || (allocation.driverReversalAmount > 0 && !driverTransfer)) throw new HttpsError("failed-precondition", "Participant payouts must complete before this refund can be approved.");
  const settlement = await db.collection("paymentSettlements").doc(orderId).get(); const refund = await createRefund({orderId, sourceClaimId: claimId, refundKey: `customer_claim_${claimId}`, ...(settlement.exists ? {settlementId: settlement.id} : {}), stripePaymentIntentId: identifier(payment.paymentIntentId, "Stripe payment"), stripeChargeId: identifier(payment.stripeChargeId, "Stripe charge"), scope, reason: text(claimData.reason) as never, ...(note ? {note} : {}), allocation, reversals: [ ...(allocation.storeReversalAmount > 0 ? [{recipientType: "store" as const, recipientId: text(record(storeTransfer?.recipient).id), transferId: storeTransfer!.id, stripeTransferId: text(storeTransfer!.stripeTransferId), amount: allocation.storeReversalAmount, status: "pending" as const, attemptCount: 0}] : []), ...(allocation.driverReversalAmount > 0 ? [{recipientType: "driver" as const, recipientId: text(record(driverTransfer?.recipient).id), transferId: driverTransfer!.id, stripeTransferId: text(driverTransfer!.stripeTransferId), amount: allocation.driverReversalAmount, status: "pending" as const, attemptCount: 0}] : [])], requestedBy: administrator.uid});
  await claimReference.update({status: "approved", refundId: refund.refundId, "decision.reason": note || null, "decision.decidedAt": FieldValue.serverTimestamp(), "decision.decidedBy": administrator.uid, updatedAt: FieldValue.serverTimestamp()}); await writeAdminAuditLog(administrator, {action: "refund_claim_approved", targetType: "refund_claim", targetId: claimId, reason: note || null, details: {refundId: refund.refundId, amount: allocation.totalAmount, scope}}); return {success: true, refundId: refund.refundId};
});
