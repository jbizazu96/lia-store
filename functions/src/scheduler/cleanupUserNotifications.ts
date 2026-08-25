import * as admin from "firebase-admin";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getOperationalControlsForJobs} from "../callable/adminOperations";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const QUERY_PAGE_SIZE = 500;
const MAXIMUM_SCANNED_PER_RUN = 5000;

function userNotificationPath(path: string): boolean {
  return /^users\/[^/]+\/notifications\/[^/]+$/.test(path);
}

/**
 * Keeps user notification subcollections bounded without relying on TTL field
 * configuration. The audited operational policy supplies both retention
 * windows, with server-enforced minimum and maximum limits.
 */
export const cleanupUserNotifications = onSchedule(
  {
    schedule: "every day 03:20",
    timeZone: "America/Chicago",
    region: "us-central1",
    retryCount: 1,
  },
  async () => {
    const controls = await getOperationalControlsForJobs();
    const readRetentionDays = controls.notificationReadRetentionDays;
    const absoluteRetentionDays = controls.notificationAbsoluteRetentionDays;
    const now = Date.now();
    const readCutoff = Timestamp.fromMillis(
      now - readRetentionDays * 24 * 60 * 60 * 1000
    );
    const absoluteCutoffMillis =
      now - absoluteRetentionDays * 24 * 60 * 60 * 1000;
    let lastDocument: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let scanned = 0;
    let deleted = 0;

    while (scanned < MAXIMUM_SCANNED_PER_RUN) {
      let cleanupQuery = db
        .collectionGroup("notifications")
        .where("createdAt", "<", readCutoff)
        .orderBy("createdAt", "asc")
        .limit(Math.min(QUERY_PAGE_SIZE, MAXIMUM_SCANNED_PER_RUN - scanned));

      if (lastDocument) cleanupQuery = cleanupQuery.startAfter(lastDocument);
      const snapshot = await cleanupQuery.get();
      if (snapshot.empty) break;

      const batch = db.batch();
      let batchDeletes = 0;
      snapshot.docs.forEach((document) => {
        if (!userNotificationPath(document.ref.path)) return;
        const createdAt = document.get("createdAt");
        const createdAtMillis = createdAt instanceof Timestamp
          ? createdAt.toMillis()
          : 0;
        if (document.get("read") === true || createdAtMillis < absoluteCutoffMillis) {
          batch.delete(document.ref);
          batchDeletes += 1;
        }
      });

      if (batchDeletes > 0) await batch.commit();
      deleted += batchDeletes;
      scanned += snapshot.size;
      lastDocument = snapshot.docs.at(-1) ?? null;
      if (snapshot.size < QUERY_PAGE_SIZE) break;
    }

    console.info("User notification retention cleanup completed.", {
      scanned,
      deleted,
      readRetentionDays,
      absoluteRetentionDays,
    });
  }
);
