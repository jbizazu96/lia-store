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
import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const CUSTOMER_REASONS = new Set([
  "missing_items", "incorrect_items", "damaged_items", "quality_issue",
  "delivery_failed", "duplicate_charge", "other",
]);
const PHOTO_EVIDENCE_REASONS = new Set([
  "missing_items",
  "damaged_items",
]);
const SUPPORTED_EVIDENCE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;
const EVIDENCE_UPLOAD_TTL_MS = 15 * 60 * 1000;

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function identifier(value: unknown, label: string): string { const id = text(value); if (!id || id.includes("/") || id.includes("\\")) throw new HttpsError("invalid-argument", `${label} is required.`); return id; }
function date(value: unknown): string | null { if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") { const result = value.toDate(); return result instanceof Date ? result.toISOString() : null; } return typeof value === "string" ? value : null; }

async function requireActiveCustomer(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  if (!user.exists || user.data()?.accountType !== "customer" || user.data()?.isActive === false) throw new HttpsError("permission-denied", "This account is not authorized to manage customer claims.");
}

function claimId(orderId: string, customerId: string): string { return `customer_${customerId}_${orderId}`; }

function evidenceIsRequired(reason: string): boolean {
  return PHOTO_EVIDENCE_REASONS.has(reason);
}

function extension(value: unknown): string {
  const result = text(value).toLowerCase();

  if (!/^[a-z0-9]{1,10}$/.test(result)) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a supported image file.",
    );
  }

  return result;
}

function evidenceUploadPath(
  customerId: string,
  orderId: string,
  uploadId: string,
  fileExtension: string,
): string {
  return `users/${customerId}/refund-claim-evidence/${orderId}/${uploadId}/original.${fileExtension}`;
}

async function requirePaidCompletedOrder(
  customerId: string,
  orderId: string,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const order = await db.collection("orders").doc(orderId).get();
  const orderData = order.data() ?? {};
  const customer = record(orderData.customer);
  const payment = record(orderData.payment);

  if (
    !order.exists ||
    customer.uid !== customerId ||
    orderData.checkoutStatus !== "confirmed" ||
    payment.status !== "paid"
  ) {
    throw new HttpsError(
      "not-found",
      "This paid customer order was not found.",
    );
  }

  if (orderData.status !== "completed") {
    throw new HttpsError(
      "failed-precondition",
      "A claim can be submitted after delivery is completed.",
    );
  }

  return order;
}

export const beginCustomerRefundClaimEvidenceUpload = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to upload claim evidence.",
      );
    }

    const customerId = request.auth.uid;
    await requireActiveCustomer(customerId);

    const input = record(request.data);
    const orderId = identifier(input.orderId, "Order");
    const reason = text(input.reason);
    const contentType = text(input.contentType).toLowerCase();
    const fileExtension = extension(input.extension);
    const size = input.size;

    if (!evidenceIsRequired(reason)) {
      throw new HttpsError(
        "failed-precondition",
        "Photo evidence is required only for missing or damaged item claims.",
      );
    }

    if (
      !SUPPORTED_EVIDENCE_CONTENT_TYPES.has(contentType) ||
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > MAX_EVIDENCE_SIZE_BYTES
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Upload a JPEG, PNG, WebP, HEIC, or HEIF image up to 10 MB.",
      );
    }

    await requirePaidCompletedOrder(customerId, orderId);

    const existing = await db
      .collection("refundClaims")
      .doc(claimId(orderId, customerId))
      .get();

    if (
      existing.exists &&
      ["pending_review", "approved", "processing", "completed"].includes(
        text(existing.data()?.status),
      )
    ) {
      throw new HttpsError(
        "already-exists",
        "There is already an active claim for this order.",
      );
    }

    const reference = db.collection("refundClaimEvidenceUploads").doc();
    const storagePath = evidenceUploadPath(
      customerId,
      orderId,
      reference.id,
      fileExtension,
    );

    await reference.set({
      id: reference.id,
      customerId,
      orderId,
      reason,
      storagePath,
      contentType,
      size,
      status: "reserved",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + EVIDENCE_UPLOAD_TTL_MS),
    });

    return {
      uploadId: reference.id,
      storagePath,
    };
  },
);

