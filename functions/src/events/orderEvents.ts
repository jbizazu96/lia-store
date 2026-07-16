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
    });

      await notificationService.sendToUser(
        customerUid,
        "Order Accepted",
        "The store has accepted your order."
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
    });

    await notificationService.sendToUser(
      customerUid,
      "Preparing Your Order",
      "The store is preparing your order."
    );

  }

  /**
   * Order is ready for pickup.
   *
   * Shipday order should already be created.
   */
  async orderReadyForPickup(
    orderId: string,
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification({
      uid: customerUid,
      title: "Ready For Pickup",
      body: "A driver will be assigned shortly.",
      type: "delivery",
      icon: "package-check",
      color: "indigo",
      orderId,
    });

    await notificationService.sendToUser(
      customerUid,
      "Ready For Pickup",
      "A driver will be assigned shortly."
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
      });

    await notificationService.sendToUser(
      customerUid,
      "Out For Delivery",
      "Your order is on the way."
    );

  }

  /**
   * Order delivered.
   */
  async orderCompleted(
    orderId: string,
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification({
      uid: customerUid,
      title: "Order Delivered",
      body: "Your order has been delivered.",
      type: "delivery",
      icon: "check-circle",
      color: "green",
      orderId,
    });

    await notificationService.sendToUser(
      customerUid,
      "Order Delivered",
      "Your order has been delivered."
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
    });

    await notificationService.sendToUser(
      customerUid,
      "Order Cancelled",
      "Your order has been cancelled."
    );

  }

}

export const orderEvents =
  new OrderEvents();