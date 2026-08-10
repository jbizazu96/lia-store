import {createHash} from "crypto";
import Stripe from "stripe";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

const TERMINAL_ORDER_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_REFUND_STATUSES = new Set(["rejected", "completed", "cancelled"]);
const TERMINAL_PAYMENT_REFUND_STATUSES = new Set(["completed", "cancelled"]);

export interface CustomerDeletionContext {
  customerId: string;
  anonymousId: string;
  stripeCustomerId: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function anonymousId(customerId: string): string {
  return "deleted_customer_" + createHash("sha256")
    .update(customerId)
    .digest("hex")
    .slice(0, 24);
}

async function deleteQuery(
  query: FirebaseFirestore.Query,
): Promise<void> {
  const db = getFirestore("default");
  const snapshot = await query.get();
  await Promise.all(snapshot.docs.map((document) => db.recursiveDelete(document.ref)));
}

async function anonymizeQuery(
  query: FirebaseFirestore.Query,
  update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
): Promise<void> {
  const snapshot = await query.get();
  const writer = getFirestore("default").bulkWriter();
  snapshot.docs.forEach((document) => writer.update(document.ref, update));
  await writer.close();
}

export const customerAccountDeletionService = {
  async loadContext(customerId: string): Promise<CustomerDeletionContext> {
    const user = await getFirestore("default").collection("users").doc(customerId).get();
    if (!user.exists || user.data()?.accountType !== "customer") {
      throw new Error("The customer account was not found.");
    }

    return {
      customerId,
      anonymousId: anonymousId(customerId),
      stripeCustomerId: text(user.data()?.stripeCustomerId) || null,
    };
  },

  async validateEligibility(context: CustomerDeletionContext): Promise<void> {
    const db = getFirestore("default");
    const [orders, refunds] = await Promise.all([
      db.collection("orders").where("customer.uid", "==", context.customerId).get(),
      db.collection("refundClaims").where("customerId", "==", context.customerId).get(),
    ]);

    if (orders.docs.some((document) => {
      const data = document.data();
      return data.checkoutStatus === "confirmed" &&
        data.payment?.status === "paid" &&
        !TERMINAL_ORDER_STATUSES.has(text(data.status));
    })) {
      throw new Error("Customer deletion is blocked while an order is active.");
    }

    if (orders.docs.some((document) =>
      document.data().liaInvestigation?.active === true
    )) {
      throw new Error("Customer deletion is blocked by an active order investigation.");
    }

    if (refunds.docs.some((document) =>
      !TERMINAL_REFUND_STATUSES.has(text(document.data().status)))) {
      throw new Error("Customer deletion is blocked while a refund claim is active.");
    }

    const orderIds = orders.docs.map((document) => document.id);
    for (const orderIdChunk of chunks(orderIds, 30)) {
      const paymentRefunds = await db.collection("paymentRefunds")
        .where("orderId", "in", orderIdChunk)
        .get();
      if (paymentRefunds.docs.some((document) =>
        !TERMINAL_PAYMENT_REFUND_STATUSES.has(text(document.data().status)))) {
        throw new Error("Customer deletion is blocked while a payment refund is unresolved.");
      }
    }
  },

  async deleteStorage(context: CustomerDeletionContext): Promise<void> {
    /* Delete the complete owner prefix, including current and future uploads. */
    await getStorage().bucket().deleteFiles({
      prefix: `users/${context.customerId}/`,
      force: true,
    });
  },

  async deleteStripeCustomer(
    stripe: Stripe,
    context: CustomerDeletionContext,
  ): Promise<void> {
    if (!context.stripeCustomerId) return;
    try {
      await stripe.customers.del(context.stripeCustomerId);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error &&
        error.code === "resource_missing") return;
      throw error;
    }
  },

  async deleteFirestore(context: CustomerDeletionContext): Promise<void> {
    const db = getFirestore("default");
    const uid = context.customerId;
    const anonymizedCustomer = {
      uid: context.anonymousId,
      name: "Deleted customer",
      email: "",
      phone: "",
      address: "",
      latitude: null,
      longitude: null,
    };

    await anonymizeQuery(
      db.collection("orders").where("customer.uid", "==", uid),
      {customer: anonymizedCustomer},
    );
    await anonymizeQuery(
      db.collection("refundClaims").where("customerId", "==", uid),
      {customerId: context.anonymousId, evidence: null},
    );
    await anonymizeQuery(
      db.collection("orderSupportRequests").where("customerId", "==", uid),
      {customerId: context.anonymousId, customerName: "Deleted customer"},
    );
    await anonymizeQuery(
      db.collection("storeReviews").where("customerId", "==", uid),
      {customerId: context.anonymousId, customerName: "Deleted customer"},
    );

    await Promise.all([
      deleteQuery(db.collection("notificationDevices").where("uid", "==", uid)),
      deleteQuery(db.collection("checkoutSessions").where("customerUid", "==", uid)),
      db.recursiveDelete(db.collection("users").doc(uid)),
      db.recursiveDelete(db.collection("carts").doc(uid)),
      db.recursiveDelete(db.collection("addresses").doc(uid)),
    ]);
  },

  async deleteAuthentication(context: CustomerDeletionContext): Promise<void> {
    try {
      await getAuth().deleteUser(context.customerId);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error &&
        error.code === "auth/user-not-found") return;
      throw error;
    }
  },
};
