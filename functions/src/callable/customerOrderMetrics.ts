import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

const ACTIVE_ORDER_STATUSES = [
  "pending", "accepted", "preparing", "ready_for_pickup",
  "driver_assigned", "picked_up", "out_for_delivery",
];

async function refreshCustomerOrderMetrics(uid: string): Promise<number> {
  const result = await db.collection("orders")
    .where("customer.uid", "==", uid)
    .where("checkoutStatus", "==", "confirmed")
    .where("payment.status", "==", "paid")
    .where("status", "in", ACTIVE_ORDER_STATUSES)
    .count()
    .get();
  const activeOrderCount = result.data().count;
  await db.doc(`users/${uid}/metrics/orders`).set({
    activeOrderCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  return activeOrderCount;
}

export const getCustomerOrderMetrics = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
    return {activeOrderCount: await refreshCustomerOrderMetrics(request.auth.uid)};
  },
);

/** Maintains the tiny badge read model after every authoritative order write.
 * Recounting makes retries idempotent and avoids increment drift. */
export const customerOrderMetricsSync = onDocumentWritten(
  {document: "orders/{orderId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    const customerId = (record?: Record<string, unknown>) => {
      const customer = record?.customer;
      if (!customer || typeof customer !== "object") return "";
      const uid = (customer as Record<string, unknown>).uid;
      return typeof uid === "string" ? uid : "";
    };
    const ids = [...new Set([customerId(before), customerId(after)].filter(Boolean))];
    await Promise.all(ids.map(refreshCustomerOrderMetrics));
  },
);