export const createCustomerRefundClaim = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to request support.");
  const customerId = request.auth.uid;
  await requireActiveCustomer(customerId);
  const input = record(request.data); const orderId = identifier(input.orderId, "Order");
  const reason = text(input.reason);
  const description = text(input.description);
  if (!CUSTOMER_REASONS.has(reason)) throw new HttpsError("invalid-argument", "Choose a valid claim reason.");
  if (!description || description.length > 2_000) throw new HttpsError("invalid-argument", "Describe the issue using 1 to 2,000 characters.");
  await requirePaidCompletedOrder(customerId, orderId);

  const evidenceUploadId = evidenceIsRequired(reason)
    ? identifier(input.evidenceUploadId, "Photo evidence")
    : "";
  let evidence: {
    uploadId: string;
    storagePath: string;
    contentType: string;
  } | null = null;

  if (evidenceUploadId) {
    const evidenceReference = db
      .collection("refundClaimEvidenceUploads")
      .doc(evidenceUploadId);
    const evidenceSnapshot = await evidenceReference.get();
    const evidenceData = evidenceSnapshot.data() ?? {};
    const storagePath = text(evidenceData.storagePath);
    const expiresAt = evidenceData.expiresAt;
    const isExpired = !(
      expiresAt &&
      typeof expiresAt === "object" &&
      "toMillis" in expiresAt &&
      typeof expiresAt.toMillis === "function"
    ) || expiresAt.toMillis() < Date.now();

    if (
      !evidenceSnapshot.exists ||
      text(evidenceData.status) !== "reserved" ||
      text(evidenceData.customerId) !== customerId ||
      text(evidenceData.orderId) !== orderId ||
      text(evidenceData.reason) !== reason ||
      !storagePath ||
      isExpired
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Upload a new photo before submitting this claim.",
      );
    }

    const file = getStorage().bucket().file(storagePath);
    const [exists] = await file.exists();

    if (!exists) {
      throw new HttpsError(
        "failed-precondition",
        "The claim photo could not be found. Please upload it again.",
      );
    }

    const [metadata] = await file.getMetadata();
    const fileSize = Number(metadata.size ?? 0);
    const customMetadata = metadata.metadata ?? {};
    const contentType = text(metadata.contentType).toLowerCase();

    if (
      !SUPPORTED_EVIDENCE_CONTENT_TYPES.has(contentType) ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_EVIDENCE_SIZE_BYTES ||
      text(customMetadata.customerId) !== customerId ||
      text(customMetadata.orderId) !== orderId ||
      text(customMetadata.evidenceUploadId) !== evidenceUploadId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The claim photo could not be verified. Please upload it again.",
      );
    }

    evidence = {
      uploadId: evidenceUploadId,
      storagePath,
      contentType,
    };
  }

  const reference = db.collection("refundClaims").doc(claimId(orderId, customerId));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists && ["pending_review", "approved", "processing", "completed"].includes(text(existing.data()?.status))) throw new HttpsError("already-exists", "There is already an active claim for this order.");
    transaction.set(reference, {id: reference.id, orderId, customerId, reason, description, status: "pending_review", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), decision: {reason: null, decidedAt: null, decidedBy: null}, refundId: null, evidence: evidence ?? FieldValue.delete()}, {merge: true});

    if (evidence) {
      transaction.update(
        db.collection("refundClaimEvidenceUploads").doc(evidence.uploadId),
        {
          status: "claimed",
          claimId: reference.id,
          claimedAt: FieldValue.serverTimestamp(),
        },
      );
    }
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
      decisionAt: date(decision.decidedAt),
      refundId: refundId || null,
      refundStatus: refund?.exists
        ? text(refund.data()?.status) || "pending"
        : null,
      refundCompletedAt: refund?.exists
        ? date(refund.data()?.completedAt)
        : null,
      hasPhotoEvidence: Boolean(text(record(data.evidence).storagePath)),
    },
  };
});
