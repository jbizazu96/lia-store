import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {notificationService} from "../services/notificationService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const reasons = new Set(["account", "orders", "payments", "delivery", "technical", "other"]);
type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const timestamp = (value: unknown): string | null => value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function" ? value.toDate().toISOString() : null;

function mapRequest(id: string, data: Data) {
  const response = record(data.adminResponse);
  return {id, ownerId: text(data.ownerId), ownerType: text(data.ownerType), ownerName: text(data.ownerName), ownerEmail: text(data.ownerEmail), reason: text(data.reason), message: text(data.message), status: text(data.status) || "open", createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt), adminResponse: text(response.message) ? {message: text(response.message), respondedAt: timestamp(response.respondedAt)} : null};
}

async function account(uid: string): Promise<{ownerType: "store" | "driver"; ownerName: string; ownerEmail: string}> {
  const user = await db.collection("users").doc(uid).get();
  const data = user.data() ?? {};
  const accountType = text(data.accountType);
  if (data.isActive === false) throw new HttpsError("permission-denied", "This account cannot submit support requests.");
  if (accountType === "driver") {
    const driver = await db.collection("drivers").doc(uid).get();
    const driverData = driver.data() ?? {};
    return {ownerType: "driver", ownerName: [text(driverData.firstName), text(driverData.lastName)].filter(Boolean).join(" ") || text(data.displayName) || "Driver", ownerEmail: text(data.email)};
  }
  if (accountType === "store_owner") {
    const stores = await db.collection("stores").where("ownerId", "==", uid).limit(1).get();
    return {ownerType: "store", ownerName: text(stores.docs[0]?.data().name) || text(data.displayName) || "Store owner", ownerEmail: text(data.email)};
  }
  throw new HttpsError("permission-denied", "Only store and driver accounts can use this support form.");
}

export const createAccountSupportRequest = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to contact LIA Support.");
  await enforceCallableAbuseProtection({operation: "account-support-create", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 5, windowSeconds: 3600});
  const input = record(request.data); const reason = text(input.reason); const message = text(input.message);
  if (!reasons.has(reason)) throw new HttpsError("invalid-argument", "Choose a valid support reason.");
  if (message.length < 10 || message.length > 2_000) throw new HttpsError("invalid-argument", "Describe the issue using 10 to 2,000 characters.");
  const owner = await account(request.auth.uid);
  const reference = db.collection("accountSupportRequests").doc();
  await reference.create({...owner, ownerId: request.auth.uid, reason, message, status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  return {success: true, requestId: reference.id};
});

export const createPublicSupportRequest = onCall({region: "us-central1"}, async (request) => {
  const input = record(request.data);
  const name = text(input.name);
  const email = text(input.email).toLowerCase();
  const reason = text(input.reason);
  const message = text(input.message);
  if (text(input.website)) return {success: true}; // Honeypot: silently discard automated form submissions.
  if (name.length < 2 || name.length > 100) throw new HttpsError("invalid-argument", "Enter your name using 2 to 100 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  if (!reasons.has(reason)) throw new HttpsError("invalid-argument", "Choose a valid question type.");
  if (message.length < 10 || message.length > 2_000) throw new HttpsError("invalid-argument", "Write your question using 10 to 2,000 characters.");
  await enforceCallableAbuseProtection({operation: "public-support-create", uid: email, appCheckVerified: Boolean(request.app), maximumRequests: 3, windowSeconds: 3600});
  const reference = db.collection("accountSupportRequests").doc();
  await reference.create({ownerId: "", ownerType: "public", ownerName: name, ownerEmail: email, reason, message, source: "public_website", status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  return {success: true, requestId: reference.id};
});

export const getAdminAccountSupportRequests = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "support");
  const requestedStatus = text(record(request.data).status) || "all";
  const snapshot = await db.collection("accountSupportRequests").orderBy("createdAt", "desc").limit(100).get();
  const requests = snapshot.docs.map((document) => mapRequest(document.id, document.data())).filter((item) => requestedStatus === "all" || item.status === requestedStatus);
  return {requests};
});

export const respondAdminAccountSupportRequest = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "support", "write");
  const input = record(request.data); const requestId = text(input.requestId); const message = text(input.message); const status = text(input.status);
  if (!requestId || requestId.includes("/")) throw new HttpsError("invalid-argument", "Support request is required.");
  if (message.length < 2 || message.length > 2_000) throw new HttpsError("invalid-argument", "Write a response using 2 to 2,000 characters.");
  if (!["in_review", "responded", "resolved"].includes(status)) throw new HttpsError("invalid-argument", "Choose a valid support status.");
  const reference = db.collection("accountSupportRequests").doc(requestId); const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "The support request was not found.");
  const data = snapshot.data() ?? {}; const ownerId = text(data.ownerId);
  await reference.update({status, adminResponse: {message, respondedAt: FieldValue.serverTimestamp(), responderId: administrator.uid}, updatedAt: FieldValue.serverTimestamp()});
  if (ownerId) {
    await db.collection("users").doc(ownerId).collection("notifications").doc(`account-support-${requestId}`).set({title: "LIA Support replied", body: message.slice(0, 300), type: "system", deepLink: text(data.ownerType) === "driver" ? "/driver/settings" : "/store/settings?section=support", read: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    try { await notificationService.sendToUser(ownerId, "LIA Support replied", message.slice(0, 300), text(data.ownerType) === "driver" ? "/driver/settings" : "/store/settings?section=support"); } catch (error) { console.error("Support response push failed.", {requestId, error}); }
  }
  await writeAdminAuditLog(administrator, {action: "account_support_replied", targetType: "account_support_request", targetId: requestId, reason: message, details: {status, ownerId}});
  return {success: true};
});
