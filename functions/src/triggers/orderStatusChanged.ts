/*
|--------------------------------------------------------------------------
| Order Status Changed Trigger
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Watches every order document.
|
| Whenever the order status changes, this trigger raises
| the appropriate LIA business event.
|
| This means:
|
| ✔ Web App
| ✔ iPhone App
| ✔ Android App
| ✔ Admin Dashboard
| ✔ Shipday Webhook
|
| all automatically send notifications without any
| frontend code.
|
*/

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { orderEvents } from "../events/orderEvents";

export const orderStatusChanged =
  onDocumentUpdated(
    {
      document: "orders/{orderId}",
      region: "us-central1",
      database: "default",
    },

    async (event) => {

      const before = event.data?.before.data();
      const after = event.data?.after.data();

      if (!before || !after) {
        return;
      }

      // Nothing changed.
      if (before.status === after.status) {
        return;
      }

      console.log(
        `Order status changed: ${before.status} -> ${after.status}`
      );

      const orderId = event.params.orderId;
      const customerUid = after.customer?.uid;

      if (!customerUid) {
        console.log("Customer UID missing.");
        return;
      }

      switch (after.status) {

        case "accepted":
          await orderEvents.orderAccepted(
            orderId,
            customerUid
          );
          break;

        case "preparing":
          await orderEvents.orderPreparing(
            orderId,
            customerUid
          );
          break;

        case "ready_for_pickup":
          await orderEvents.orderReadyForPickup(
            orderId,
            customerUid
          );
          break;

        case "out_for_delivery":
          await orderEvents.orderOutForDelivery(
            orderId,
            customerUid
          );
          break;

        case "completed":
          await orderEvents.orderCompleted(
            orderId,
            customerUid
          );
          break;

        case "cancelled":
          await orderEvents.orderCancelled(
            orderId,
            customerUid
          );
          break;

        default:
          console.log(
            `Unhandled order status: ${after.status}`
          );
      }

    }
  );