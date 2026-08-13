import {getFirestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {canAccessStoreStripe, canEditStoreApplication, hasApprovedStoreWorkspace} from "./storeApprovalPolicy";

const db = getFirestore("default");
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

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

export function requireApplicationEditable(store: FirebaseFirestore.DocumentSnapshot) {
  if (!canEditStoreApplication(store.data() ?? {})) {
    throw new HttpsError("failed-precondition", "This store application has already been submitted. Contact LIA support if a correction is required.");
  }
}

export function requireStripeAccess(store: FirebaseFirestore.DocumentSnapshot, context: "onboarding" | "settings") {
  if (canAccessStoreStripe(store.data() ?? {}, context)) return;
  throw new HttpsError("permission-denied", "Stripe settings are unavailable until LIA approves your store.");
}
