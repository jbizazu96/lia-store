/*
|--------------------------------------------------------------------------
| Admin Store Application Settings
|--------------------------------------------------------------------------
|
| Only active administrators can view or change the application policy.
| Mutations are audited and the browser never writes settings directly.
|
*/

import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  getStoreApplicationPolicy,
  parseStoreApplicationPolicy,
  STORE_APPLICATION_POLICY_DOCUMENT,
} from "../admin/storeApplicationPolicy";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasEveryPolicyField(value: Record<string, unknown>): boolean {
  const documents = record(value.requiredDocuments);
  return [
    documents.ownerPhotoId,
    documents.logo,
    documents.banner,
    documents.storeFront,
    documents.storeInside,
    value.requireStripeAccount,
    value.allowWorkspaceApprovalBeforeDocumentReview,
    value.requireApprovedDocumentsForActivation,
  ].every((field) => typeof field === "boolean");
}

export const getAdminStoreApplicationPolicy = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "settings");
    return {policy: await getStoreApplicationPolicy()};
  },
);

export const saveAdminStoreApplicationPolicy = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "settings", "write");
    const input = record(request.data).policy;
    const policyInput = record(input);

    if (!hasEveryPolicyField(policyInput)) {
      throw new HttpsError(
        "invalid-argument",
        "Provide every store application policy value.",
      );
    }

    const policy = parseStoreApplicationPolicy(policyInput);
    await db.collection("settings").doc(STORE_APPLICATION_POLICY_DOCUMENT)
      .set({
        ...policy,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
      }, {merge: true});

    await writeAdminAuditLog(administrator, {
      action: "store_application_policy_updated",
      targetType: "settings",
      targetId: STORE_APPLICATION_POLICY_DOCUMENT,
      details: {
        ownerPhotoIdRequired: policy.requiredDocuments.ownerPhotoId,
        logoRequired: policy.requiredDocuments.logo,
        bannerRequired: policy.requiredDocuments.banner,
        storeFrontRequired: policy.requiredDocuments.storeFront,
        storeInsideRequired: policy.requiredDocuments.storeInside,
        requireStripeAccount: policy.requireStripeAccount,
        allowWorkspaceApprovalBeforeDocumentReview:
          policy.allowWorkspaceApprovalBeforeDocumentReview,
        requireApprovedDocumentsForActivation:
          policy.requireApprovedDocumentsForActivation,
      },
    });

    return {success: true};
  },
);
