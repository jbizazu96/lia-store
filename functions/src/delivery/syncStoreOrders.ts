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

    // Find this user's store.
    console.log("Authenticated UID:", uid);

console.log("Loading user document...");

const db = getFirestore("default");

const userDoc = await db
  .collection("users")
  .doc(uid)
  .get();

console.log("User document exists:", userDoc.exists);

console.log("User data:", userDoc.data());

const storeId = userDoc.data()?.storeId;

console.log("Resolved storeId:", storeId);

    if (!storeId) {
      throw new HttpsError(
        "not-found",
        "Store not found."
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