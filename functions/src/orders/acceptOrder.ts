/*
|--------------------------------------------------------------------------
| Accept Order
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Accepts an order on behalf of the store.
|
| This is the ONLY place that should perform the
| order acceptance workflow.
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const acceptOrder = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const { orderId } = request.data;

    if (!orderId) {
      throw new HttpsError(
        "invalid-argument",
        "Order ID is required."
      );
    }

    const db = getFirestore("default");

    const orderRef =
      db.collection("orders").doc(orderId);

    const snapshot =
      await orderRef.get();

    if (!snapshot.exists) {
      throw new HttpsError(
        "not-found",
        "Order not found."
      );
    }

    const order = snapshot.data();

    if (!order) {
      throw new HttpsError(
        "not-found",
        "Order data not found."
      );
    }

    // --------------------------------------------
    // Update Firestore
    // --------------------------------------------

    await orderRef.update({

      status: "accepted",

      updatedAt: FieldValue.serverTimestamp(),

      statusHistory: FieldValue.arrayUnion({

        status: "accepted",

        timestamp: new Date(),

        note: "Order accepted by store.",

      }),

    });

    return {

      success: true,

    };

  }
);