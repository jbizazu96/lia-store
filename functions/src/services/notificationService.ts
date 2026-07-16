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
    body: string
  ): Promise<void> {

    await getMessaging().send({

      token,

      notification: {

        title,

        body,

      },

    });

    console.log(
      "Push notification sent."
    );

  }

  /**
 * Sends a notification to every active
 * device registered for a user.
 */
async sendToUser(
  uid: string,
  title: string,
  body: string
): Promise<void> {

  console.log("Looking up notification devices...");
  console.log("UID:", uid);

  const db = getFirestore("default");

  console.log("Firestore initialized.");

  const snapshot = await db
    .collection("notificationDevices")
    .where("uid", "==", uid)
    .where("active", "==", true)
    .get();

  console.log(
    `Found ${snapshot.size} notification devices.`
  );

  if (snapshot.empty) {

    console.log(
      `No notification devices found for ${uid}`
    );

    return;

  }

  for (const document of snapshot.docs) {

    const device = document.data();

    await this.sendToDevice(
      device.token,
      title,
      body
    );

  }

}

}

/**
 * Shared singleton.
 */
export const notificationService =
  new NotificationService();