/*
|--------------------------------------------------------------------------
| Notification-device registration
|--------------------------------------------------------------------------
|
| One browser installation owns one stable device ID. The FCM token can
| rotate, so the server keeps one document per user/device and replaces only
| the token when necessary. The browser never writes notificationDevices
| directly.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validDeviceId(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function validToken(value: string): boolean {
  return value.length >= 32 && value.length <= 4_096;
}

function timestamp(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

function deviceReference(uid: string, deviceId: string) {
  return db.collection("notificationDevices").doc(`${uid}_${deviceId}`);
}

export const registerNotificationDevice = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before enabling notifications.",
      );
    }

    const input = record(request.data);
    const token = text(input.token);
    const deviceId = text(input.deviceId);

    if (!validToken(token) || !validDeviceId(deviceId)) {
      throw new HttpsError(
        "invalid-argument",
        "A valid notification device is required.",
      );
    }

    const [user, administrator] = await Promise.all([
      db.collection("users").doc(request.auth.uid).get(),
      db.collection("admins").doc(request.auth.uid).get(),
    ]);

    if (!user.exists && administrator.data()?.isActive !== true) {
      throw new HttpsError(
        "permission-denied",
        "This account cannot register notification devices.",
      );
    }

    const reference = deviceReference(request.auth.uid, deviceId);
    const current = await reference.get();
    const currentToken = text(current.data()?.token);
    const currentUid = text(current.data()?.uid);

    if (current.exists && currentUid && currentUid !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "This notification device belongs to another account.",
      );
    }

    const platform = text(input.platform).slice(0, 120);
    const userAgent = text(input.userAgent).slice(0, 1_000);
    const tokenChanged = currentToken !== token;

    if (!current.exists) {
      await reference.create({
        uid: request.auth.uid,
        deviceId,
        token,
        active: true,
        platform,
        userAgent,
        createdAt: FieldValue.serverTimestamp(),
        lastRegisteredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await reference.set({
        token,
        active: true,
        platform,
        userAgent,
        lastRegisteredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }

    /*
     * Migrate duplicates created by the old token-as-document-ID scheme.
     * The new stable device ID means token rotation no longer creates rows.
     */
    const devicesForUser = await db
      .collection("notificationDevices")
      .where("uid", "==", request.auth.uid)
      .get();
    const duplicates = devicesForUser.docs.filter((document) => {
      if (document.id === reference.id) {
        return false;
      }

      const data = document.data();
      const sameToken = text(data.token) === token;
      const legacySameBrowser = !text(data.deviceId) &&
        text(data.userAgent) === userAgent;

      return sameToken || legacySameBrowser;
    });

    if (duplicates.length > 0) {
      const batch = db.batch();
      duplicates.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }

    /*
     * A browser installation can sign in to only one LIA account at a time.
     * When it switches roles/accounts, stop the previous account from
     * receiving its private push notifications on this same device.
     */
    const registrationsForDevice = await db
      .collection("notificationDevices")
      .where("deviceId", "==", deviceId)
      .get();
    const previousAccounts = registrationsForDevice.docs.filter((document) =>
      document.id !== reference.id &&
      document.data().active === true,
    );

    if (previousAccounts.length > 0) {
      const batch = db.batch();
      previousAccounts.forEach((document) => {
        batch.update(document.ref, {
          active: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    return {
      registered: !current.exists,
      tokenChanged,
    };
  },
);

export const deactivateNotificationDevice = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before changing notification access.");
    }
    const deviceId = text(record(request.data).deviceId);
    if (!validDeviceId(deviceId)) {
      throw new HttpsError("invalid-argument", "A valid notification device is required.");
    }
    const reference = deviceReference(request.auth.uid, deviceId);
    const snapshot = await reference.get();
    if (snapshot.exists && text(snapshot.data()?.uid) !== request.auth.uid) {
      throw new HttpsError("permission-denied", "This notification device belongs to another account.");
    }
    if (snapshot.exists) {
      await reference.update({
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return {deactivated: snapshot.exists};
  },
);

export const getNotificationDeviceStatus = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to check notification access.");
    }

    const deviceId = text(record(request.data).deviceId);
    if (!validDeviceId(deviceId)) {
      throw new HttpsError("invalid-argument", "A valid notification device is required.");
    }

    const snapshot = await deviceReference(request.auth.uid, deviceId).get();
    const data = snapshot.data();

    if (!snapshot.exists || text(data?.uid) !== request.auth.uid) {
      return {
        registered: false,
        active: false,
        platform: null,
        lastRegisteredAt: null,
        lastPushAcceptedAt: null,
        lastPushErrorAt: null,
        lastPushErrorCode: null,
      };
    }

    return {
      registered: true,
      active: data?.active === true,
      platform: text(data?.platform) || null,
      lastRegisteredAt: timestamp(data?.lastRegisteredAt),
      lastPushAcceptedAt: timestamp(data?.lastPushAcceptedAt),
      lastPushErrorAt: timestamp(data?.lastPushErrorAt),
      lastPushErrorCode: text(data?.lastPushErrorCode) || null,
    };
  },
);

export const sendTestNotification = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to test notifications.");
    }

    await enforceCallableAbuseProtection({
      operation: "send-test-notification",
      uid: request.auth.uid,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 5,
      windowSeconds: 600,
    });

    const deviceId = text(record(request.data).deviceId);
    if (!validDeviceId(deviceId)) {
      throw new HttpsError("invalid-argument", "A valid notification device is required.");
    }

    const reference = deviceReference(request.auth.uid, deviceId);
    const token = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      const registeredToken = text(data?.token);

      if (!snapshot.exists || data?.active !== true || !validToken(registeredToken)) {
        throw new HttpsError(
          "failed-precondition",
          "This device is not registered for notifications. Enable notifications and try again.",
        );
      }

      const lastTest = data?.lastTestNotificationAt instanceof Timestamp
        ? data.lastTestNotificationAt.toMillis()
        : 0;
      if (Date.now() - lastTest < 30_000) {
        throw new HttpsError(
          "resource-exhausted",
          "Wait 30 seconds before sending another test notification.",
        );
      }

      transaction.set(reference, {
        lastTestNotificationAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {
        token: registeredToken,
        platform: text(data?.platform),
      };
    });

    const user = await db.collection("users").doc(request.auth.uid).get();
    const accountType = text(user.data()?.accountType);
    const deepLink = accountType === "admin"
      ? "/admin/notifications"
      : accountType === "store_owner"
        ? "/store/notifications"
        : accountType === "driver"
          ? "/driver/notifications"
          : "/notifications";

    try {
      const messageId = await getMessaging().send({
        token: token.token,
        ...(token.platform === "capacitor"
          ? {
            notification: {
              title: "LIA notifications are working",
              body: "This device is ready to receive your LIA updates.",
            },
          }
          : {}),
        data: {
          title: "LIA notifications are working",
          body: "This device is ready to receive your LIA updates.",
          deepLink,
        },
      });
      await reference.set({
        lastPushAcceptedAt: FieldValue.serverTimestamp(),
        lastPushErrorCode: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {accepted: true, messageId};
    } catch (error) {
      const code = text((error as {code?: unknown}).code) || "unknown";
      const invalidToken = code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token";

      if (invalidToken) {
        await reference.delete();
      } else {
        await reference.set({
          lastPushErrorAt: FieldValue.serverTimestamp(),
          lastPushErrorCode: code,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }

      throw new HttpsError(
        "unavailable",
        invalidToken
          ? "This notification registration expired. Enable notifications again."
          : "Firebase could not send the test notification. Try again shortly.",
      );
    }
  },
);
