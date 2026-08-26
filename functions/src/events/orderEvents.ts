/*
|--------------------------------------------------------------------------
| Order Events
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Central dispatcher for every business event in LIA.
|
| This file coordinates:
|
| • Push Notifications
| • Shipday Integration
| • Email (future)
| • SMS (future)
| • Analytics (future)
|
*/

import { notificationStore } from "../services/notificationStore";
import { notificationService } from "../services/notificationService";

export class OrderEvents {

  /**
   * Store accepted the order.
   */
  async orderAccepted(
    orderId: string,
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification({
      uid: customerUid,
      title: "Order Accepted",
      body: "The store has accepted your order.",
      type: "order",
      icon: "shopping-bag",
      color: "orange",
      orderId,
      navigationPath: "/orders",
    });

      await notificationService.sendToUser(
        customerUid,
        "Order Accepted",
        "The store has accepted your order.",
        "/orders/" + orderId,
        "orderUpdates",
      );

  }

  /**
   * Store started preparing.
   */
  async orderPreparing(
    orderId: string,
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification({
      uid: customerUid,
      title: "Preparing Your Order",
      body: "The store is preparing your order.",
      type: "order",
      icon: "package",
      color: "purple",
      orderId,
      navigationPath: "/orders",
    });

    await notificationService.sendToUser(
      customerUid,
      "Preparing Your Order",
      "The store is preparing your order.",
      "/orders/" + orderId,
      "orderUpdates",
    );

  }

  /**
   * Order is ready for pickup.
   *
   * Shipday order should already be created.
   */
  async orderReadyForPickup(
    orderId: string,
    customerUid: string,
    fulfillmentType: "delivery" | "pickup",
  ): Promise<void> {

    const customerPickup = fulfillmentType === "pickup";
    const title = customerPickup ? "Ready For Your Pickup" : "Ready For Driver Pickup";
    const body = customerPickup
      ? "Your order is ready. Open LIA to view the pickup code before going to the store."
      : "A driver will be assigned shortly.";

    await notificationStore.createNotification({
      uid: customerUid,
      title,
      body,
      type: "delivery",
      icon: "package-check",
      color: "indigo",
      orderId,
      navigationPath: "/orders",
    });

    await notificationService.sendToUser(
      customerUid,
      title,
      body,
      "/orders/" + orderId,
      "orderUpdates",
    );

  }

  /**
   * Driver picked up the order.
   */
  async orderOutForDelivery(
    orderId: string,
    customerUid: string
  ): Promise<void> {

      await notificationStore.createNotification({
        uid: customerUid,
        title: "Out For Delivery",
        body: "Your order is on the way.",
        type: "delivery",
        icon: "truck",
        color: "blue",
        orderId,
        navigationPath: "/orders",
      });

    await notificationService.sendToUser(
      customerUid,
      "Out For Delivery",
      "Your order is on the way.",
      "/orders/" + orderId,
      "orderUpdates",
    );

  }

  /**
   * Order delivered.
   */
  async orderCompleted(
    orderId: string,
    customerUid: string,
    fulfillmentType: "delivery" | "pickup",
  ): Promise<void> {

    const title = fulfillmentType === "pickup" ? "Order Picked Up" : "Order Delivered";
    const body = fulfillmentType === "pickup"
      ? "Your pickup is complete. Tap to share your verified store review."
      : "Your order has been delivered. Tap to share your verified store review.";

    await notificationStore.createNotification({
      uid: customerUid,
      title,
      body,
      type: "delivery",
      icon: "check-circle",
      color: "green",
      orderId,
      navigationPath: "/orders",
    });

    await notificationService.sendToUser(
      customerUid,
      title,
      body,
      "/orders/" + orderId,
      "orderUpdates",
    );

  }

  /**
   * Order cancelled.
   */
  async orderCancelled(
    orderId: string,
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification({
      uid: customerUid,
      title: "Order Cancelled",
      body: "Your order has been cancelled.",
      type: "order",
      icon: "x-circle",
      color: "red",
      orderId,
      navigationPath: "/orders",
    });

    await notificationService.sendToUser(
      customerUid,
      "Order Cancelled",
      "Your order has been cancelled.",
      "/orders/" + orderId,
      "orderUpdates",
    );

  }

}

export const orderEvents =
  new OrderEvents();
