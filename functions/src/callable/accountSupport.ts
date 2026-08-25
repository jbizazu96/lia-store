import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {notificationService} from "../services/notificationService";
import {enqueueEmail} from "../email/emailQueueService";
import {driverAccountActivityEmail} from "../email/emailTemplates";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const reasons = new Set(["account", "orders", "payments", "delivery", "technical", "other"]);
type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const timestamp = (value: unknown): string | null => value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function" ? value.toDate().toISOString() : null;

function mapRequest(id: string, data: Data) {
  const response = record(data.adminResponse);
  const assigned = record(data.assignedTo);
  return {id, ownerId: text(data.ownerId), ownerType: text(data.ownerType), ownerName: text(data.ownerName), ownerEmail: text(data.ownerEmail), reason: text(data.reason), message: text(data.message), status: text(data.status) || "open", createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt), assignedTo: text(assigned.uid) ? {uid: text(assigned.uid), name: text(assigned.name), email: text(assigned.email)} : null, adminResponse: text(response.message) ? {message: text(response.message), respondedAt: timestamp(response.respondedAt)} : null};
}

async function createRequestWithInitialMessage(reference: FirebaseFirestore.DocumentReference, data: Data): Promise<void> {
  const messageReference = reference.collection("messages").doc(); const batch = db.batch();
  batch.create(reference, data);
  batch.create(messageReference, {visibility: "customer", senderType: data.ownerType === "public" ? "public" : "account", senderId: data.ownerId || null, senderName: data.ownerName, message: data.message, createdAt: FieldValue.serverTimestamp()});
  await batch.commit();
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
  await createRequestWithInitialMessage(reference, {...owner, ownerId: request.auth.uid, reason, message, status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
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
  await createRequestWithInitialMessage(reference, {ownerId: "", ownerType: "public", ownerName: name, ownerEmail: email, reason, message, source: "public_website", status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  return {success: true, requestId: reference.id};
});

export const getAdminAccountSupportRequests = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "support");
  const input = record(request.data); const requestedStatus = text(input.status) || "all"; const cursorId = text(input.cursor);
  let cursor = cursorId ? await db.collection("accountSupportRequests").doc(cursorId).get() : null;
  const requests: ReturnType<typeof mapRequest>[] = [];
  let exhausted = false;
  while (requests.length < 40 && !exhausted) {
    let query = db.collection("accountSupportRequests").orderBy("createdAt", "desc").limit(100);
    if (cursor?.exists) query = query.startAfter(cursor);
    const snapshot = await query.get();
    let consumed = 0;
    for (const document of snapshot.docs) {
      consumed += 1;
      cursor = document;
      const item = mapRequest(document.id, document.data());
      if (requestedStatus === "all" || item.status === requestedStatus) requests.push(item);
      if (requests.length >= 40) break;
    }
    exhausted = consumed === snapshot.size && snapshot.size < 100;
  }
  return {requests, nextCursor: exhausted ? null : cursor?.id ?? null};
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
  const messageReference = reference.collection("messages").doc(); const batch = db.batch();
  batch.update(reference, {status, adminResponse: {message, respondedAt: FieldValue.serverTimestamp(), responderId: administrator.uid}, updatedAt: FieldValue.serverTimestamp()});
  batch.create(messageReference, {visibility: "customer", senderType: "admin", senderId: administrator.uid, senderName: administrator.displayName || administrator.email, message, createdAt: FieldValue.serverTimestamp()});
  await batch.commit();
  if (ownerId) {
    await db.collection("users").doc(ownerId).collection("notifications").doc(`account-support-${requestId}`).set({title: "LIA Support replied", body: message.slice(0, 300), type: "system", deepLink: text(data.ownerType) === "driver" ? "/driver/settings" : "/store/settings?section=support", read: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    try { await notificationService.sendToUser(ownerId, "LIA Support replied", message.slice(0, 300), text(data.ownerType) === "driver" ? "/driver/settings" : "/store/settings?section=support"); } catch (error) { console.error("Support response push failed.", {requestId, error}); }
    if (text(data.ownerType) === "driver") {
      const template = driverAccountActivityEmail({driverName: text(data.ownerName) || "Driver", title: "LIA Support replied", summary: message, badge: "LIA SUPPORT", actionLabel: "Open Driver Settings", url: "https://www.liamarketplace.com/driver/settings"});
      await enqueueEmail({dedupeKey: `driver-support-response:${requestId}:${status}:${message}`, category: "driver_support", to: text(data.ownerEmail), ...template, tags: {driver_id: ownerId, support_request_id: requestId}});
    }
  }
  await writeAdminAuditLog(administrator, {action: "account_support_replied", targetType: "account_support_request", targetId: requestId, reason: message, details: {status, ownerId}});
  return {success: true};
});

export const getAdminAccountSupportConversation = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "support"); const requestId = text(record(request.data).requestId);
  if (!requestId || requestId.includes("/")) throw new HttpsError("invalid-argument", "Support request is required.");
  const reference = db.collection("accountSupportRequests").doc(requestId); const [snapshot, messages] = await Promise.all([reference.get(), reference.collection("messages").orderBy("createdAt", "asc").limit(300).get()]);
  if (!snapshot.exists) throw new HttpsError("not-found", "The support request was not found.");
  const requestData = snapshot.data() ?? {};
  const conversation = messages.docs.map((document) => ({id: document.id, visibility: text(document.data().visibility), senderType: text(document.data().senderType), senderName: text(document.data().senderName), message: text(document.data().message), createdAt: timestamp(document.data().createdAt)}));
  if (conversation.length === 0 && text(requestData.message)) conversation.push({id: "initial-legacy-message", visibility: "customer", senderType: text(requestData.ownerType), senderName: text(requestData.ownerName), message: text(requestData.message), createdAt: timestamp(requestData.createdAt)});
  return {request: mapRequest(snapshot.id, requestData), messages: conversation};
});

