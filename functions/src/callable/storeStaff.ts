import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {STORE_STAFF_PAGES, type StoreStaffAccessLevel, type StoreStaffPage, requireApprovedStore} from "../services/store/storeAccessService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

const text = (value: unknown, maximum = 160) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
function email(value: unknown) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  return result;
}
function permissions(value: unknown): Partial<Record<StoreStaffPage, StoreStaffAccessLevel>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Select at least one page.");
  const input = value as Record<string, unknown>;
  const result = Object.fromEntries(STORE_STAFF_PAGES.flatMap((page) =>
    input[page] === "read" || input[page] === "write" ? [[page, input[page]]] : [],
  ));
  if (!Object.keys(result).length) throw new HttpsError("invalid-argument", "Select at least one page.");
  return result;
}
function responsePermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(STORE_STAFF_PAGES.flatMap((page) =>
    input[page] === "read" || input[page] === "write" ? [[page, input[page]]] : [],
  ));
}
function timestamp(value: unknown) {
  return value && typeof (value as {toDate?: unknown}).toDate === "function" ? (value as {toDate: () => Date}).toDate().toISOString() : null;
}
async function ownerContext(request: Parameters<typeof requireApprovedStore>[0]) {
  const store = await requireApprovedStore(request);
  return {store, ownerId: request};
}
async function audit(storeId: string, ownerId: string, action: string, staffUid: string, details: Record<string, unknown>) {
  await db.collection("stores").doc(storeId).collection("staffAuditLogs").add({action, actorUid: ownerId, staffUid, details, createdAt: FieldValue.serverTimestamp()});
}

export const getStoreStaffUsers = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to manage store staff.");
  const {store} = await ownerContext(request.auth.uid);
  const snapshot = await db.collection("storeStaff").where("storeId", "==", store.id).limit(100).get();
  return {users: snapshot.docs.map((document) => {
    const data = document.data();
    return {uid: document.id, email: text(data.email), displayName: text(data.displayName), isActive: data.isActive === true, permissions: responsePermissions(data.permissions), createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt)};
  }).sort((a, b) => a.displayName.localeCompare(b.displayName))};
});

export const createStoreStaffUser = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to manage store staff.");
  const {store, ownerId} = await ownerContext(request.auth.uid);
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const staffEmail = email(input.email);
  const displayName = text(input.displayName, 100);
  const password = typeof input.password === "string" ? input.password : "";
  const selected = permissions(input.permissions);
  if (displayName.length < 2) throw new HttpsError("invalid-argument", "Enter the staff member's name.");
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new HttpsError("invalid-argument", "Use at least 12 characters with uppercase, lowercase, a number, and a special character.");
  }
  let authUser: admin.auth.UserRecord;
  try {
    authUser = await admin.auth().createUser({email: staffEmail, password, displayName, emailVerified: true});
  } catch (error) {
    if ((error as {code?: string}).code === "auth/email-already-exists") throw new HttpsError("already-exists", "An account already uses this email address.");
    throw error;
  }
  const common = {email: staffEmail, displayName, storeId: store.id, ownerId, isActive: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()};
  try {
    const batch = db.batch();
    batch.create(db.collection("storeStaff").doc(authUser.uid), {...common, role: "store_staff", permissions: selected});
    batch.create(db.collection("users").doc(authUser.uid), {...common, accountType: "store_staff", emailVerified: true});
    await batch.commit();
  } catch (error) {
    await admin.auth().deleteUser(authUser.uid).catch(() => undefined);
    throw error;
  }
  await audit(store.id, ownerId, "store_staff.created", authUser.uid, {email: staffEmail, permissions: selected});
  return {success: true, uid: authUser.uid};
});

export const updateStoreStaffUser = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to manage store staff.");
  const {store, ownerId} = await ownerContext(request.auth.uid);
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const uid = text(input.uid, 128);
  const displayName = text(input.displayName, 100);
  const selected = permissions(input.permissions);
  const isActive = input.isActive === true;
  const reference = db.collection("storeStaff").doc(uid);
  const existing = await reference.get();
  if (!existing.exists || existing.data()?.storeId !== store.id || existing.data()?.ownerId !== ownerId) throw new HttpsError("not-found", "The staff account was not found.");
  if (displayName.length < 2) throw new HttpsError("invalid-argument", "Enter the staff member's name.");
  await Promise.all([
    admin.auth().updateUser(uid, {displayName, disabled: !isActive}),
    reference.update({displayName, permissions: selected, isActive, updatedAt: FieldValue.serverTimestamp()}),
    db.collection("users").doc(uid).update({displayName, isActive, updatedAt: FieldValue.serverTimestamp()}),
  ]);
  if (!isActive || selected.products !== "write") {
    const authUser = await admin.auth().getUser(uid);
    const claims = {...(authUser.customClaims ?? {})};
    delete claims.storeUploadStoreId;
    delete claims.storeUploadGrantedAt;
    await admin.auth().setCustomUserClaims(uid, claims);
  }
  await admin.auth().revokeRefreshTokens(uid);
  await audit(store.id, ownerId, "store_staff.updated", uid, {isActive, permissions: selected});
  return {success: true};
});

export const deleteStoreStaffUser = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to manage store staff.");
  const {store, ownerId} = await ownerContext(request.auth.uid);
  const uid = text((request.data as {uid?: unknown} | null)?.uid, 128);
  const reference = db.collection("storeStaff").doc(uid);
  const existing = await reference.get();
  if (!existing.exists || existing.data()?.storeId !== store.id || existing.data()?.ownerId !== ownerId) throw new HttpsError("not-found", "The staff account was not found.");
  const staffEmail = text(existing.data()?.email);
  await admin.auth().deleteUser(uid).catch((error) => {if ((error as {code?: string}).code !== "auth/user-not-found") throw error;});
  const batch = db.batch();
  batch.delete(reference);
  batch.delete(db.collection("users").doc(uid));
  await batch.commit();
  await audit(store.id, ownerId, "store_staff.deleted", uid, {email: staffEmail});
  return {success: true};
});
