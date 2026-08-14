/*
|--------------------------------------------------------------------------
| Private Store Contracts
|--------------------------------------------------------------------------
|
| Administrators reserve and finalize exact PDF originals. Store owners can
| list and preview only contracts belonging to their approved store. Storage
| objects are never public; previews use short-lived signed URLs.
|
*/

import * as admin from "firebase-admin";
import {createHash} from "node:crypto";
import {FieldValue, getFirestore, type DocumentSnapshot} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {requireApprovedStore} from "../services/store/storeAccessService";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const bucket = getStorage().bucket();
const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;
const MAX_CONTRACTS_PER_STORE = 20;
const DEFAULT_STORE_COMMISSION_BASIS_POINTS = 1_000;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validBasisPoints(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5_000;
}

function safePdfName(value: unknown): string {
  const name = text(value).replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").slice(0, 180);
  if (!name.toLowerCase().endsWith(".pdf")) throw new HttpsError("invalid-argument", "Choose a PDF contract.");
  return name || "signed-store-contract.pdf";
}

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function contractSummary(document: DocumentSnapshot) {
  const data = document.data() ?? {};
  return {
    id: document.id,
    fileName: text(data.fileName) || "Signed store contract.pdf",
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    uploadedAt: iso(data.uploadedAt),
    uploadedByEmail: text(data.uploadedByEmail),
    sha256: text(data.sha256),
  };
}

async function requireStore(storeIdValue: unknown) {
  const storeId = text(storeIdValue);
  if (!storeId) throw new HttpsError("invalid-argument", "A store is required.");
  const store = await db.collection("stores").doc(storeId).get();
  if (!store.exists) throw new HttpsError("not-found", "The store was not found.");
  return store;
}

async function listReadyContracts(storeId: string) {
  const snapshot = await db.collection("stores").doc(storeId).collection("contracts")
    .where("status", "==", "ready").limit(MAX_CONTRACTS_PER_STORE).get();
  return snapshot.docs
    .map(contractSummary)
    .sort((left, right) => (right.uploadedAt ?? "").localeCompare(left.uploadedAt ?? ""));
}

async function effectiveCommission(store: DocumentSnapshot) {
  const settings = await db.collection("settings").doc("marketplacePayment").get();
  const override = store.data()?.paymentSettings?.storeCommissionBasisPoints;
  const configuredDefault = settings.data()?.defaultStoreCommissionBasisPoints;
  return validBasisPoints(override)
    ? {basisPoints: override, source: "store_override" as const}
    : {
      basisPoints: validBasisPoints(configuredDefault) ? configuredDefault : DEFAULT_STORE_COMMISSION_BASIS_POINTS,
      source: "default" as const,
    };
}

export const getAdminStoreContracts = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "stores");
  const store = await requireStore((request.data as {storeId?: unknown} | undefined)?.storeId);
  const [contracts, commission] = await Promise.all([listReadyContracts(store.id), effectiveCommission(store)]);
  return {contracts, commission};
});

export const prepareAdminStoreContractUpload = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "stores", "write");
  const input = request.data as {storeId?: unknown; fileName?: unknown; sizeBytes?: unknown} | undefined;
  const store = await requireStore(input?.storeId);
  const fileName = safePdfName(input?.fileName);
  const sizeBytes = input?.sizeBytes;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_CONTRACT_BYTES) {
    throw new HttpsError("invalid-argument", "Each PDF must be 10 MB or smaller.");
  }
  const contracts = store.ref.collection("contracts");
  const existing = await contracts.where("status", "in", ["reserved", "ready"]).limit(MAX_CONTRACTS_PER_STORE).get();
  if (existing.size >= MAX_CONTRACTS_PER_STORE) throw new HttpsError("resource-exhausted", "This store already has the maximum of 20 contract documents.");
  const contract = contracts.doc();
  const storagePath = `stores/${store.id}/contracts/${contract.id}.pdf`;
  await contract.set({
    storeId: store.id, fileName, storagePath, expectedSizeBytes: sizeBytes,
    contentType: "application/pdf", status: "reserved",
    uploadedBy: administrator.uid, uploadedByEmail: administrator.email,
    createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return {contractId: contract.id, storagePath, maxBytes: MAX_CONTRACT_BYTES};
});

