/*
|--------------------------------------------------------------------------
| Store Events
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Handles every business event targeted at store owners.
|
| This file is responsible for:
|
| • New Orders
| • Customer Cancellations
| • Inventory Alerts (future)
| • Payment Notifications (future)
|
| Store pages never create notifications directly.
| They raise business events instead.
|
*/

import { notificationStore } from "../services/notificationStore";
import { notificationService } from "../services/notificationService";

export class StoreEvents {

  /**
   * Customer placed a new order.
   */
  async newOrder(
    orderId: string,
    storeOwnerUid: string
  ): Promise<void> {

await notificationStore.createNotification({

  uid: storeOwnerUid,

  title: "New Order",

  body: "You have received a new customer order.",

  type: "order",

  icon: "shopping-bag",

  color: "green",

  orderId,

  navigationPath: "/store/store-orders",

});

    await notificationService.sendToUser(

      storeOwnerUid,

      "New Order",
      "You have received a new customer order.",
      "/store/store-orders/" + orderId,
      "orderUpdates",

    );

  }

  /**
   * Reminds a store owner when an order has remained in a staff-controlled
   * status for too long. The scheduler supplies the count so each reminder
   * remains understandable in the in-app notification list.
   */
  async orderStatusReminder(
    orderId: string,
    storeOwnerUid: string,
    status: "pending" | "accepted" | "preparing",
    reminderCount: number,
    orderNumber?: string
  ): Promise<void> {
    const statusLabel = {
      pending: "pending",
      accepted: "accepted",
      preparing: "being prepared",
    }[status];

    const orderLabel = orderNumber?.trim()
      ? `Order ${orderNumber}`
      : "A customer order";

    const title = "Order action reminder";
    const body = `${orderLabel} is still ${statusLabel}. Please update it when you are ready. (Reminder ${reminderCount})`;

    await notificationStore.createNotification({
      uid: storeOwnerUid,
      title,
      body,
      type: "order",
      icon: "clock",
      color: "orange",
      orderId,
      navigationPath: "/store/store-orders",
    });

    await notificationService.sendToUser(
      storeOwnerUid,
      title,
      body,
      "/store/store-orders/" + orderId,
      "orderUpdates",
    );
  }

  /** Alerts an accepted scheduled order when its preparation lead window opens. */
  async scheduledPreparationReady(
    orderId: string,
    storeOwnerUid: string,
    orderNumber?: string,
  ): Promise<void> {
    const orderLabel = orderNumber?.trim() ? `Order ${orderNumber}` : "Your scheduled order";
    const title = "Time to start preparing";
    const body = `${orderLabel} has reached its preparation time. Start preparing it for the selected fulfillment window.`;
    const created = await notificationStore.createNotification({
      uid: storeOwnerUid,
      title,
      body,
      type: "order",
      icon: "clock",
      color: "orange",
      orderId,
      navigationPath: "/store/store-orders",
      dedupeKey: `scheduled-preparation-${orderId}`,
    });

    if (!created) return;
    await notificationService.sendToUser(
      storeOwnerUid,
      title,
      body,
      `/store/store-orders/${orderId}`,
      "orderUpdates",
    );
  }

  /**
   * Product stock crossed a low-inventory alert threshold after an order.
   */
  async lowStock(
    productId: string,
    productName: string,
    remainingStock: number,
    storeOwnerUid: string
  ): Promise<void> {
    const title =
      remainingStock === 0
        ? "Product out of stock"
        : "Low stock alert";

    const body =
      remainingStock === 0
        ? `${productName} is now out of stock.`
        : `${productName} has ${remainingStock} left in stock.`;

    await notificationStore.createNotification({
      uid: storeOwnerUid,
      title,
      body,
      type: "inventory",
      icon: "package",
      color: remainingStock === 0 ? "red" : "orange",
      navigationPath: `/store/products/${productId}`,
    });

    await notificationService.sendToUser(
      storeOwnerUid,
      title,
      body,
      "/store/products/" + productId,
      "productStock",
    );
  }

}

export const storeEvents =
  new StoreEvents();
