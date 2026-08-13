import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const BATCH_SIZE = 300;

/**
 * Processes one bounded batch. The client repeats while hasMore is true, so
 * large histories never need to be downloaded to the device or handled in a
 * single long-running invocation.
 */
export const processUserNotificationBatch = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to manage notifications.");
    }

    await enforceCallableAbuseProtection({
      operation: "bulk-user-notifications",
      uid: request.auth.uid,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 120,
      windowSeconds: 60,
    });

    const action = (request.data as {action?: unknown} | undefined)?.action;
    if (action !== "mark-read" && action !== "clear") {
      throw new HttpsError("invalid-argument", "Choose a valid notification action.");
    }

    const notifications = db.collection("users").doc(request.auth.uid)
      .collection("notifications");
    const query = action === "mark-read" ?
      notifications.where("read", "==", false).limit(BATCH_SIZE) :
      notifications.limit(BATCH_SIZE);
    const snapshot = await query.get();

    if (snapshot.empty) return {processed: 0, hasMore: false};

    const batch = db.batch();
    snapshot.docs.forEach((document) => {
      if (action === "clear") batch.delete(document.ref);
      else batch.update(document.ref, {
        read: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    return {
      processed: snapshot.size,
      hasMore: snapshot.size === BATCH_SIZE,
    };
  },
);
