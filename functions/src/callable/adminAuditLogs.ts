/*
|--------------------------------------------------------------------------
| Admin Audit Log Read Callable
|--------------------------------------------------------------------------
|
| Audit records are immutable and never browser-readable through Firestore.
| This protected callable returns only the safe summaries written by the
| Admin Audit Log Service.
|
*/

import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  onCall,
} from "firebase-functions/v2/https";
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const MAX_AUDIT_LOGS = 100;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function date(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date ? result.toISOString() : null;
  }

  return typeof value === "string" ? value : null;
}

function safeDetails(value: unknown): Record<string, string | number | boolean | null> {
  const details = record(value);
  const result: Record<string, string | number | boolean | null> = {};

  Object.entries(details).forEach(([key, item]) => {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      result[key] = item;
    }
  });

  return result;
}

export const getAdminAuditLogs = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireActiveAdmin(request);
    const input = record(request.data);
    const search = text(input.search).toLowerCase();

    const snapshot = await db.collection("adminAuditLogs")
      .orderBy("createdAt", "desc")
      .limit(MAX_AUDIT_LOGS)
      .get();
    const logs = snapshot.docs.map((document) => {
      const data = document.data();
      const actor = record(data.actor);
      const target = record(data.target);

      return {
        id: document.id,
        action: text(data.action) || "admin_action",
        actor: {
          email: text(actor.email) || "Administrator",
          role: text(actor.role) || "admin",
        },
        target: {
          type: text(target.type) || "record",
          id: text(target.id) || "unknown",
        },
        reason: text(data.reason) || null,
        details: safeDetails(data.details),
        createdAt: date(data.createdAt),
      };
    }).filter((log) => !search || [
      log.action,
      log.actor.email,
      log.target.type,
      log.target.id,
      log.reason ?? "",
      ...Object.entries(log.details).map(([key, value]) => `${key} ${String(value)}`),
    ].some((value) => value.toLowerCase().includes(search)));

    return {
      logs,
      limited: snapshot.size === MAX_AUDIT_LOGS,
    };
  }
);
