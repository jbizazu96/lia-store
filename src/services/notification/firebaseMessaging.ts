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
import {
  capacitorNotificationAdapter,
  type NotificationPermissionState,
} from "./capacitorNotificationAdapter";
import {
  openLiaDeepLink,
} from "./notificationDeepLink";

export type {
  NotificationPermissionState,
} from "./capacitorNotificationAdapter";

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
          const notification = new Notification(title, {
            body,
            icon: "/icon/icon-192.png",
            badge: "/icon/icon-192.png",
          });

          notification.onclick = () => {
            window.focus();
            openLiaDeepLink(payload.data?.deepLink);
            notification.close();
          };
        },
      );
    });
  }

  /**
   * Requests notification permission.
   */
  async getPermissionStatus(): Promise<NotificationPermissionState> {
    if (capacitorNotificationAdapter.isNativeApp()) {
      return capacitorNotificationAdapter.getPermission();
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }

    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "prompt";
  }

  async requestPermission(): Promise<boolean> {
    if (capacitorNotificationAdapter.isNativeApp()) {
      return (
        await capacitorNotificationAdapter.requestPermission()
      ) === "granted";
    }

    const permission =
      await Notification.requestPermission();

    return permission === "granted";

  }

  /**
   * Retrieves the Firebase Cloud Messaging token.
   */
  async getToken(): Promise<string | null> {
    if (capacitorNotificationAdapter.isNativeApp()) {
      return capacitorNotificationAdapter.getToken();
    }

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
  async registerDevice(
    options: {
      requestPermission?: boolean;
    } = {},
  ): Promise<boolean> {
    const native = capacitorNotificationAdapter.isNativeApp();

    if (
      typeof window === "undefined" ||
      (!native && !("Notification" in window))
    ) {
      return false;
    }

    if (native) {
      await capacitorNotificationAdapter.initialize();
    }

    const user = auth.currentUser;

    if (!user) {
      return false;
    }

    let permission = await this.getPermissionStatus();
    if (permission === "prompt" && options.requestPermission === true) {
      permission = await this.getPermissionStatus() === "prompt" &&
        await this.requestPermission()
        ? "granted"
        : await this.getPermissionStatus();
    }

    if (permission !== "granted") {
      return false;
    }

    const token =
      await this.getToken();

    if (!token) {
      return false;
    }

    const deviceId = this.deviceId();
    const cacheKey = "lia.notification-device:" + user.uid;
    const registrationValue = deviceId + ":" + token;

    if (!native) {
      this.startForegroundMessageListener();
    }

    if (window.localStorage.getItem(cacheKey) === registrationValue) {
      return true;
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
      platform: native ? "capacitor" : navigator.platform,
      userAgent: navigator.userAgent,
    });

    window.localStorage.setItem(cacheKey, registrationValue);
    return true;
  }

  async initialize(): Promise<void> {
    if (capacitorNotificationAdapter.isNativeApp()) {
      await capacitorNotificationAdapter.initialize();
      return;
    }

    if (typeof window !== "undefined" && Notification.permission === "granted") {
      this.startForegroundMessageListener();
    }
  }

}

/**
 * Shared singleton.
 */
export const firebaseMessaging =
  new FirebaseMessaging();
