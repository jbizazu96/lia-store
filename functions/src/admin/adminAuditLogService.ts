/*
|--------------------------------------------------------------------------
| Admin Audit Log Service
|--------------------------------------------------------------------------
|
| Administrative mutations must leave a compact, immutable audit record.
| The data is intentionally limited to safe summaries: never put document
| images, full customer addresses, Stripe secrets, or payment tokens here.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import type {
  ActiveAdmin,
} from "./adminAuthorizationService";

/* This module can load before index.ts during deployment analysis. */
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

export interface AdminAuditLogInput {
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export async function writeAdminAuditLog(
  admin: ActiveAdmin,
  input: AdminAuditLogInput
): Promise<void> {
  await db.collection("adminAuditLogs").add({
    actor: {
      uid: admin.uid,
      email: admin.email,
      role: admin.role,
      displayName: admin.displayName,
    },
    action: input.action,
    target: {
      type: input.targetType,
      id: input.targetId,
    },
    reason: input.reason ?? null,
    details: input.details ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}
