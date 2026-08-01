/*
|--------------------------------------------------------------------------
| Sync Store Orders
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Synchronizes all active deliveries for the currently
| authenticated store owner.
|
| The frontend calls this function whenever the
| Store Orders page opens.
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { deliverySyncService } from "./deliverySyncService";

export const syncStoreOrders = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
    secrets: [
      "SHIPDAY_API_KEY",
      "SHIPDAY_API_URL",
    ],
  },

  async (request) => {

    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const uid = request.auth.uid;

    const db = getFirestore("default");

    /*
      Resolve the store from the authenticated user's profile first. Do not
      log the profile because it can contain personal information.
    */
    const userDoc = await db
      .collection("users")
      .doc(uid)
      .get();

    const savedStoreId =
      userDoc.data()?.storeId;

    let storeId =
      typeof savedStoreId === "string" &&
      savedStoreId.trim()
        ? savedStoreId.trim()
        : undefined;

    /*
      Some valid store-owner profiles predate users/{uid}.storeId. Fall back
      to the canonical stores.ownerId relationship.
    */
    if (!storeId) {
      const storeSnapshot = await db
        .collection("stores")
        .where("ownerId", "==", uid)
        .limit(1)
        .get();

      if (!storeSnapshot.empty) {
        storeId = storeSnapshot.docs[0].id;
      }
    }

    if (!storeId) {
      throw new HttpsError(
        "not-found",
        "Store not found."
      );
    }

    /*
      This callable uses the Admin SDK, so verify ownership explicitly before
      allowing a store's delivery records to be synchronized.
    */
    const storeDoc = await db
      .collection("stores")
      .doc(storeId)
      .get();

    if (!storeDoc.exists) {
      throw new HttpsError(
        "not-found",
        "Store not found."
      );
    }

    if (
      storeDoc.data()?.ownerId !== uid
    ) {
      throw new HttpsError(
        "permission-denied",
        "You are not authorized to synchronize this store's deliveries."
      );
    }

    await deliverySyncService.syncStoreOrders(
      storeId
    );

    return {
      success: true,
      message: "Store orders synchronized.",
    };

  }
);
