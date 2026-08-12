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

  /** Deterministic key used by retryable jobs to avoid duplicate alerts. */
  dedupeKey?: string;

}
export class NotificationStore {

  /**
   * Creates an in-app notification.
   */
  async createNotification(
  input: CreateNotificationInput
  ): Promise<boolean> {

    const notification = {
      uid: input.uid,
      title: input.title,
      body: input.body,
      type: input.type,
      icon: input.icon,
      color: input.color,
      ...(input.navigationPath
        ? {
            deepLink: input.orderId
              ? `${input.navigationPath}/${input.orderId}`
              : input.navigationPath,
          }
        : {}),
      ...(input.orderId
        ? { orderId: input.orderId }
        : {}),
      read: false,
      createdAt: new Date(),
    };

    const notifications = getFirestore("default")
      .collection("users")
      .doc(input.uid)
      .collection("notifications");

    if (input.dedupeKey) {
      const safeKey = input.dedupeKey.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 180);
      if (!safeKey) throw new Error("A valid notification dedupe key is required.");
      try {
        await notifications.doc(safeKey).create(notification);
      } catch (error) {
        const code = (error as {code?: unknown}).code;
        if (code === 6 || code === "already-exists") return false;
        throw error;
      }
    } else {
      await notifications.add(notification);
    }

    console.log(
      "Notification stored."
    );

    return true;

  }

}

export const notificationStore =
  new NotificationStore();
