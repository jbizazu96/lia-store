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
): Promise<void> {
  const db = getFirestore("default");

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
