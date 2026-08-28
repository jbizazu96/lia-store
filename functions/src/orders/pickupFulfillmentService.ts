import {createHash, randomInt, timingSafeEqual} from "node:crypto";
import * as admin from "firebase-admin";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {requireStoreWorkspaceAccess} from "../services/store/storeAccessService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {createCatalogSearchTokens} from "../services/catalog/catalogSearchTokens";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

function hashCode(orderId: string, code: string): string {
  return createHash("sha256").update(`${orderId}:${code}`).digest("hex");
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("/")) {
    throw new HttpsError("invalid-argument", `${label} is invalid.`);
  }
  return value.trim();
}

async function ensurePickupCode(orderId: string, storeId: string): Promise<void> {
  const orderReference = db.collection("orders").doc(orderId);
  const codeReference = db.collection("customerPickupCodes").doc(orderId);
  const code = String(randomInt(100_000, 1_000_000));

  await db.runTransaction(async (transaction) => {
    const [orderSnapshot, codeSnapshot] = await Promise.all([
      transaction.get(orderReference),
      transaction.get(codeReference),
    ]);
    const order = orderSnapshot.data() ?? {};
    if (
      !orderSnapshot.exists ||
      order.fulfillmentType !== "pickup" ||
      order.status !== "ready_for_pickup" ||
      order.store?.id !== storeId
    ) {
      throw new HttpsError("failed-precondition", "This order is not ready for customer pickup.");
    }
    if (codeSnapshot.exists) return;
    const customerId = typeof order.customer?.uid === "string" ? order.customer.uid : "";
    if (!customerId) throw new HttpsError("failed-precondition", "The pickup customer is unavailable.");

    transaction.set(codeReference, {
      orderId,
      customerId,
      code,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1_000),
    });
    transaction.update(orderReference, {
      "pickup.pickupCodeHash": hashCode(orderId, code),
      "pickup.pickupCodeLastFour": code.slice(-4),
      "pickup.pickupCodeSearchToken": code,
      "pickup.readyAt": FieldValue.serverTimestamp(),
      storeSearchTokens: FieldValue.arrayUnion(
        ...createCatalogSearchTokens([code])
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export const getCustomerPickupCode = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view your pickup code.");
  await enforceCallableAbuseProtection({
    operation: "get-customer-pickup-code",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: 30,
    windowSeconds: 600,
  });
  const orderId = identifier((request.data as {orderId?: unknown} | undefined)?.orderId, "Order");
  const orderSnapshot = await db.collection("orders").doc(orderId).get();
  const order = orderSnapshot.data() ?? {};
  if (
    !orderSnapshot.exists ||
    order.fulfillmentType !== "pickup" ||
    order.customer?.uid !== request.auth.uid
  ) {
    throw new HttpsError("not-found", "A pickup code is not available for this order yet.");
  }
  let codeSnapshot = await db.collection("customerPickupCodes").doc(orderId).get();
  if (!codeSnapshot.exists && order.status === "ready_for_pickup") {
    await ensurePickupCode(orderId, typeof order.store?.id === "string" ? order.store.id : "");
    codeSnapshot = await db.collection("customerPickupCodes").doc(orderId).get();
  }
  const code = codeSnapshot.data() ?? {};
  if (code.customerId !== request.auth.uid || typeof code.code !== "string") {
    throw new HttpsError("not-found", "A pickup code is not available for this order yet.");
  }
  return {orderId, code: code.code, ready: order.status === "ready_for_pickup"};
});

export const completeCustomerPickup = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to complete this pickup.");
  await enforceCallableAbuseProtection({
    operation: "complete-customer-pickup",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: 12,
    windowSeconds: 600,
  });
  const input = request.data as {orderId?: unknown; code?: unknown} | undefined;
  const orderId = identifier(input?.orderId, "Order");
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the customer's six-digit pickup code.");
  const {store} = await requireStoreWorkspaceAccess(request.auth.uid, "orders", "write");
  const orderReference = db.collection("orders").doc(orderId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderReference);
    const order = snapshot.data() ?? {};
    if (!snapshot.exists || order.store?.id !== store.id || order.fulfillmentType !== "pickup") {
      throw new HttpsError("permission-denied", "You cannot complete this pickup order.");
    }
    if (order.status === "completed") return;
    if (order.status !== "ready_for_pickup") {
      throw new HttpsError("failed-precondition", "The order must be ready before customer pickup can be completed.");
    }
    const expected = order.pickup?.pickupCodeHash;
    const actualBuffer = Buffer.from(hashCode(orderId, code), "hex");
    const expectedBuffer = typeof expected === "string" ? Buffer.from(expected, "hex") : Buffer.alloc(0);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new HttpsError("permission-denied", "The pickup code is incorrect.");
    }
    const changedAt = Timestamp.now();
    transaction.update(orderReference, {
      status: "completed",
      storeSearchTokens: createCatalogSearchTokens([
        snapshot.id,
        order.orderNumber,
        order.customer?.name,
        order.customer?.email,
      ]),
      "pickup.pickupCodeHash": FieldValue.delete(),
      "pickup.pickupCodeSearchToken": FieldValue.delete(),
      "pickup.pickedUpAt": FieldValue.serverTimestamp(),
      "pickup.handedOffBy": request.auth!.uid,
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({
        status: "completed",
        timestamp: changedAt,
        note: "Customer pickup completed after pickup-code verification.",
        changedBy: {uid: request.auth!.uid, actorType: "store"},
      }),
    });
  });
  await db.collection("customerPickupCodes").doc(orderId).delete().catch(() => undefined);
  return {success: true, orderId, status: "completed" as const};
});

export const pickupFulfillmentService = {ensurePickupCode};

export const cleanupExpiredPickupCodes = onSchedule(
  {region: "us-central1", schedule: "every 24 hours", timeZone: "America/Chicago"},
  async () => {
    const expired = await db.collection("customerPickupCodes")
      .where("expiresAt", "<=", Timestamp.now())
      .limit(400)
      .get();
    if (expired.empty) return;
    const batch = db.batch();
    expired.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  },
);
