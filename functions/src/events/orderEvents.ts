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
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification(
        customerUid,
        "Order Accepted",
        "The store has accepted your order.",
        "order"
      );

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
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification(
      customerUid,
      "Preparing Your Order",
      "The store is preparing your order.",
      "order"
    );

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
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification(
      customerUid,
      "Ready For Pickup",
      "A driver will be assigned shortly.",
      "delivery"
    );

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
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification(
      customerUid,
      "Out For Delivery",
      "Your order is on the way.",
      "delivery"
    );

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
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification(
      customerUid,
      "Order Delivered",
      "Your order has been delivered.",
      "delivery"
    );

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
    customerUid: string
  ): Promise<void> {

    await notificationStore.createNotification(
      customerUid,
      "Order Cancelled",
      "Your order has been cancelled.",
      "order"
    );

    await notificationService.sendToUser(
      customerUid,
      "Order Cancelled",
      "Your order has been cancelled."
    );

  }

}

export const orderEvents =
  new OrderEvents();