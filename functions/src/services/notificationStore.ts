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

export class NotificationStore {

  /**
   * Creates an in-app notification.
   */
  async createNotification(
    uid: string,
    title: string,
    body: string,
    type: "order" | "delivery" | "promotion" | "system",
    orderId?: string
  ): Promise<void> {

    await getFirestore("default")
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .add({

        uid,

        title,

        body,

        type,

        orderId,

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