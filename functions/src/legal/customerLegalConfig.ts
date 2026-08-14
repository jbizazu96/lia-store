import {HttpsError} from "firebase-functions/v2/https";

export interface CustomerLegalDocument {
  documentKey: string; acceptanceField: string; title: string; version: string;
  effectiveDate: string; lastUpdated: string; documentPath: string;
  documentHash: string; requiresAcceptance: boolean; acceptanceVerb: "agree" | "acknowledge";
}

export const CUSTOMER_TERMS: CustomerLegalDocument = {documentKey: "customer_terms", acceptanceField: "customerTerms", title: "Customer Terms of Service", version: "customer-terms-v1", effectiveDate: "2026-08-14", lastUpdated: "2026-08-14", documentPath: "/legal/customer-terms", documentHash: "sha256:3fcf03b5acc939fd515c5f61f4b6cd247585db0c2e5820389f1f90b82f7c7214", requiresAcceptance: true, acceptanceVerb: "agree"};
export const CUSTOMER_PRIVACY: CustomerLegalDocument = {documentKey: "customer_privacy", acceptanceField: "customerPrivacy", title: "Privacy Policy", version: "customer-privacy-v1", effectiveDate: "2026-08-14", lastUpdated: "2026-08-14", documentPath: "/legal/privacy", documentHash: "sha256:c4863c982b70398b7f9f150048fbed9df05452fc1a4020fd669841379f5a69a6", requiresAcceptance: true, acceptanceVerb: "acknowledge"};
const FALLBACKS = [CUSTOMER_TERMS, CUSTOMER_PRIVACY];

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function getCurrentCustomerLegalDocuments(db: FirebaseFirestore.Firestore): Promise<CustomerLegalDocument[]> {
  const pointers = await db.collection("legalDocumentPointers").get();
  const byKey = new Map(pointers.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
  return FALLBACKS.map((fallback) => {
    const pointer = byKey.get(fallback.documentKey);
    if (!pointer || pointer.audience !== "customer") return fallback;
    return {...fallback, title: text(pointer.title) || fallback.title, version: text(pointer.version) || fallback.version, effectiveDate: text(pointer.effectiveDate) || fallback.effectiveDate, lastUpdated: text(pointer.lastUpdated) || fallback.lastUpdated, documentHash: text(pointer.documentHash) || fallback.documentHash, requiresAcceptance: pointer.requiresAcceptance === true};
  });
}

export function hasAcceptedCustomerLegalDocument(userData: Record<string, unknown>, uid: string, document: CustomerLegalDocument): boolean {
  const acceptance = record(record(userData.legalAcceptances)[document.acceptanceField]);
  return acceptance.accepted === true && text(acceptance.version) === document.version && text(acceptance.documentHash) === document.documentHash && text(acceptance.acceptedByUid) === uid;
}

export async function requireCurrentCustomerLegalDocuments(db: FirebaseFirestore.Firestore, userData: Record<string, unknown>, uid: string): Promise<void> {
  const required = (await getCurrentCustomerLegalDocuments(db)).filter((document) => document.requiresAcceptance);
  if (required.some((document) => !hasAcceptedCustomerLegalDocument(userData, uid, document))) throw new HttpsError("failed-precondition", "Review and accept the current LIA legal documents to continue.");
}

export const hasAcceptedCurrentCustomerTerms = (userData: Record<string, unknown>, uid: string) => hasAcceptedCustomerLegalDocument(userData, uid, CUSTOMER_TERMS);
