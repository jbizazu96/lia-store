/*
|--------------------------------------------------------------------------
| Admin Authorization Service
|--------------------------------------------------------------------------
|
| An administrator is provisioned manually: Firebase Authentication creates
| the email/password account and an operator creates admins/{uid}. Browser
| role data is never accepted as proof of administrative access.
|
*/

import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
} from "firebase-functions/v2/https";
import type {
  CallableRequest,
} from "firebase-functions/v2/https";

/* This module can load before index.ts during deployment analysis. */
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

export interface ActiveAdmin {
  uid: string;
  email: string;
  role: string;
  displayName: string;
  permissions: Partial<Record<AdminPermission, AdminAccessLevel>>;
}

export const ADMIN_PERMISSIONS = [
  "overview",
  "operations",
  "stores",
  "drivers",
  "customers",
  "delivery_zones",
  "product_categories",
  "reports",
  "deletion_requests",
  "orders",
  "finance",
  "refunds",
  "support",
  "legal_documents",
  "promotions",
  "settings",
] as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
export type AdminAccessLevel = "read" | "write";

export function isMasterAdmin(administrator: ActiveAdmin): boolean {
  return administrator.role === "master_admin";
}

function adminPermissions(value: unknown): Partial<Record<AdminPermission, AdminAccessLevel>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(ADMIN_PERMISSIONS.flatMap((permission) =>
    input[permission] === "read" || input[permission] === "write"
      ? [[permission, input[permission] as AdminAccessLevel]]
      : [],
  ));
}

function normalizedEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

/*
 * The admins collection uses the Firebase Authentication UID as its document
 * ID. The matching email is retained for human review and prevents a record
 * created for one email from authorizing a different signed-in account.
 */
export async function requireActiveAdmin(
  request: CallableRequest<unknown>
): Promise<ActiveAdmin> {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in to access the admin workspace."
    );
  }

  const email = normalizedEmail(request.auth.token.email);

  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError(
      "permission-denied",
      "A verified administrator email is required."
    );
  }

  const admin = await db
    .collection("admins")
    .doc(request.auth.uid)
    .get();

  const data = admin.data();

  if (
    !admin.exists ||
    data?.isActive !== true ||
    normalizedEmail(data?.email) !== email ||
    !["master_admin", "staff_admin"].includes(data?.role)
  ) {
    throw new HttpsError(
      "permission-denied",
      "This account is not authorized to access the admin workspace."
    );
  }

  return {
    uid: request.auth.uid,
    email,
    role: data?.role as "master_admin" | "staff_admin",
    displayName: typeof data?.displayName === "string" ? data.displayName.trim() : "",
    permissions: adminPermissions(data?.permissions),
  };
}

export async function requireMasterAdmin(
  request: CallableRequest<unknown>,
): Promise<ActiveAdmin> {
  const administrator = await requireActiveAdmin(request);
  if (!isMasterAdmin(administrator)) {
    throw new HttpsError("permission-denied", "Only the master administrator can manage admin users.");
  }
  return administrator;
}

export async function requireAdminPermission(
  request: CallableRequest<unknown>,
  permission: AdminPermission,
  requiredAccess: AdminAccessLevel = "read",
): Promise<ActiveAdmin> {
  const administrator = await requireActiveAdmin(request);
  const assignedAccess = administrator.permissions[permission];
  const allowed = assignedAccess === "write" ||
    (requiredAccess === "read" && assignedAccess === "read");
  if (!isMasterAdmin(administrator) && !allowed) {
    throw new HttpsError("permission-denied", "You do not have permission to access this admin area.");
  }
  return administrator;
}
