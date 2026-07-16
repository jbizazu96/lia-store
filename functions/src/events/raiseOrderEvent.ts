/*
|--------------------------------------------------------------------------
| Raise Order Event
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Receives an order status from the frontend and raises
| the appropriate business event.
|
| This keeps React completely unaware of notifications,
| emails, SMS, analytics, etc.
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { orderEvents } from "./orderEvents";

export const raiseOrderEvent = onCall(
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

    const { orderId, status } = request.data;

    if (!orderId || !status) {
      throw new HttpsError(
        "invalid-argument",
        "Order ID and status are required."
      );
    }

    const db = getFirestore("default");

    const orderDoc = await db
      .collection("orders")
      .doc(orderId)
      .get();

    if (!orderDoc.exists) {
      throw new HttpsError(
        "not-found",
        "Order not found."
      );
    }

    const order = orderDoc.data();

    if (!order?.customer?.uid) {
      throw new HttpsError(
        "failed-precondition",
        "Customer UID missing."
      );
    }

    switch (status) {

      case "accepted":
        await orderEvents.orderAccepted(
          order.id,
          order.customer.uid
        );
        break;

      case "preparing":
        await orderEvents.orderPreparing(
          order.id,
          order.customer.uid
        );
        break;

      case "ready_for_pickup":
        await orderEvents.orderReadyForPickup(
          order.id,
          order.customer.uid
        );
        break;

      case "out_for_delivery":
        await orderEvents.orderOutForDelivery(
          order.id,
          order.customer.uid
        );
        break;

      case "completed":
        await orderEvents.orderCompleted(
          order.id,
          order.customer.uid
        );
        break;

      case "cancelled":
        await orderEvents.orderCancelled(
          order.id,
          order.customer.uid
        );
        break;

      default:
        console.log(
          `No business event for status: ${status}`
        );
    }

    return {
      success: true,
    };

  }
);