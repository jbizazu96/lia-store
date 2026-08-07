/*
|--------------------------------------------------------------------------
| Customer Refund & Return Claims
|--------------------------------------------------------------------------
|
| A claim is a review request, never a Stripe refund. The customer can create
| one only for their own paid, completed order. Admin approval is handled by
| a separate callable that creates the immutable refund obligation through
| the marketplace refund engine.
|
*/

import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const CUSTOMER_REASONS = new Set([
  "missing_items", "incorrect_items", "damaged_items", "quality_issue",
  "delivery_failed", "duplicate_charge", "other",
]);

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function identifier(value: unknown, label: string): string { const id = text(value); if (!id || id.includes("/") || id.includes("\\")) throw new HttpsError("invalid-argument", `${label} is required.`); return id; }
function date(value: unknown): string | null { if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") { const result = value.toDate(); return result instanceof Date ? result.toISOString() : null; } return typeof value === "string" ? value : null; }

async function requireActiveCustomer(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  if (!user.exists || user.data()?.accountType !== "customer" || user.data()?.isActive === false) throw new HttpsError("permission-denied", "This account is not authorized to manage customer claims.");
}

function claimId(orderId: string, customerId: string): string { return `customer_${customerId}_${orderId}`; }

export const createCustomerRefundClaim = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to request support.");
  const customerId = request.auth.uid;
  await requireActiveCustomer(customerId);
  const input = record(request.data); const orderId = identifier(input.orderId, "Order");
  const reason = text(input.reason);
  const description = text(input.description);
  if (!CUSTOMER_REASONS.has(reason)) throw new HttpsError("invalid-argument", "Choose a valid claim reason.");
  if (!description || description.length > 2_000) throw new HttpsError("invalid-argument", "Describe the issue using 1 to 2,000 characters.");
  const order = await db.collection("orders").doc(orderId).get(); const orderData = order.data() ?? {}; const customer = record(orderData.customer); const payment = record(orderData.payment);
  if (!order.exists || customer.uid !== customerId || orderData.checkoutStatus !== "confirmed" || payment.status !== "paid") throw new HttpsError("not-found", "This paid customer order was not found.");
  if (orderData.status !== "completed") throw new HttpsError("failed-precondition", "A claim can be submitted after delivery is completed.");
  const reference = db.collection("refundClaims").doc(claimId(orderId, customerId));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists && ["pending_review", "approved", "processing", "completed"].includes(text(existing.data()?.status))) throw new HttpsError("already-exists", "There is already an active claim for this order.");
    transaction.set(reference, {id: reference.id, orderId, customerId, reason, description, status: "pending_review", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), decision: {reason: null, decidedAt: null, decidedBy: null}, refundId: null}, {merge: true});
  });
  return {claimId: reference.id, status: "pending_review"};
});

export const getCustomerRefundClaim = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view support requests.");
  await requireActiveCustomer(request.auth.uid);
  const orderId = identifier(record(request.data).orderId, "Order");
  const snapshot = await db.collection("refundClaims").doc(claimId(orderId, request.auth.uid)).get();
  if (!snapshot.exists) return {claim: null};
  const data = snapshot.data() ?? {};
  const decision = record(data.decision);
  const refundId = text(data.refundId);
  const refund = refundId
    ? await db.collection("paymentRefunds").doc(refundId).get()
    : null;

  return {
    claim: {
      id: snapshot.id,
      reason: text(data.reason),
      description: text(data.description),
      status: text(data.status) || "pending_review",
      createdAt: date(data.createdAt),
      decisionReason: text(decision.reason) || null,
      refundId: refundId || null,
      refundStatus: refund?.exists
        ? text(refund.data()?.status) || "pending"
        : null,
    },
  };
});
