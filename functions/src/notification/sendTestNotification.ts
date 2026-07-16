/*
|--------------------------------------------------------------------------
| Send Test Notification
|--------------------------------------------------------------------------
|
| Sends a test push notification to the currently
| authenticated user's registered devices.
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";

import { notificationService } from "../services/notificationService";

export const sendTestNotification = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },

  async (request) => {

    if (!request.auth) {

      throw new HttpsError(
        "unauthenticated",
        "Authentication required."
      );

    }

    const uid = request.auth.uid;

   await notificationService.sendToUser(
  uid,
  "🎉 LIA Notifications",
  "Congratulations! Push notifications are working."
);

    return {
      success: true,
    };

  }
);