import {createHash} from "crypto";
import Stripe from "stripe";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

const TERMINAL_ORDER_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_TRANSFER_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_REFUND_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_REVERSAL_STATUSES = new Set(["completed", "not_required"]);
const TERMINAL_DISPUTE_STATUSES = new Set([
  "lost", "prevented", "warning_closed", "won",
]);

export interface DeletedStoreContext {
  id: string;
  stripeAccountId: string | null;
}

export interface StoreDeletionContext {
  ownerId: string;
  anonymousOwnerId: string;
  stores: DeletedStoreContext[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> : {};
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function anonymousOwnerId(ownerId: string): string {
  return "deleted_store_owner_" + createHash("sha256")
    .update(ownerId)
    .digest("hex")
    .slice(0, 24);
}

async function deleteQuery(query: FirebaseFirestore.Query): Promise<void> {
  const db = getFirestore("default");
  const snapshot = await query.get();
  await Promise.all(snapshot.docs.map((document) => db.recursiveDelete(document.ref)));
}

async function anonymizeStoreOrders(
  storeId: string,
  anonymousId: string,
): Promise<void> {
  const db = getFirestore("default");
  const snapshot = await db.collection("orders").where("store.id", "==", storeId).get();
  const writer = db.bulkWriter();
  snapshot.docs.forEach((document) => writer.update(document.ref, {
    store: {
      id: storeId,
      ownerId: anonymousId,
      name: "Deleted store",
      address: "",
      phone: "",
      latitude: null,
      longitude: null,
    },
  }));
  await writer.close();
}

export const storeAccountDeletionService = {
  async loadContext(ownerId: string): Promise<StoreDeletionContext> {
    const db = getFirestore("default");
    const [user, stores] = await Promise.all([
      db.collection("users").doc(ownerId).get(),
      db.collection("stores").where("ownerId", "==", ownerId).get(),
    ]);
    if (!user.exists || user.data()?.accountType !== "store_owner") {
      throw new Error("The store-owner account was not found.");
    }
    if (stores.empty) throw new Error("No store belongs to this account.");

    return {
      ownerId,
      anonymousOwnerId: anonymousOwnerId(ownerId),
      stores: stores.docs.map((store) => ({
        id: store.id,
        stripeAccountId: text(store.data().stripeAccountId) || null,
      })),
    };
  },

  async validateOperations(context: StoreDeletionContext): Promise<void> {
    const db = getFirestore("default");
    for (const store of context.stores) {
      const orders = await db.collection("orders").where("store.id", "==", store.id).get();
      if (orders.docs.some((document) => {
        const data = document.data();
        return data.checkoutStatus === "confirmed" &&
          data.payment?.status === "paid" &&
          !TERMINAL_ORDER_STATUSES.has(text(data.status));
      })) {
        throw new Error("Store deletion is blocked while an order is active.");
      }
      if (orders.docs.some((document) =>
        document.data().liaInvestigation?.active === true
      )) {
        throw new Error("Store deletion is blocked by an active order investigation.");
      }
    }
  },

  async validateFinancials(
    context: StoreDeletionContext,
    stripe: Stripe,
  ): Promise<void> {
    const db = getFirestore("default");
    for (const store of context.stores) {
      const [orders, settlements, transfers] = await Promise.all([
        db.collection("orders").where("store.id", "==", store.id).get(),
        db.collection("paymentSettlements").where("storeId", "==", store.id).get(),
        db.collection("paymentTransfers").where("recipient.id", "==", store.id).get(),
      ]);

      if (settlements.docs.some((document) =>
        text(document.data().status) !== "completed"
      )) {
        throw new Error("Store deletion is blocked while a settlement is unresolved.");
      }
      if (transfers.docs.some((document) => {
        const data = document.data();
        return data.recipient?.type === "store" &&
          !TERMINAL_TRANSFER_STATUSES.has(text(data.status));
      })) {
        throw new Error("Store deletion is blocked while a payout is unsettled.");
      }

      const orderIds = orders.docs.map((document) => document.id);
      for (const orderIdChunk of chunks(orderIds, 30)) {
        const refunds = await db.collection("paymentRefunds")
          .where("orderId", "in", orderIdChunk)
          .get();
        if (refunds.docs.some((document) => {
          const refund = document.data();
          const reversals = Array.isArray(refund.reversals) ? refund.reversals : [];
          const storeReversals = reversals.map(record).filter((reversal) =>
            reversal.recipientType === "store" && reversal.recipientId === store.id
          );
          return storeReversals.some((reversal) =>
            !TERMINAL_REVERSAL_STATUSES.has(text(reversal.status))) ||
            (storeReversals.length > 0 &&
              !TERMINAL_REFUND_STATUSES.has(text(refund.status)));
        })) {
          throw new Error(
            "Store deletion is blocked while a refund or transfer reversal is unresolved."
          );
        }
      }

      if (!store.stripeAccountId) continue;
      const options: Stripe.RequestOptions = {stripeAccount: store.stripeAccountId};
      const [balance, disputes, payouts] = await Promise.all([
        stripe.balance.retrieve({}, options),
        stripe.disputes.list({limit: 100}, options)
          .autoPagingToArray({limit: 10000}),
        stripe.payouts.list({limit: 100}, options)
          .autoPagingToArray({limit: 10000}),
      ]);
      const balanceAmounts = [...balance.available, ...balance.pending];
      if (balanceAmounts.some((entry) => entry.amount < 0)) {
        throw new Error("Store deletion is blocked by a negative Stripe balance.");
      }
      if (balanceAmounts.some((entry) => entry.amount > 0)) {
        throw new Error(
          "Store deletion is blocked while Stripe funds are available or pending."
        );
      }
      if (disputes.some((dispute) =>
        !TERMINAL_DISPUTE_STATUSES.has(dispute.status)
      )) {
        throw new Error("Store deletion is blocked by an active Stripe dispute.");
      }
      if (payouts.some((payout) =>
        payout.status === "pending" || payout.status === "in_transit"
      )) {
        throw new Error("Store deletion is blocked while a Stripe payout is pending.");
      }
    }
  },

  async deleteStorage(context: StoreDeletionContext): Promise<void> {
    /* Delete each complete store prefix, including orphaned and future files. */
    await Promise.all(context.stores.map((store) =>
      getStorage().bucket().deleteFiles({prefix: `stores/${store.id}/`, force: true})));
  },

  async deleteFirestore(context: StoreDeletionContext): Promise<void> {
    const db = getFirestore("default");
    for (const store of context.stores) {
      await anonymizeStoreOrders(store.id, context.anonymousOwnerId);
      await Promise.all([
        deleteQuery(db.collection("products").where("storeId", "==", store.id)),
        deleteQuery(db.collection("productPublicProfiles").where("storeId", "==", store.id)),
        deleteQuery(db.collection("storeReviews").where("storeId", "==", store.id)),
        db.recursiveDelete(db.collection("storePublicProfiles").doc(store.id)),
        db.recursiveDelete(db.collection("stores").doc(store.id)),
      ]);
    }

    await Promise.all([
      deleteQuery(db.collection("notificationDevices").where("uid", "==", context.ownerId)),
      db.recursiveDelete(db.collection("storeWorkspaceStatuses").doc(context.ownerId)),
      db.recursiveDelete(db.collection("users").doc(context.ownerId)),
    ]);
  },

  async deleteAuthentication(context: StoreDeletionContext): Promise<void> {
    try {
      await getAuth().deleteUser(context.ownerId);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error &&
        error.code === "auth/user-not-found") return;
      throw error;
    }
  },
};
