/*
|--------------------------------------------------------------------------
| Store Application Policy
|--------------------------------------------------------------------------
|
| This policy controls which store-application uploads are required and
| whether a store owner can be approved for workspace access before every
| required document has been reviewed. It is stored in Firestore so Admin
| Settings, onboarding, review, and activation use the same source.
|
*/

import {getFirestore} from "firebase-admin/firestore";

export interface StoreApplicationPolicy {
  requiredDocuments: {
    ownerPhotoId: boolean;
    logo: boolean;
    banner: boolean;
    storeFront: boolean;
    storeInside: boolean;
  };
  requireStripeAccount: boolean;
  allowWorkspaceApprovalBeforeDocumentReview: boolean;
  requireApprovedDocumentsForActivation: boolean;
}

export const STORE_APPLICATION_POLICY_DOCUMENT = "storeApplication";

/*
 * These preserve LIA's existing application requirements until an active
 * administrator saves the policy for the first time. Once saved, the
 * Firestore document is the source used by every protected workflow.
 */
const DEFAULT_STORE_APPLICATION_POLICY: StoreApplicationPolicy = {
  requiredDocuments: {
    ownerPhotoId: true,
    logo: true,
    banner: false,
    storeFront: true,
    storeInside: true,
  },
  requireStripeAccount: true,
  allowWorkspaceApprovalBeforeDocumentReview: true,
  requireApprovedDocumentsForActivation: true,
};

function booleanValue(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseStoreApplicationPolicy(
  value: unknown,
): StoreApplicationPolicy {
  const data = record(value);
  const documents = record(data.requiredDocuments);

  return {
    requiredDocuments: {
      ownerPhotoId: booleanValue(
        documents.ownerPhotoId,
        DEFAULT_STORE_APPLICATION_POLICY.requiredDocuments.ownerPhotoId,
      ),
      logo: booleanValue(
        documents.logo,
        DEFAULT_STORE_APPLICATION_POLICY.requiredDocuments.logo,
      ),
      banner: booleanValue(
        documents.banner,
        DEFAULT_STORE_APPLICATION_POLICY.requiredDocuments.banner,
      ),
      storeFront: booleanValue(
        documents.storeFront,
        DEFAULT_STORE_APPLICATION_POLICY.requiredDocuments.storeFront,
      ),
      storeInside: booleanValue(
        documents.storeInside,
        DEFAULT_STORE_APPLICATION_POLICY.requiredDocuments.storeInside,
      ),
    },
    requireStripeAccount: booleanValue(
      data.requireStripeAccount,
      DEFAULT_STORE_APPLICATION_POLICY.requireStripeAccount,
    ),
    allowWorkspaceApprovalBeforeDocumentReview: booleanValue(
      data.allowWorkspaceApprovalBeforeDocumentReview,
      DEFAULT_STORE_APPLICATION_POLICY.allowWorkspaceApprovalBeforeDocumentReview,
    ),
    requireApprovedDocumentsForActivation: booleanValue(
      data.requireApprovedDocumentsForActivation,
      DEFAULT_STORE_APPLICATION_POLICY.requireApprovedDocumentsForActivation,
    ),
  };
}

export async function getStoreApplicationPolicy(): Promise<
  StoreApplicationPolicy
> {
  const snapshot = await getFirestore("default")
    .collection("settings")
    .doc(STORE_APPLICATION_POLICY_DOCUMENT)
    .get();

  return parseStoreApplicationPolicy(snapshot.data());
}
