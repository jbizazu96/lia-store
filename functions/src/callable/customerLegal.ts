import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {getCurrentCustomerLegalDocuments, hasAcceptedCustomerLegalDocument, type CustomerLegalDocument} from "../legal/customerLegalConfig";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
function acceptanceRecord(document: CustomerLegalDocument, uid: string, email: unknown, source: string) { return {accepted: true, documentKey: document.documentKey, version: document.version, effectiveDate: document.effectiveDate, lastUpdated: document.lastUpdated, documentPath: document.documentPath, documentHash: document.documentHash, acceptedByUid: uid, acceptedByEmail: typeof email === "string" ? email.trim().toLowerCase() : null, acceptedAt: FieldValue.serverTimestamp(), source}; }

export const getCustomerTermsStatus = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to check legal acceptance.");
  const user = await db.collection("users").doc(request.auth.uid).get();
  if (!user.exists || user.data()?.accountType !== "customer") throw new HttpsError("permission-denied", "Only customer accounts use this legal acceptance flow.");
  const documents = await getCurrentCustomerLegalDocuments(db);
  const pendingDocuments = documents.filter((document) => document.requiresAcceptance && !hasAcceptedCustomerLegalDocument(user.data() ?? {}, request.auth!.uid, document));
  return {accepted: pendingDocuments.length === 0, documents, pendingDocuments};
});

export const acceptCustomerTerms = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to accept LIA legal documents.");
  await enforceCallableAbuseProtection({operation: "customer-legal-acceptance", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 8, windowSeconds: 86_400});
  if (request.data?.accepted !== true) throw new HttpsError("invalid-argument", "Affirmative acceptance is required.");
  const documents = (await getCurrentCustomerLegalDocuments(db)).filter((document) => document.requiresAcceptance);
  const userReference = db.collection("users").doc(request.auth.uid);
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userReference);
    if (!user.exists || user.data()?.accountType !== "customer") throw new HttpsError("permission-denied", "Only customer accounts can accept these documents.");
    for (const document of documents) {
      if (hasAcceptedCustomerLegalDocument(user.data() ?? {}, request.auth!.uid, document)) continue;
      const acceptance = acceptanceRecord(document, request.auth!.uid, request.auth!.token.email, "post_login");
      transaction.update(userReference, {[`legalAcceptances.${document.acceptanceField}`]: acceptance, updatedAt: FieldValue.serverTimestamp()});
      transaction.set(userReference.collection("legalAcceptanceAudit").doc(), {...acceptance, createdAt: FieldValue.serverTimestamp()});
    }
  });
  return {accepted: true, documents, pendingDocuments: []};
});
