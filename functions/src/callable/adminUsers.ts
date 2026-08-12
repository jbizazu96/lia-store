import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  ADMIN_PERMISSIONS,
  type AdminAccessLevel,
  type AdminPermission,
  requireMasterAdmin,
} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

function text(value: unknown, maximum = 160): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function email(value: unknown): string {
  const normalized = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  return normalized;
}

function permissions(value: unknown): Partial<Record<AdminPermission, AdminAccessLevel>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Select at least one admin permission.");
  }
  const input = value as Record<string, unknown>;
  const selected = Object.fromEntries(ADMIN_PERMISSIONS.flatMap((permission) =>
    input[permission] === "read" || input[permission] === "write"
      ? [[permission, input[permission] as AdminAccessLevel]]
      : [],
  ));
  if (Object.keys(selected).length === 0) throw new HttpsError("invalid-argument", "Select at least one admin permission.");
  return selected;
}

function permissionSummary(value: Partial<Record<AdminPermission, AdminAccessLevel>>): string {
  return Object.entries(value).map(([permission, access]) => `${permission}:${access}`).join(",");
}

function permissionsForResponse(value: unknown): Partial<Record<AdminPermission, AdminAccessLevel>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(ADMIN_PERMISSIONS.flatMap((permission) =>
    input[permission] === "read" || input[permission] === "write"
      ? [[permission, input[permission] as AdminAccessLevel]]
      : [],
  ));
}

function timestamp(value: unknown): string | null {
  return value && typeof (value as {toDate?: unknown}).toDate === "function"
    ? (value as {toDate: () => Date}).toDate().toISOString()
    : null;
}

export const getAdminUsers = onCall({region: "us-central1"}, async (request) => {
  await requireMasterAdmin(request);
  const snapshot = await db.collection("admins").orderBy("createdAt", "desc").limit(200).get();
  const users = await Promise.all(snapshot.docs.map(async (document) => {
    const data = document.data();
    let authUser: admin.auth.UserRecord | null = null;
    try {
      authUser = await admin.auth().getUser(document.id);
    } catch (reason) {
      if ((reason as {code?: string}).code !== "auth/user-not-found") throw reason;
    }
    return {
      uid: document.id,
      email: text(data.email) || authUser?.email || "",
      displayName: text(data.displayName, 100) || authUser?.displayName || "",
      role: data.role === "master_admin" ? "master_admin" : "staff_admin",
      permissions: permissionsForResponse(data.permissions),
      isActive: data.isActive === true && authUser?.disabled !== true,
      createdAt: timestamp(data.createdAt) ?? authUser?.metadata.creationTime ?? null,
      lastWorkspaceAccessAt: timestamp(data.lastWorkspaceAccessAt),
    };
  }));
  return {users};
});

export const createAdminUser = onCall({region: "us-central1"}, async (request) => {
  const master = await requireMasterAdmin(request);
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const userEmail = email(input.email);
  const displayName = text(input.displayName, 100);
  const password = typeof input.password === "string" ? input.password : "";
  const selectedPermissions = permissions(input.permissions);
  if (displayName.length < 2) throw new HttpsError("invalid-argument", "Enter the staff administrator's name.");
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpsError("invalid-argument", "Use a password with at least 12 characters, including uppercase, lowercase, and a number.");
  }

  let authUser: admin.auth.UserRecord;
  try {
    authUser = await admin.auth().createUser({email: userEmail, password, displayName, emailVerified: true});
  } catch (reason) {
    if ((reason as {code?: string}).code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An Authentication account already uses this email address.");
    }
    throw reason;
  }
  try {
    await db.collection("admins").doc(authUser.uid).create({
      email: userEmail,
      displayName,
      role: "staff_admin",
      permissions: selectedPermissions,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: master.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: master.uid,
    });
  } catch (reason) {
    await admin.auth().deleteUser(authUser.uid).catch(() => undefined);
    throw reason;
  }
  await writeAdminAuditLog(master, {
    action: "admin_user.created",
    targetType: "admin_user",
    targetId: authUser.uid,
    details: {email: userEmail, permissions: permissionSummary(selectedPermissions)},
  });
  return {success: true, uid: authUser.uid};
});

export const updateAdminUser = onCall({region: "us-central1"}, async (request) => {
  const master = await requireMasterAdmin(request);
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const uid = text(input.uid, 128);
  if (!uid || uid === master.uid) throw new HttpsError("failed-precondition", "The master administrator cannot be changed here.");
  const reference = db.collection("admins").doc(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data()?.role === "master_admin") {
    throw new HttpsError("not-found", "The staff administrator was not found.");
  }
  const displayName = text(input.displayName, 100);
  const selectedPermissions = permissions(input.permissions);
  const isActive = input.isActive === true;
  if (displayName.length < 2) throw new HttpsError("invalid-argument", "Enter the staff administrator's name.");
  await Promise.all([
    admin.auth().updateUser(uid, {displayName, disabled: !isActive}),
    reference.update({
      displayName,
      permissions: selectedPermissions,
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: master.uid,
    }),
  ]);
  await admin.auth().revokeRefreshTokens(uid);
  await writeAdminAuditLog(master, {
    action: "admin_user.updated",
    targetType: "admin_user",
    targetId: uid,
    details: {isActive, permissions: permissionSummary(selectedPermissions)},
  });
  return {success: true};
});

export const deleteAdminUser = onCall({region: "us-central1"}, async (request) => {
  const master = await requireMasterAdmin(request);
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const uid = text(input.uid, 128);
  if (!uid || uid === master.uid) throw new HttpsError("failed-precondition", "The master administrator cannot be deleted.");
  const reference = db.collection("admins").doc(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data()?.role === "master_admin") {
    throw new HttpsError("not-found", "The staff administrator was not found.");
  }
  const targetEmail = text(snapshot.data()?.email);
  await admin.auth().deleteUser(uid).catch((reason: unknown) => {
    if ((reason as {code?: string}).code !== "auth/user-not-found") throw reason;
  });
  await db.recursiveDelete(reference);
  await writeAdminAuditLog(master, {
    action: "admin_user.deleted",
    targetType: "admin_user",
    targetId: uid,
    details: {email: targetEmail},
  });
  return {success: true};
});
