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
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

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

    const deviceReference = db
      .collection("notificationDevices")
      .doc(`${request.auth.uid}_${deviceId}`);
    const current = await deviceReference.get();
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
      await deviceReference.create({
        uid: request.auth.uid,
        deviceId,
        token,
        active: true,
        platform,
        userAgent,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (tokenChanged || current.data()?.active !== true) {
      await deviceReference.set({
        token,
        active: true,
        platform,
        userAgent,
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
      if (document.id === deviceReference.id) {
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
      document.id !== deviceReference.id &&
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
