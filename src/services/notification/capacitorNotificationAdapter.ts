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
  FirebaseMessaging as NativeFirebaseMessaging,
} from "@capacitor-firebase/messaging";
import {
  AndroidSettings,
  IOSSettings,
  NativeSettings,
} from "capacitor-native-settings";
import {
  openLiaDeepLink,
} from "./notificationDeepLink";

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

let initialized = false;

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

  await NativeFirebaseMessaging.addListener(
    "notificationActionPerformed",
    ({ notification }) => {
      const data = notification.data && typeof notification.data === "object"
        ? notification.data as Record<string, unknown>
        : {};
      openLiaDeepLink(typeof data.deepLink === "string" ? data.deepLink : undefined);
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

  const permissions = await NativeFirebaseMessaging.checkPermissions();
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

  const permissions = await NativeFirebaseMessaging.requestPermissions();
  return mapPermission(permissions.receive);
}

async function getNativeToken(): Promise<string | null> {
  if (!isNativeApp()) {
    return null;
  }

  const result = await NativeFirebaseMessaging.getToken();
  return result.token?.trim() || null;
}

async function deleteNativeToken(): Promise<void> {
  if (isNativeApp()) await NativeFirebaseMessaging.deleteToken();
}

async function openNativeNotificationSettings(): Promise<void> {
  if (!isNativeApp()) return;
  await NativeSettings.open({
    optionAndroid: AndroidSettings.AppNotification,
    optionIOS: IOSSettings.App,
  });
}

export const capacitorNotificationAdapter = {
  isNativeApp,

  initialize: initializeNativeListeners,

  getPermission: nativePermission,

  requestPermission: requestNativePermission,

  getToken: getNativeToken,

  deleteToken: deleteNativeToken,

  openNotificationSettings: openNativeNotificationSettings,
};