export const assignAdminAccountSupportRequest = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "support", "write"); const input = record(request.data); const requestId = text(input.requestId); const assigneeId = text(input.assigneeId);
  if (!requestId || requestId.includes("/")) throw new HttpsError("invalid-argument", "Support request is required.");
  let assignedTo: Data | null = null;
  if (assigneeId) { const assignee = await db.collection("admins").doc(assigneeId).get(); if (!assignee.exists || assignee.data()?.isActive !== true) throw new HttpsError("failed-precondition", "Choose an active administrator."); assignedTo = {uid: assignee.id, name: text(assignee.data()?.displayName), email: text(assignee.data()?.email)}; }
  await db.collection("accountSupportRequests").doc(requestId).update({assignedTo, status: assignedTo ? "in_review" : "open", updatedAt: FieldValue.serverTimestamp()});
  await writeAdminAuditLog(administrator, {action: assignedTo ? "support_request_assigned" : "support_request_unassigned", targetType: "account_support_request", targetId: requestId, details: {assigneeId: assigneeId || null}}); return {success: true};
});

export const getAdminSupportAssignees = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "support"); const snapshot = await db.collection("admins").where("isActive", "==", true).limit(100).get();
  return {assignees: snapshot.docs.flatMap((document) => { const data = document.data(); const permissions = record(data.permissions); if (data.role !== "master_admin" && !["read", "write"].includes(text(permissions.support))) return []; return [{uid: document.id, name: text(data.displayName), email: text(data.email)}]; })};
});

export const addAdminAccountSupportInternalNote = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "support", "write"); const input = record(request.data); const requestId = text(input.requestId); const message = text(input.message);
  if (!requestId || requestId.includes("/") || message.length < 2 || message.length > 2000) throw new HttpsError("invalid-argument", "Enter a valid internal note.");
  const reference = db.collection("accountSupportRequests").doc(requestId); if (!(await reference.get()).exists) throw new HttpsError("not-found", "The support request was not found.");
  await reference.collection("messages").add({visibility: "internal", senderType: "admin", senderId: administrator.uid, senderName: administrator.displayName || administrator.email, message, createdAt: FieldValue.serverTimestamp()});
  await reference.update({updatedAt: FieldValue.serverTimestamp()}); await writeAdminAuditLog(administrator, {action: "support_internal_note_added", targetType: "account_support_request", targetId: requestId}); return {success: true};
});
