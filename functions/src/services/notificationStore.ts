/*
|--------------------------------------------------------------------------
| Notification Store
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Persists notifications inside Firestore.
|
| Every notification created by the backend should go through
| this service.
|
*/

import { getFirestore } from "firebase-admin/firestore";

interface CreateNotificationInput {

  uid: string;

  title: string;

  body: string;

  type:
    | "order"
    | "delivery"
    | "promotion"
    | "inventory"
    | "system";

  icon: string;

  color: string;

  orderId?: string;

  /**
   * Base path the notification should open.
   *
   * Examples:
   * /orders
   * /store/store-orders
   * /admin/orders
   */
  navigationPath?: string;

}
export class NotificationStore {

  /**
   * Creates an in-app notification.
   */
  async createNotification(
  input: CreateNotificationInput
  ): Promise<void> {

    await getFirestore("default")
      .collection("users")
      .doc(input.uid)
      .collection("notifications")
      .add({

        uid: input.uid,

        title: input.title,

        body: input.body,

        type: input.type,

        icon: input.icon,

        color: input.color,

        deepLink:
          input.navigationPath
            ? input.orderId
              ? `${input.navigationPath}/${input.orderId}`
              : input.navigationPath
            : undefined,

        orderId: input.orderId,

        read: false,

        createdAt: new Date(),

      });

    console.log(
      "Notification stored."
    );

  }

}

export const notificationStore =
  new NotificationStore();
