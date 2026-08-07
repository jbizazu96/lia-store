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
import {
  syncStorePublicProfile,
  type StorePublicProfileSource,
} from "../services/store/storePublicProfileService";

interface StoreAnnouncementData {
  isApproved?: unknown;
  isActive?: unknown;
  name?: unknown;
  ownerId?: unknown;
  customerNotification?: {
    storeLiveAnnouncementEventId?: unknown;
    storeOwnerLiveAnnouncementEventId?: unknown;
  };
}

function isCustomerVisibleStore(data: StoreAnnouncementData | undefined): boolean {
  return data?.isApproved === true && data.isActive === true;
}

async function reserveLiveAnnouncement(
  storeReference: FirebaseFirestore.DocumentReference,
  marker:
    | "storeLiveAnnouncementEventId"
    | "storeOwnerLiveAnnouncementEventId",
  eventId: string
): Promise<boolean> {
  const db = getFirestore("default");

  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(storeReference);
    const currentData = current.data() as StoreAnnouncementData | undefined;

    if (
      !current.exists ||
      !isCustomerVisibleStore(currentData) ||
      currentData?.customerNotification?.[marker] === eventId
    ) {
      return false;
    }

    transaction.set(
      storeReference,
      {
        customerNotification: {
          ...(currentData?.customerNotification ?? {}),
          [marker]: eventId,
          [`${marker}At`]: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    return true;
  });
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

    /*
     * Firestore triggers are independent and can run in either order. Create
     * the sanitized customer profile before announcing the store so a tap on
     * this notification can always open the store, including when it is
     * currently closed.
     */
    await syncStorePublicProfile(
      storeId,
      after as StorePublicProfileSource
    );

    const storeName = typeof after.name === "string" && after.name.trim()
      ? after.name.trim()
      : "A new local store";

    const [shouldNotifyCustomers, shouldNotifyOwner] = await Promise.all([
      reserveLiveAnnouncement(
        afterSnapshot.ref,
        "storeLiveAnnouncementEventId",
        event.id
      ),
      reserveLiveAnnouncement(
        afterSnapshot.ref,
        "storeOwnerLiveAnnouncementEventId",
        event.id
      ),
    ]);

    if (shouldNotifyCustomers) {
      const customers = await db
        .collection("users")
        .where("accountType", "==", "customer")
        .get();

      const title = "New store now live";
      const body = storeName + " is now available on LIA.";
      const results = await Promise.allSettled(
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
            body,
            "/store/" + storeId,
          );
        })
      );

      const failures = results.filter(
        (result) => result.status === "rejected"
      ).length;

      console.log(
        "Announced newly live store " + storeId +
        " to " + customers.size + " customers; " +
        failures + " notification deliveries failed."
      );
    }

    const ownerId = typeof after.ownerId === "string"
      ? after.ownerId.trim()
      : "";

    if (shouldNotifyOwner && ownerId) {
      const title = "Your store is now live";
      const body = storeName + " is now visible to customers on LIA.";

      await notificationStore.createNotification({
        uid: ownerId,
        title,
        body,
        type: "system",
        icon: "store",
        color: "green",
        navigationPath: "/store/dashboard",
      });

      try {
        await notificationService.sendToUser(
          ownerId,
          title,
          body,
          "/store/dashboard",
        );
      } catch (error) {
        /* The in-app notification is saved even if no push device exists. */
        console.error(
          "Unable to send the store-live push notification.",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  }
);