export const finalizeAdminStoreContractUpload = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "stores", "write");
  const input = request.data as {storeId?: unknown; contractId?: unknown} | undefined;
  const store = await requireStore(input?.storeId);
  const contractId = text(input?.contractId);
  if (!contractId) throw new HttpsError("invalid-argument", "A contract upload is required.");
  const contractRef = store.ref.collection("contracts").doc(contractId);
  const contract = await contractRef.get();
  const data = contract.data();
  if (!contract.exists || data?.status !== "reserved") throw new HttpsError("failed-precondition", "This contract upload is no longer available.");
  const storagePath = text(data.storagePath);
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "Upload the PDF before saving it.");
  const [metadata] = await file.getMetadata();
  const sizeBytes = Number(metadata.size);
  const [contents] = await file.download();
  const validPdf = contents.subarray(0, 5).toString("ascii") === "%PDF-";
  const validMetadata = metadata.contentType === "application/pdf" &&
    metadata.metadata?.storeId === store.id && metadata.metadata?.contractId === contractId &&
    metadata.metadata?.processingType === "store-contract-original";
  if (!validPdf || !validMetadata || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_CONTRACT_BYTES) {
    await file.delete({ignoreNotFound: true});
    await contractRef.delete();
    throw new HttpsError("invalid-argument", "The uploaded file is not a valid PDF contract of 10 MB or less.");
  }
  const sha256 = createHash("sha256").update(contents).digest("hex");
  await contractRef.update({status: "ready", sizeBytes, sha256, uploadedAt: FieldValue.serverTimestamp(), expiresAt: FieldValue.delete()});
  await writeAdminAuditLog(administrator, {action: "store.contract_uploaded", targetType: "store", targetId: store.id, details: {contractId, fileName: text(data.fileName), sizeBytes, sha256}});
  return {success: true};
});

export const deleteAdminStoreContract = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "stores", "write");
  const input = request.data as {storeId?: unknown; contractId?: unknown} | undefined;
  const store = await requireStore(input?.storeId);
  const contractId = text(input?.contractId);
  const contractRef = store.ref.collection("contracts").doc(contractId);
  const contract = await contractRef.get();
  if (!contract.exists) throw new HttpsError("not-found", "The contract was not found.");
  await bucket.file(text(contract.data()?.storagePath)).delete({ignoreNotFound: true});
  await contractRef.delete();
  await writeAdminAuditLog(administrator, {action: "store.contract_deleted", targetType: "store", targetId: store.id, details: {contractId, fileName: text(contract.data()?.fileName)}});
  return {success: true};
});

export const getAdminStoreContractPreview = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "stores");
  const input = request.data as {storeId?: unknown; contractId?: unknown} | undefined;
  const store = await requireStore(input?.storeId);
  return preview(store.id, text(input?.contractId));
});

export const getStoreOwnerContracts = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view your store contract.");
  const store = await requireApprovedStore(request.auth.uid);
  const [contracts, commission] = await Promise.all([listReadyContracts(store.id), effectiveCommission(store)]);
  return {contracts, commission};
});

export const getStoreOwnerContractPreview = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view your store contract.");
  const store = await requireApprovedStore(request.auth.uid);
  return preview(store.id, text((request.data as {contractId?: unknown} | undefined)?.contractId));
});

async function preview(storeId: string, contractId: string) {
  if (!contractId) throw new HttpsError("invalid-argument", "Choose a contract to view.");
  const contract = await db.collection("stores").doc(storeId).collection("contracts").doc(contractId).get();
  const data = contract.data();
  if (!contract.exists || data?.status !== "ready") throw new HttpsError("not-found", "The contract was not found.");
  const fileName = safePdfName(data.fileName);
  const [url] = await bucket.file(text(data.storagePath)).getSignedUrl({
    action: "read", expires: Date.now() + 15 * 60 * 1000,
    responseType: "application/pdf", responseDisposition: `inline; filename="${fileName.replace(/"/g, "")}"`,
  });
  return {url, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()};
}
