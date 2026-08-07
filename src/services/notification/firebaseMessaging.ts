/*
|--------------------------------------------------------------------------
| Firebase Messaging
|--------------------------------------------------------------------------
|
| Handles Firebase Cloud Messaging (FCM) initialization.
|
*/
import { auth, functions } from "@/lib/firebase";
import {
  getToken,
  onMessage,
  type Unsubscribe,
} from "firebase/messaging";
import { httpsCallable } from "firebase/functions";
import { getFirebaseMessaging } from "@/lib/firebase";

export class FirebaseMessaging {
  private foregroundMessageUnsubscribe: Unsubscribe | null = null;

  private deviceId(): string {
    const key = "lia.notification-device-id";
    const existing = window.localStorage.getItem(key);

    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
      return existing;
    }

    const created = globalThis.crypto?.randomUUID?.() ??
      Date.now().toString() + "-" + Math.random().toString(36).slice(2);
    window.localStorage.setItem(key, created);
    return created;
  }

  private startForegroundMessageListener(): void {
    if (this.foregroundMessageUnsubscribe) {
      return;
    }

    void getFirebaseMessaging().then((messaging) => {
      if (!messaging || this.foregroundMessageUnsubscribe) {
        return;
      }

      this.foregroundMessageUnsubscribe = onMessage(
        messaging,
        (payload) => {
          if (Notification.permission !== "granted") {
            return;
          }

          const title = payload.notification?.title ?? "LIA";
          const body = payload.notification?.body ??
            "You have a new update.";
          const candidate = payload.data?.deepLink;
          const deepLink = typeof candidate === "string" &&
            candidate.startsWith("/") &&
            !candidate.startsWith("//")
            ? candidate
            : "/home";
          const notification = new Notification(title, {
            body,
            icon: "/icon/icon-192.png",
            badge: "/icon/icon-192.png",
          });

          notification.onclick = () => {
            window.focus();
            window.location.assign(deepLink);
            notification.close();
          };
        },
      );
    });
  }

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

    const vapidKey =
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

    if (!vapidKey) {
      throw new Error(
        "Push notifications are unavailable because the Firebase VAPID key is missing."
      );
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
          vapidKey,

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

    return token;

  }

  /**
   * Registers one stable browser installation through a trusted Function.
   */
  async registerDevice(): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      return;
    }

    const permission = Notification.permission === "granted"
      ? true
      : await this.requestPermission();

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

    const deviceId = this.deviceId();
    const cacheKey = "lia.notification-device:" + user.uid;
    const registrationValue = deviceId + ":" + token;

    this.startForegroundMessageListener();

    if (window.localStorage.getItem(cacheKey) === registrationValue) {
      return;
    }

    const register = httpsCallable<
      {
        token: string;
        deviceId: string;
        platform: string;
        userAgent: string;
      },
      {registered: boolean; tokenChanged: boolean}
    >(functions, "registerNotificationDevice");

    await register({
      token,
      deviceId,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    });

    window.localStorage.setItem(cacheKey, registrationValue);
  }

}

/**
 * Shared singleton.
 */
export const firebaseMessaging =
  new FirebaseMessaging();
