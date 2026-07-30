/*
|--------------------------------------------------------------------------
| New Store Customer Notifications
|--------------------------------------------------------------------------
|
| Announces a store only when it becomes both approved and active. The
| announcement marker on the store document makes the Firestore trigger
| idempotent when Google retries the same event.
|
*/
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { notificationService } from "../services/notificationService";
import { notificationStore } from "../services/notificationStore";

interface StoreAnnouncementData {
  isApproved?: unknown;
  isActive?: unknown;
  name?: unknown;
  customerNotification?: {
    storeLiveAnnouncementSent?: unknown;
  };
}

function isCustomerVisibleStore(data: StoreAnnouncementData | undefined): boolean {
  return data?.isApproved === true && data.isActive === true;
}

export const storeCustomerNotifications = onDocumentWritten(
  {
    document: "stores/{storeId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const beforeSnapshot = event.data?.before;
    const afterSnapshot = event.data?.after;

    if (!afterSnapshot?.exists) {
      return;
    }

    const before = beforeSnapshot?.data() as StoreAnnouncementData | undefined;
    const after = afterSnapshot.data() as StoreAnnouncementData;

    /* Notify only on the transition from not-live to approved and active. */
    if (isCustomerVisibleStore(before) || !isCustomerVisibleStore(after)) {
      return;
    }

    const db = getFirestore("default");
    const storeId = event.params.storeId;
    const storeName = typeof after.name === "string" && after.name.trim()
      ? after.name.trim()
      : "A new local store";

    /* Reserve the one-time announcement before sending notifications. */
    const shouldNotify = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(afterSnapshot.ref);
      const currentData = current.data() as StoreAnnouncementData | undefined;

      if (
        !current.exists ||
        !isCustomerVisibleStore(currentData) ||
        currentData?.customerNotification?.storeLiveAnnouncementSent === true
      ) {
        return false;
      }

      transaction.set(
        afterSnapshot.ref,
        {
          customerNotification: {
            ...(currentData?.customerNotification ?? {}),
            storeLiveAnnouncementSent: true,
            storeLiveAnnouncementSentAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );

      return true;
    });

    if (!shouldNotify) {
      return;
    }

    const customers = await db
      .collection("users")
      .where("accountType", "==", "customer")
      .get();

    const title = "New store now live";
    const body = storeName + " is now available on LIA.";

    await Promise.allSettled(
      customers.docs.map(async (customer) => {
        await notificationStore.createNotification({
          uid: customer.id,
          title,
          body,
          type: "system",
          icon: "store",
          color: "green",
          navigationPath: "/store/" + storeId,
        });

        await notificationService.sendToUser(
          customer.id,
          title,
          body
        );
      })
    );

    console.log(
      "Announced newly live store " + storeId +
      " to " + customers.size + " customers."
    );
  }
);
