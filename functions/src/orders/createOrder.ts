/*
|--------------------------------------------------------------------------
| Create Order
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Creates a new customer order.
|
| This is the single entry point for creating orders.
|
| Responsibilities:
|
| • Validate the request
| • Generate the order number
| • Create the initial timeline
| • Save the order
| • Notify the store
|
| Future responsibilities:
|
| • Inventory validation
| • Coupon validation
| • Tax calculation
| • Stripe Checkout
| • Fraud detection
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";

import { storeEvents } from "../events/storeEvents";

export const createOrder = onCall(
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

    const { order } = request.data;

    if (!order) {
      throw new HttpsError(
        "invalid-argument",
        "Order is required."
      );
    }

    const db =
      getFirestore("default");

    const orderNumber =
      `LIA-${Date.now()}`;

    const orderRef =
      await db.collection("orders").add({

        ...order,

        orderNumber,

        status: "pending",

        statusHistory: [

          {

            status: "pending",

            timestamp: new Date(),

            note: "Order created.",

          },

        ],

        createdAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),

      });

    console.log("Store object:");
console.log(order.store);

console.log("Store owner ID:");
console.log(order.store?.ownerId);

// Notify the store owner
// ----------------------------------------------------
// Notify the store owner.
// ----------------------------------------------------
//
// IMPORTANT:
// Notification failures should NEVER fail checkout.
// The order has already been created successfully.
//
// Push notifications are best-effort.
//
if (order.store?.ownerId) {

  console.log("Sending store notification...");

  try {

    await storeEvents.newOrder(
      orderRef.id,
      order.store.ownerId
    );

    console.log(
      "Store notification completed."
    );

  } catch (error) {

    console.error(
      "Store notification failed:",
      error
    );

    // Do NOT throw.
    // The order was successfully created.

  }

} else {

  console.log(
    "Store owner ID not found. Notification skipped."
  );

}

    return {

      success: true,

      orderId: orderRef.id,

      orderNumber,

    };

  }
);