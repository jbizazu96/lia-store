/*
 * Native notification bridge
 *
 * The web implementation uses Firebase Messaging + a service worker. A
 * Capacitor build cannot rely on either browser-only API, so this adapter
 * uses the native Push Notifications and App plugins instead. It is inert in
 * the browser and does not create a native project by itself.
 */

import {
  Capacitor,
} from "@capacitor/core";
import {
  App,
} from "@capacitor/app";
import {
  PushNotifications,
} from "@capacitor/push-notifications";
import {
  openLiaDeepLink,
} from "./notificationDeepLink";

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

const TOKEN_STORAGE_KEY = "lia.native-notification-token";

let initialized = false;
let tokenRequest: Promise<string | null> | null = null;

function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function mapPermission(
  permission: string | undefined,
): NotificationPermissionState {
  switch (permission) {
    case "granted":
      return "granted";
    case "denied":
      return "denied";
    case "prompt":
    case "prompt-with-rationale":
      return "prompt";
    default:
      return "unsupported";
  }
}

async function initializeNativeListeners(): Promise<void> {
  if (!isNativeApp() || initialized) {
    return;
  }

  initialized = true;

  await App.addListener("appUrlOpen", ({ url }) => {
    openLiaDeepLink(url);
  });

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    ({ notification }) => {
      openLiaDeepLink(notification.data?.deepLink);
    },
  );

  /* A cold app launch can carry the original notification URL. */
  const launch = await App.getLaunchUrl();
  if (launch?.url) {
    openLiaDeepLink(launch.url);
  }
}

async function nativePermission(): Promise<NotificationPermissionState> {
  if (!isNativeApp()) {
    return "unsupported";
  }

  const permissions = await PushNotifications.checkPermissions();
  return mapPermission(permissions.receive);
}

async function requestNativePermission(): Promise<NotificationPermissionState> {
  if (!isNativeApp()) {
    return "unsupported";
  }

  const current = await nativePermission();
  if (current !== "prompt") {
    return current;
  }

  const permissions = await PushNotifications.requestPermissions();
  return mapPermission(permissions.receive);
}

async function getNativeToken(): Promise<string | null> {
  if (!isNativeApp()) {
    return null;
  }

  const cached = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (cached) {
    return cached;
  }

  if (tokenRequest) {
    return tokenRequest;
  }

  tokenRequest = new Promise<string | null>((resolve, reject) => {
    let settled = false;

    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      tokenRequest = null;
      resolve(value);
    };

    const timeout = window.setTimeout(() => {
      finish(null);
    }, 15_000);

    void PushNotifications.addListener("registration", ({ value }) => {
      if (value) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
      }
      finish(value || null);
    });

    void PushNotifications.addListener("registrationError", (error) => {
      if (settled) return;
      window.clearTimeout(timeout);
      tokenRequest = null;
      reject(new Error(error.error || "Native push registration failed."));
    });

    void PushNotifications.register();
  });

  return tokenRequest;
}

export const capacitorNotificationAdapter = {
  isNativeApp,

  initialize: initializeNativeListeners,

  getPermission: nativePermission,

  requestPermission: requestNativePermission,

  getToken: getNativeToken,
};
