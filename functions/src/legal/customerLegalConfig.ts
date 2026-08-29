import {HttpsError} from "firebase-functions/v2/https";

export interface CustomerLegalDocument {
  documentKey: string; acceptanceField: string; title: string; version: string;
  effectiveDate: string; lastUpdated: string; documentPath: string;
  documentHash: string; requiresAcceptance: boolean; acceptanceVerb: "agree" | "acknowledge";
}

export const CUSTOMER_TERMS: CustomerLegalDocument = {documentKey: "customer_terms", acceptanceField: "customerTerms", title: "Customer Terms of Service", version: "customer-terms-v3", effectiveDate: "2026-08-28", lastUpdated: "2026-08-28", documentPath: "/legal/customer-terms", documentHash: "sha256:9fddf57b5bcd1dd5b5fda207a23bf44a51c81706b3f091afe2687198309fccc1", requiresAcceptance: true, acceptanceVerb: "agree"};
export const CUSTOMER_PRIVACY: CustomerLegalDocument = {documentKey: "customer_privacy", acceptanceField: "customerPrivacy", title: "Privacy Policy", version: "customer-privacy-v2", effectiveDate: "2026-08-28", lastUpdated: "2026-08-28", documentPath: "/legal/privacy", documentHash: "sha256:080160d7b8514c452fe23b16706dc88fa733152a6b1e7d44353e71c2894f85f1", requiresAcceptance: true, acceptanceVerb: "acknowledge"};
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
