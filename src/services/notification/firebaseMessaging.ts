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
  deleteToken as deleteWebToken,
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
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

export type {
  NotificationPermissionState,
} from "./capacitorNotificationAdapter";

export type NativeNotificationPreference = "accepted" | "declined" | null;

export interface NotificationDeviceStatus {
  registered: boolean;
  active: boolean;
  platform: string | null;
  lastRegisteredAt: string | null;
  lastPushAcceptedAt: string | null;
  lastPushErrorAt: string | null;
  lastPushErrorCode: string | null;
}

export const NATIVE_NOTIFICATION_STATE_EVENT = "lia:native-notification-state";

export class FirebaseMessaging {
  private foregroundMessageUnsubscribe: Unsubscribe | null = null;
  private registrationRefreshStarted = false;

  /** Native push does not use the browser VAPID key. Hosted PWA builds do. */
  isPushConfigured(): boolean {
    return capacitorNotificationAdapter.isNativeApp() ||
      Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim());
  }

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

  private nativePreferenceKey(uid: string): string {
    return `lia.native-notification-preference:${uid}`;
  }

  getNativePreference(): NativeNotificationPreference {
    const uid = auth.currentUser?.uid;
    if (!uid || typeof window === "undefined") return null;
    const value = window.localStorage.getItem(this.nativePreferenceKey(uid));
    return value === "accepted" || value === "declined" ? value : null;
  }

  setNativePreference(value: Exclude<NativeNotificationPreference, null>): void {
    const uid = auth.currentUser?.uid;
    if (!uid || typeof window === "undefined") return;
    window.localStorage.setItem(this.nativePreferenceKey(uid), value);
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
  }

  isInstalledWebApp(): boolean {
    if (typeof window === "undefined" || capacitorNotificationAdapter.isNativeApp()) {
      return false;
    }

    return window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & {standalone?: boolean}).standalone === true);
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

          const title = payload.data?.title ?? payload.notification?.title ?? "LIA";
          const body = payload.data?.body ?? payload.notification?.body ??
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
      explicitUserAction?: boolean;
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

    if (
      native &&
      options.explicitUserAction !== true &&
      this.getNativePreference() !== "accepted"
    ) {
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
    window.localStorage.setItem("lia.notification-last-refresh", String(Date.now()));
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
    return true;
  }

  async getDeviceStatus(): Promise<NotificationDeviceStatus> {
    const empty: NotificationDeviceStatus = {
      registered: false,
      active: false,
      platform: null,
      lastRegisteredAt: null,
      lastPushAcceptedAt: null,
      lastPushErrorAt: null,
      lastPushErrorCode: null,
    };

    if (typeof window === "undefined" || !auth.currentUser) return empty;

    const getStatus = httpsCallable<
      {deviceId: string},
      NotificationDeviceStatus
    >(functions, "getNotificationDeviceStatus");
    const result = await getStatus({deviceId: this.deviceId()});
    return result.data;
  }

  async sendTestNotification(): Promise<void> {
    if (typeof window === "undefined" || !auth.currentUser) {
      throw new Error("Sign in before testing notifications.");
    }

    const sendTest = httpsCallable<
      {deviceId: string},
      {accepted: boolean; messageId: string}
    >(functions, "sendTestNotification");
    await sendTest({deviceId: this.deviceId()});
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
  }

  async enableNativeNotifications(): Promise<NotificationPermissionState> {
    if (!capacitorNotificationAdapter.isNativeApp()) {
      const enabled = await this.registerDevice({requestPermission: true});
      const permission = await this.getPermissionStatus();

      if (!enabled && permission === "granted") {
        throw new Error(
          "Notification permission is enabled, but this device could not be registered. Reopen LIA from your Home Screen and try again."
        );
      }

      if (enabled) {
        this.setNativePreference("accepted");
      }

      return permission;
    }

    let permission = await this.getPermissionStatus();
    if (permission === "denied") {
      this.setNativePreference("accepted");
      await capacitorNotificationAdapter.openNotificationSettings();
      return permission;
    }

    this.setNativePreference("accepted");
    const registered = await this.registerDevice({
      requestPermission: true,
      explicitUserAction: true,
    });
    permission = await this.getPermissionStatus();
    if (!registered || permission !== "granted") {
      this.setNativePreference("declined");
    }
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
    return permission;
  }

  async declineNativeNotifications(): Promise<void> {
    this.setNativePreference("declined");
    const user = auth.currentUser;
    if (user) {
      const deactivate = httpsCallable<
        {deviceId: string},
        {deactivated: boolean}
      >(functions, "deactivateNotificationDevice");
      await deactivate({deviceId: this.deviceId()});
      window.localStorage.removeItem("lia.notification-device:" + user.uid);
    }
    if (await this.getPermissionStatus() === "granted") {
      if (capacitorNotificationAdapter.isNativeApp()) {
        await capacitorNotificationAdapter.deleteToken();
      } else {
        const messaging = await getFirebaseMessaging();
        if (messaging) await deleteWebToken(messaging);
      }
    }
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
  }

  /** Deactivate this account's server registration without changing the
   * installation's OS permission or the customer's notification preference. */
  async deactivateCurrentDeviceRegistration(): Promise<void> {
    if (typeof window === "undefined") return;
    const user = auth.currentUser;
    if (!user) return;
    const deactivate = httpsCallable<
      {deviceId: string},
      {deactivated: boolean}
    >(functions, "deactivateNotificationDevice");
    await deactivate({deviceId: this.deviceId()});
    window.localStorage.removeItem("lia.notification-device:" + user.uid);
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
  }

  async recoverNativeRegistration(): Promise<NotificationPermissionState> {
    const permission = await this.getPermissionStatus();
    if (permission === "granted") {
      this.setNativePreference("accepted");
      await this.registerDevice({explicitUserAction: true});
    }
    window.dispatchEvent(new Event(NATIVE_NOTIFICATION_STATE_EVENT));
    return permission;
  }

  async initialize(): Promise<void> {
    if (capacitorNotificationAdapter.isNativeApp()) {
      await capacitorNotificationAdapter.initialize();
      this.startAutomaticRegistrationRefresh();
      return;
    }

    if (typeof window !== "undefined" && Notification.permission === "granted") {
      this.startForegroundMessageListener();
    }

    this.startAutomaticRegistrationRefresh();
  }

  private startAutomaticRegistrationRefresh(): void {
    if (typeof window === "undefined" || this.registrationRefreshStarted) return;
    this.registrationRefreshStarted = true;

    const refresh = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      const lastRefresh = Number(
        window.localStorage.getItem("lia.notification-last-refresh") ?? "0",
      );
      if (Number.isFinite(lastRefresh) && Date.now() - lastRefresh < 6 * 60 * 60 * 1000) {
        return;
      }
      void this.registerDevice({requestPermission: false}).catch((error) => {
        console.error("Unable to refresh notification registration:", error);
        reportClientIssue({
          area: "notifications.token_refresh",
          message: "Unable to refresh notification registration",
          error,
        });
      });
    };

    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("lia:native-notification-token-refresh", () => {
      if (this.getNativePreference() !== "accepted") return;
      void this.registerDevice({explicitUserAction: true}).catch((error) => {
        console.error("Unable to save the refreshed notification token:", error);
        reportClientIssue({
          area: "notifications.token_refresh",
          message: "Unable to save refreshed notification token",
          error,
        });
      });
    });
    window.setInterval(refresh, 6 * 60 * 60 * 1000);
  }

}

/**
 * Shared singleton.
 */
export const firebaseMessaging =
  new FirebaseMessaging();
