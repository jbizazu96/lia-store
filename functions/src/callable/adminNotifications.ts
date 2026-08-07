/*
|--------------------------------------------------------------------------
| Admin Notification Callables
|--------------------------------------------------------------------------
|
| The UI does not read admin notification documents directly. Every callable
| verifies the current admin and scopes changes to their own subcollection.
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
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : new Date(0).toISOString();
  }

  return new Date(0).toISOString();
}

function notificationReference(administratorId: string, notificationId: string) {
  if (!/^[A-Za-z0-9_-]{1,1500}$/.test(notificationId)) {
    throw new HttpsError("invalid-argument", "Invalid notification ID.");
  }

  return db.collection("admins").doc(administratorId)
    .collection("notifications").doc(notificationId);
}

export const getAdminNotifications = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const snapshot = await db.collection("admins").doc(administrator.uid)
      .collection("notifications").orderBy("createdAt", "desc").limit(100).get();

    const notifications = await Promise.all(
      snapshot.docs.map(async (document) => {
        const data = document.data();
        const subject = data.subject && typeof data.subject === "object"
          ? data.subject as Record<string, unknown>
          : {};
        const subjectType = text(subject.type);
        const subjectId = text(subject.id);
        let deepLink = text(data.deepLink) || null;

        /*
         * Old refund notifications were created before they carried their
         * claim deep link. Resolve those records at read time so they remain
         * actionable instead of becoming read-only history.
         */
        if (
          !deepLink &&
          subjectType === "payment-refund" &&
          subjectId
        ) {
          const claim = await db
            .collection("refundClaims")
            .where("refundId", "==", subjectId)
            .limit(1)
            .get();

          deepLink = claim.docs[0]
            ? "/admin/refund-claims?claim=" + claim.docs[0].id
            : "/admin/finance";
        }

        return {
          id: document.id,
          title: text(data.title) || "Admin update",
          body: text(data.body) || "There is an update requiring attention.",
          type: text(data.type) || "account",
          read: data.read === true,
          createdAt: timestamp(data.createdAt),
          deepLink,
          subject: {
            type: subjectType || null,
            id: subjectId || null,
          },
        };
      }),
    );

    return {
      notifications,
    };
  }
);

export const markAdminNotificationRead = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = request.data && typeof request.data === "object"
      ? request.data as Record<string, unknown>
      : {};
    const reference = notificationReference(
      administrator.uid,
      text(input.notificationId)
    );

    await reference.set({
      read: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    return {success: true};
  }
);

export const clearAdminNotifications = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const snapshot = await db.collection("admins").doc(administrator.uid)
      .collection("notifications").limit(450).get();
    const batch = db.batch();

    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();

    return {
      success: true,
      cleared: snapshot.size,
      hasMore: snapshot.size === 450,
    };
  }
);
