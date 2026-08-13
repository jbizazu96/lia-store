import * as admin from "firebase-admin";
import {createHash} from "node:crypto";
import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeMetadata(value: unknown): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  Object.entries(record(value)).slice(0, 20).forEach(([key, item]) => {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 60);
    if (!safeKey) return;
    if (typeof item === "boolean") output[safeKey] = item;
    if (typeof item === "number" && Number.isFinite(item)) output[safeKey] = item;
    if (typeof item === "string") output[safeKey] = item.slice(0, 240);
  });
  return output;
}

function anonymousIdentity(request: {rawRequest: {ip?: string; headers: Record<string, unknown>}}): string {
  const forwarded = request.rawRequest.headers["x-forwarded-for"];
  const value = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : request.rawRequest.ip ?? "unknown";
  return "anonymous-" + createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export const reportClientError = onCall(
  {region: "us-central1", maxInstances: 5},
  async (request) => {
    const input = record(request.data);
    const area = text(input.area, 80);
    const message = text(input.message, 500);
    const severity = text(input.severity, 20);
    if (!area || !message || !["warning", "error", "fatal"].includes(severity)) {
      throw new HttpsError("invalid-argument", "The client report is invalid.");
    }

    const identity = request.auth?.uid ?? anonymousIdentity(request);
    await enforceCallableAbuseProtection({
      operation: "client-error-report",
      uid: identity,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 30,
      windowSeconds: 3_600,
    });

    const now = Date.now();
    await db.collection("clientErrorReports").add({
      area,
      message,
      severity,
      stack: text(input.stack, 4_000) || null,
      path: text(input.path, 500) || null,
      platform: text(input.platform, 80) || null,
      appVersion: text(input.appVersion, 100) || null,
      online: typeof input.online === "boolean" ? input.online : null,
      metadata: safeMetadata(input.metadata),
      userId: request.auth?.uid ?? null,
      appCheckVerified: Boolean(request.app),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + RETENTION_MS),
    });

    return {accepted: true};
  },
);

export const cleanupClientErrorReports = onSchedule(
  {
    schedule: "every day 04:10",
    timeZone: "America/Chicago",
    region: "us-central1",
    retryCount: 1,
  },
  async () => {
    let deleted = 0;
    while (deleted < 5_000) {
      const expired = await db.collection("clientErrorReports")
        .where("expiresAt", "<=", Timestamp.now())
        .limit(Math.min(450, 5_000 - deleted))
        .get();
      if (expired.empty) break;
      const batch = db.batch();
      expired.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
      deleted += expired.size;
      if (expired.size < 450) break;
    }
    console.info("Client error report cleanup completed.", {deleted});
  },
);
