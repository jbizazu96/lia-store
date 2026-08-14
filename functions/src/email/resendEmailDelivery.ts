import * as admin from "firebase-admin";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {defineSecret, defineString} from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const resendApiKey = defineSecret("RESEND_API_KEY");
const emailFrom = defineString("EMAIL_FROM");
const MAX_ATTEMPTS = 5;

type JobData = Record<string, unknown>;
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

async function deliver(reference: FirebaseFirestore.DocumentReference): Promise<void> {
  const claimed = await db.runTransaction<JobData | null>(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    const data = snapshot.data() as JobData;
    const status = text(data.status);
    const attempts = typeof data.attempts === "number" ? data.attempts : 0;
    if (!["pending", "retry"].includes(status) || attempts >= MAX_ATTEMPTS) return null;
    const nextAttemptAt = data.nextAttemptAt as Timestamp | undefined;
    if (nextAttemptAt && nextAttemptAt.toMillis() > Date.now()) return null;
    transaction.update(reference, {status: "sending", attempts: attempts + 1, lastAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    return {...data, attempts: attempts + 1} as JobData;
  });
  if (!claimed) return;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {Authorization: `Bearer ${resendApiKey.value()}`, "Content-Type": "application/json", "Idempotency-Key": reference.id},
      body: JSON.stringify({
        from: emailFrom.value(), to: [text(claimed.to)], subject: text(claimed.subject),
        html: text(claimed.html), text: text(claimed.text),
        tags: Object.entries((claimed.tags && typeof claimed.tags === "object" ? claimed.tags : {}) as Record<string, unknown>)
          .filter(([, value]) => typeof value === "string")
          .map(([name, value]) => ({name: name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256), value: String(value).slice(0, 256)})),
      }),
    });
    const result = await response.json() as {id?: unknown; message?: unknown; name?: unknown};
    if (!response.ok || typeof result.id !== "string") throw new Error(text(result.message) || text(result.name) || `Resend returned ${response.status}`);
    await reference.update({status: "sent", resendEmailId: result.id, sentAt: FieldValue.serverTimestamp(), lastError: null, updatedAt: FieldValue.serverTimestamp()});
    console.info("Email accepted by Resend.", {
      jobId: reference.id,
      category: text(claimed.category),
      resendEmailId: result.id,
    });
  } catch (error) {
    const attempts = Number(claimed.attempts);
    const permanent = attempts >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(2 ** attempts * 5, 360);
    await reference.update({
      status: permanent ? "failed" : "retry",
      nextAttemptAt: Timestamp.fromMillis(Date.now() + delayMinutes * 60_000),
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown email delivery error",
      failedAt: permanent ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (permanent) console.error("Email permanently failed.", {jobId: reference.id});
  }
}

export const deliverQueuedEmail = onDocumentCreated({document: "emailJobs/{jobId}", region: "us-central1", database: "default", secrets: [resendApiKey]}, async (event) => {
  if (event.data) await deliver(event.data.ref);
});

export const retryQueuedEmails = onSchedule({schedule: "every 15 minutes", region: "us-central1", timeZone: "America/Chicago", secrets: [resendApiKey]}, async () => {
  const snapshot = await db.collection("emailJobs").where("status", "==", "retry").limit(100).get();
  const due = snapshot.docs.filter((document) => {
    const value = document.data().nextAttemptAt;
    return value instanceof Timestamp && value.toMillis() <= Date.now();
  });
  await Promise.all(due.map((document) => deliver(document.ref)));
});

export const cleanupEmailJobs = onSchedule({schedule: "every day 03:30", region: "us-central1", timeZone: "America/Chicago"}, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1_000);
  const snapshot = await db.collection("emailJobs").where("createdAt", "<", cutoff).limit(400).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
});
