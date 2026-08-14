import * as admin from "firebase-admin";
import {createHash} from "node:crypto";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const versions = db.collection("legalDocuments");
const pointers = db.collection("legalDocumentPointers");
const allowedStatuses = new Set(["draft", "published", "archived"]);

function stringValue(value: unknown, field: string, maximum = 100_000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new HttpsError("invalid-argument", `${field} is required and must be no longer than ${maximum} characters.`);
  }
  return value.trim();
}

function documentKey(value: unknown): string {
  const key = stringValue(value, "Document key", 80).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(key)) throw new HttpsError("invalid-argument", "Document key can only contain lowercase letters, numbers, and underscores.");
  return key;
}

function hash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function serialize(snapshot: FirebaseFirestore.DocumentSnapshot) {
  const data = snapshot.data() ?? {};
  const iso = (value: unknown) => value && typeof value === "object" && "toDate" in value
    ? (value as FirebaseFirestore.Timestamp).toDate().toISOString() : null;
  return {...data, id: snapshot.id, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), publishedAt: iso(data.publishedAt), archivedAt: iso(data.archivedAt)};
}

export const getPublicLegalDocument = onCall({region: "us-central1"}, async (request) => {
  const key = documentKey(request.data?.documentKey);
  const pointer = await pointers.doc(key).get();
  const versionId = pointer.data()?.versionDocumentId;
  if (!pointer.exists || typeof versionId !== "string") throw new HttpsError("not-found", "This legal document is not currently published.");
  const version = await versions.doc(versionId).get();
  if (!version.exists || version.data()?.status !== "published") throw new HttpsError("not-found", "This legal document is not currently published.");
  return {document: serialize(version)};
});

export const getAdminLegalDocuments = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "legal_documents", "read");
  const snapshot = await versions.limit(500).get();
  return {documents: snapshot.docs.map(serialize).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))};
});

export const createAdminLegalDocumentDraft = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "legal_documents", "write");
  const key = documentKey(request.data?.documentKey);
  const version = stringValue(request.data?.version, "Version", 80);
  const matchingKey = await versions.where("documentKey", "==", key).get();
  if (matchingKey.docs.some((snapshot) => snapshot.data().version === version)) throw new HttpsError("already-exists", "That document version already exists.");
  const content = stringValue(request.data?.content, "Content", 200_000);
  const reference = versions.doc();
  await reference.set({
    documentKey: key,
    title: stringValue(request.data?.title, "Title", 160),
    audience: stringValue(request.data?.audience, "Audience", 40),
    version,
    content,
    documentHash: hash(content),
    effectiveDate: stringValue(request.data?.effectiveDate, "Effective date", 40),
    lastUpdated: stringValue(request.data?.lastUpdated ?? request.data?.effectiveDate, "Last updated", 40),
    changeSummary: typeof request.data?.changeSummary === "string" ? request.data.changeSummary.trim().slice(0, 1000) : "",
    requiresAcceptance: request.data?.requiresAcceptance === true,
    status: "draft",
    createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid,
  });
  await writeAdminAuditLog(administrator, {action: "legal_document_draft_created", targetType: "legal_document", targetId: reference.id, details: {documentKey: key, version}});
  return {id: reference.id};
});

export const updateAdminLegalDocumentDraft = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "legal_documents", "write");
  const id = stringValue(request.data?.id, "Document ID", 120);
  const reference = versions.doc(id);
  const existing = await reference.get();
  if (!existing.exists) throw new HttpsError("not-found", "Document version not found.");
  if (existing.data()?.status !== "draft") throw new HttpsError("failed-precondition", "Published and archived versions are immutable. Create a new draft instead.");
  const content = stringValue(request.data?.content, "Content", 200_000);
  await reference.update({title: stringValue(request.data?.title, "Title", 160), audience: stringValue(request.data?.audience, "Audience", 40), content, documentHash: hash(content), effectiveDate: stringValue(request.data?.effectiveDate, "Effective date", 40), lastUpdated: stringValue(request.data?.lastUpdated ?? request.data?.effectiveDate, "Last updated", 40), changeSummary: typeof request.data?.changeSummary === "string" ? request.data.changeSummary.trim().slice(0, 1000) : "", requiresAcceptance: request.data?.requiresAcceptance === true, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  await writeAdminAuditLog(administrator, {action: "legal_document_draft_updated", targetType: "legal_document", targetId: id});
  return {updated: true};
});

export const publishAdminLegalDocument = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "legal_documents", "write");
  const id = stringValue(request.data?.id, "Document ID", 120);
  const reference = versions.doc(id);
  await db.runTransaction(async (transaction) => {
    const draft = await transaction.get(reference);
    if (!draft.exists || draft.data()?.status !== "draft") throw new HttpsError("failed-precondition", "Only a draft can be published.");
    const key = String(draft.data()?.documentKey);
    const pointerReference = pointers.doc(key);
    const pointer = await transaction.get(pointerReference);
    const previousId = pointer.data()?.versionDocumentId;
    if (typeof previousId === "string" && previousId !== id) transaction.update(versions.doc(previousId), {status: "archived", archivedAt: FieldValue.serverTimestamp(), archivedBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
    transaction.update(reference, {status: "published", publishedAt: FieldValue.serverTimestamp(), publishedBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
    transaction.set(pointerReference, {documentKey: key, versionDocumentId: id, version: draft.data()?.version, title: draft.data()?.title, audience: draft.data()?.audience, requiresAcceptance: draft.data()?.requiresAcceptance === true, effectiveDate: draft.data()?.effectiveDate, lastUpdated: draft.data()?.lastUpdated, documentHash: draft.data()?.documentHash, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  });
  await writeAdminAuditLog(administrator, {action: "legal_document_published", targetType: "legal_document", targetId: id});
  return {published: true};
});

export const archiveAdminLegalDocument = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "legal_documents", "write");
  const id = stringValue(request.data?.id, "Document ID", 120);
  const reference = versions.doc(id);
  await db.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    if (!document.exists || !allowedStatuses.has(String(document.data()?.status))) throw new HttpsError("not-found", "Document version not found.");
    if (document.data()?.status !== "published") throw new HttpsError("failed-precondition", "Only the current published version can be archived.");
    transaction.update(reference, {status: "archived", archivedAt: FieldValue.serverTimestamp(), archivedBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
    transaction.delete(pointers.doc(String(document.data()?.documentKey)));
  });
  await writeAdminAuditLog(administrator, {action: "legal_document_archived", targetType: "legal_document", targetId: id});
  return {archived: true};
});

export const deleteAdminLegalDocumentDraft = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "legal_documents", "write");
  const id = stringValue(request.data?.id, "Document ID", 120);
  const reference = versions.doc(id);
  const document = await reference.get();
  if (!document.exists) return {deleted: true};
  if (document.data()?.status !== "draft") throw new HttpsError("failed-precondition", "Only drafts may be deleted. Published history must be retained.");
  await reference.delete();
  await writeAdminAuditLog(administrator, {action: "legal_document_draft_deleted", targetType: "legal_document", targetId: id});
  return {deleted: true};
});
