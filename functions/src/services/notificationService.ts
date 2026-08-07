/*
|--------------------------------------------------------------------------
| Notification Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Sends push notifications through Firebase Cloud Messaging.
|
| All Cloud Functions should use this service instead of
| talking directly to Firebase Admin Messaging.
|
*/

import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export type NotificationPreference =
  | "orderUpdates"
  | "paymentUpdates"
  | "promotions"
  | "storeUpdates"
  | "productUpdates"
  | "productStock"
  | "marketing";

async function accountAllowsPush(
  uid: string,
  preference: NotificationPreference | undefined,
): Promise<boolean> {
  const db = getFirestore("default");
  const user = await db
    .collection("users")
    .doc(uid)
    .get();
  const data = user.data();

  if (!user.exists) return true;

  if (data?.accountType === "customer") {
    if (!preference) return true;

    const settings = data.notificationPreferences;

    /* Every customer category is enabled by default. */
    if (!settings || typeof settings !== "object") return true;

    const enabled = (settings as Record<string, unknown>)[preference];
    return enabled !== false;
  }

  if (data?.accountType !== "store_owner") return true;

  const stores = await db
    .collection("stores")
    .where("ownerId", "==", uid)
    .limit(1)
    .get();
  const store = stores.docs[0]?.data();

  if (!store) return true;
  if (store.pushNotifications === false) return false;
  if (!preference) return true;

  const preferenceField: Partial<Record<NotificationPreference, string>> = {
    orderUpdates: "orderNotifications",
    paymentUpdates: "paymentNotifications",
    productStock: "productStockNotifications",
  };
  const field = preferenceField[preference];

  /* Store categories without a setting remain enabled until one is added. */
  return !field || store[field] !== false;
}

export class NotificationService {

  /**
   * Send a push notification to one device.
   */
  async sendToDevice(
    token: string,
    title: string,
    body: string,
    deepLink?: string,
  ): Promise<void> {

    await getMessaging().send({

      token,

      notification: {

        title,

        body,

      },

      ...(deepLink
        ? {
          data: {
            deepLink,
          },
        }
        : {}),

    });

  }

  /**
 * Sends a notification to every active
 * device registered for a user.
 */
async sendToUser(
  uid: string,
  title: string,
  body: string,
  deepLink?: string,
  preference?: NotificationPreference,
): Promise<void> {
  const db = getFirestore("default");

  if (!(await accountAllowsPush(uid, preference))) return;

  const snapshot = await db
    .collection("notificationDevices")
    .where("uid", "==", uid)
    .where("active", "==", true)
    .get();

  if (snapshot.empty) {
    return;
  }

  const devicesByToken = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();

  snapshot.docs.forEach((document) => {
    const token = typeof document.data().token === "string"
      ? document.data().token.trim()
      : "";

    if (!token) {
      return;
    }

    devicesByToken.set(
      token,
      [...(devicesByToken.get(token) ?? []), document],
    );
  });

  await Promise.allSettled(
    Array.from(devicesByToken.entries()).map(
      async ([token, documents]) => {
        try {
          await this.sendToDevice(token, title, body, deepLink);
        } catch (error) {
          const code = (error as {code?: unknown}).code;
          const invalidToken = code ===
            "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token";

          if (invalidToken) {
            const batch = db.batch();
            documents.forEach((document) => batch.delete(document.ref));
            await batch.commit();
          }

          console.error("Push notification delivery failed.", {
            code: typeof code === "string" ? code : "unknown",
          });
        }
      },
    ),
  );

}

}

/**
 * Shared singleton.
 */
export const notificationService =
  new NotificationService();
