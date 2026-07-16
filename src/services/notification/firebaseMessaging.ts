/*
|--------------------------------------------------------------------------
| Firebase Messaging
|--------------------------------------------------------------------------
|
| Handles Firebase Cloud Messaging (FCM) initialization.
|
*/
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { getToken } from "firebase/messaging";
import { getFirebaseMessaging } from "@/lib/firebase";

export class FirebaseMessaging {

  /**
   * Requests notification permission.
   */
  async requestPermission(): Promise<boolean> {

    const permission =
      await Notification.requestPermission();

    return permission === "granted";

  }

  /**
   * Retrieves the Firebase Cloud Messaging token.
   */
  async getToken(): Promise<string | null> {

    const messaging =
      await getFirebaseMessaging();

    if (!messaging) {
      console.log(
        "Firebase Messaging is not supported."
      );

      return null;
    }

   const registration =
    await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
    );

    // Wait until the service worker is active.
    await navigator.serviceWorker.ready;

    const token =
    await getToken(
        messaging,
        {
          vapidKey:
            process.env
              .NEXT_PUBLIC_FIREBASE_VAPID_KEY,

          serviceWorkerRegistration:
            registration,
        }
      );

    if (!token) {

      console.log(
        "Unable to obtain an FCM token."
      );

      return null;

    }

    console.log(
      "FCM Token:"
    );

    console.log(token);

    return token;

  }

  /**
 * Registers the current device in Firestore.
 */
async registerDevice(): Promise<void> {

  const permission =
    await this.requestPermission();

  if (!permission) {

    console.log(
      "Notification permission denied."
    );

    return;

  }

  const token =
    await this.getToken();

  if (!token) {
    return;
  }

  const user =
    auth.currentUser;

  if (!user) {
    return;
  }

  await addDoc(

    collection(
      db,
      "notificationDevices"
    ),

    {

      uid: user.uid,

      token,

      active: true,

      createdAt:
        serverTimestamp(),

    }

  );

  console.log(
    "Device successfully registered."
  );

}

}

/**
 * Shared singleton.
 */
export const firebaseMessaging =
  new FirebaseMessaging();