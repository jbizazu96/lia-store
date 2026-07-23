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

      "You have received a new customer order."

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
      body
    );
  }

}

export const storeEvents =
  new StoreEvents();
