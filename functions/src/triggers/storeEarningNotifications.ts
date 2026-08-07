/*
|--------------------------------------------------------------------------
| Store Earning Notifications
|--------------------------------------------------------------------------
|
| Marketplace transfers are server-created only after a completed delivery.
| This trigger tells the store owner when its earned amount is pending and
| when Stripe has completed the transfer. Deterministic notification IDs make
| retries safe: one transfer produces at most one notification per event.
|
*/

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  notificationService,
} from "../services/notificationService";

interface StoreTransferData {
  orderId?: unknown;
  amount?: unknown;
  status?: unknown;
  recipient?: {
    type?: unknown;
    id?: unknown;
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amountInCents(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

async function createStoreNotification(input: {
  transferId: string;
  storeId: string;
  orderId: string;
  amount: number;
  state: "pending" | "completed";
}): Promise<void> {
  const db = getFirestore("default");
  const store = await db.collection("stores").doc(input.storeId).get();
  const ownerId = text(store.data()?.ownerId);

  if (!ownerId) {
    console.error("Store earning notification skipped: store owner is missing.", {
      storeId: input.storeId,
      transferId: input.transferId,
    });
    return;
  }

  const isCompleted = input.state === "completed";
  const title = isCompleted ? "Earnings paid" : "Earnings pending";
  const body = isCompleted
    ? `${money(input.amount)} for order ${input.orderId} has been sent to your payout account.`
    : `${money(input.amount)} for order ${input.orderId} is pending payout after delivery.`;
  const notificationReference = db
    .collection("users")
    .doc(ownerId)
    .collection("notifications")
    .doc(`store-earning-${input.transferId}-${input.state}`);

  /* create() makes duplicate trigger delivery harmless and observable. */
  try {
    await notificationReference.create({
      uid: ownerId,
      title,
      body,
      type: "system",
      icon: "dollar-sign",
      color: isCompleted ? "green" : "orange",
      deepLink: "/store/earnings",
      orderId: input.orderId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 6 || code === "already-exists") {
      return;
    }

    throw error;
  }

  try {
    await notificationService.sendToUser(
      ownerId,
      title,
      body,
      "/store/earnings",
    );
  } catch (error) {
    /* The in-app notification remains available if a push device fails. */
    console.error("Unable to send store earning push notification.", {
      transferId: input.transferId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export const storeEarningNotifications = onDocumentWritten(
  {
    document: "paymentTransfers/{transferId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;

    if (!after?.exists) {
      return;
    }

    const transfer = after.data() as StoreTransferData;
    const recipient = transfer.recipient;
    const storeId = text(recipient?.id);
    const orderId = text(transfer.orderId);
    const amount = amountInCents(transfer.amount);

    if (
      recipient?.type !== "store" ||
      !storeId ||
      !orderId ||
      amount === null
    ) {
      return;
    }

    const beforeStatus = text(before?.data()?.status);
    const afterStatus = text(transfer.status);

    if (!before?.exists && afterStatus === "pending") {
      await createStoreNotification({
        transferId: event.params.transferId,
        storeId,
        orderId,
        amount,
        state: "pending",
      });
      return;
    }

    if (beforeStatus !== "completed" && afterStatus === "completed") {
      await createStoreNotification({
        transferId: event.params.transferId,
        storeId,
        orderId,
        amount,
        state: "completed",
      });
    }
  },
);
