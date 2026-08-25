import {getFirestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {canAccessStoreStripe, canEditStoreApplication, hasApprovedStoreWorkspace} from "./storeApprovalPolicy";

const db = getFirestore("default");
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const STORE_STAFF_PAGES = ["orders", "products"] as const;
export type StoreStaffPage = typeof STORE_STAFF_PAGES[number];
export type StoreStaffAccessLevel = "read" | "write";
export interface StoreWorkspaceAccess {
  uid: string;
  storeId: string;
  ownerId: string;
  role: "owner" | "staff";
  permissions: Partial<Record<StoreStaffPage, StoreStaffAccessLevel>>;
}

function staffPermissions(value: unknown): StoreWorkspaceAccess["permissions"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(STORE_STAFF_PAGES.flatMap((page) =>
    input[page] === "read" || input[page] === "write" ? [[page, input[page]]] : [],
  ));
}

async function requireOperationalStoreOwner(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can access this resource.");
  }
  if (["deletion_pending", "deletion_processing"].includes(text(user.data()?.accountDeletionState))) {
    throw new HttpsError("permission-denied", "Store access is unavailable while account deletion is under review.");
  }
  return user;
}

export async function requireOwnedStore(uid: string) {
  const user = await requireOperationalStoreOwner(uid);
  const storeId = text(user.data()?.storeId);
  if (storeId) {
    const store = await db.collection("stores").doc(storeId).get();
    if (store.exists && store.data()?.ownerId === uid) return store;
  }
  const matches = await db.collection("stores").where("ownerId", "==", uid).limit(1).get();
  const store = matches.docs[0];
  if (!store) throw new HttpsError("not-found", "No store was found for this account.");
  return store;
}

export async function requireApprovedStore(uid: string) {
  const store = await requireOwnedStore(uid);
  if (!hasApprovedStoreWorkspace(store.data() ?? {})) {
    throw new HttpsError("permission-denied", "Your store application must be approved by LIA before you can access the store workspace.");
  }
  return store;
}

export async function requireStoreWorkspaceAccess(
  uid: string,
  page?: StoreStaffPage,
  level: StoreStaffAccessLevel = "read",
) {
  const user = await db.collection("users").doc(uid).get();
  const data = user.data() ?? {};
  if (["deletion_pending", "deletion_processing"].includes(text(data.accountDeletionState)) || data.isActive === false) {
    throw new HttpsError("permission-denied", "This store account is not currently operational.");
  }

  let access: StoreWorkspaceAccess;
  if (data.accountType === "store_owner") {
    const store = await requireApprovedStore(uid);
    access = {uid, storeId: store.id, ownerId: uid, role: "owner", permissions: {orders: "write", products: "write"}};
    return {store, access};
  }

  if (data.accountType !== "store_staff") {
    throw new HttpsError("permission-denied", "Only authorized store users can access this resource.");
  }
  const staff = await db.collection("storeStaff").doc(uid).get();
  const staffData = staff.data() ?? {};
  if (!staff.exists || staffData.isActive !== true) {
    throw new HttpsError("permission-denied", "This store staff account is inactive.");
  }
  const storeId = text(staffData.storeId) || text(data.storeId);
  const ownerId = text(staffData.ownerId);
  const store = storeId ? await db.collection("stores").doc(storeId).get() : null;
  if (!store?.exists || store.data()?.ownerId !== ownerId || !hasApprovedStoreWorkspace(store.data() ?? {})) {
    throw new HttpsError("permission-denied", "This store workspace is unavailable.");
  }
  access = {uid, storeId, ownerId, role: "staff", permissions: staffPermissions(staffData.permissions)};
  if (page) {
    const granted = access.permissions[page];
    if (!granted || (level === "write" && granted !== "write")) {
      throw new HttpsError("permission-denied", `You do not have ${level} access to store ${page}.`);
    }
  }
  return {store, access};
}

export function requireApplicationEditable(store: FirebaseFirestore.DocumentSnapshot) {
  if (!canEditStoreApplication(store.data() ?? {})) {
    throw new HttpsError("failed-precondition", "This store application has already been submitted. Contact LIA support if a correction is required.");
  }
}

export function requireStripeAccess(store: FirebaseFirestore.DocumentSnapshot, context: "onboarding" | "settings") {
  if (canAccessStoreStripe(store.data() ?? {}, context)) return;
  throw new HttpsError("permission-denied", "Stripe settings are unavailable until LIA approves your store.");
}
