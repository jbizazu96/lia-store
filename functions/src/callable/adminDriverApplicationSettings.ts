/*
|--------------------------------------------------------------------------
| Admin Driver Application Settings
|--------------------------------------------------------------------------
|
| Driver policy changes are callable-only, admin-authorized, and audited.
|
*/

import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireActiveAdmin} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {
  DRIVER_APPLICATION_POLICY_DOCUMENT,
  getDriverApplicationPolicy,
  parseDriverApplicationPolicy,
} from "../admin/driverApplicationPolicy";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isValidPolicy(value: Record<string, unknown>): boolean {
  const documents = record(value.requiredDocuments);
  return typeof value.minimumAge === "number" &&
    Number.isInteger(value.minimumAge) && value.minimumAge >= 18 &&
    value.minimumAge <= 100 &&
    typeof value.maximumPreferredRadiusMiles === "number" &&
    Number.isInteger(value.maximumPreferredRadiusMiles) &&
    value.maximumPreferredRadiusMiles >= 1 &&
    value.maximumPreferredRadiusMiles <= 100 && [
      documents.driversLicenseFront,
      documents.driversLicenseBack,
      documents.vehicleInsurance,
      documents.vehicleRegistration,
      value.requireStripeAccount,
      value.requireApprovedDocumentsForApproval,
    ].every((field) => typeof field === "boolean");
}

export const getAdminDriverApplicationPolicy = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireActiveAdmin(request);
    return {policy: await getDriverApplicationPolicy()};
  },
);

export const saveAdminDriverApplicationPolicy = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(record(request.data).policy);
    if (!isValidPolicy(input)) {
      throw new HttpsError(
        "invalid-argument",
        "Provide valid driver application policy values.",
      );
    }

    const policy = parseDriverApplicationPolicy(input);
    await db.collection("settings").doc(DRIVER_APPLICATION_POLICY_DOCUMENT)
      .set({
        ...policy,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
      }, {merge: true});

    await writeAdminAuditLog(administrator, {
      action: "driver_application_policy_updated",
      targetType: "settings",
      targetId: DRIVER_APPLICATION_POLICY_DOCUMENT,
      details: {
        minimumAge: policy.minimumAge,
        maximumPreferredRadiusMiles: policy.maximumPreferredRadiusMiles,
        driversLicenseFrontRequired: policy.requiredDocuments.driversLicenseFront,
        driversLicenseBackRequired: policy.requiredDocuments.driversLicenseBack,
        vehicleInsuranceRequired: policy.requiredDocuments.vehicleInsurance,
        vehicleRegistrationRequired: policy.requiredDocuments.vehicleRegistration,
        requireStripeAccount: policy.requireStripeAccount,
        requireApprovedDocumentsForApproval:
          policy.requireApprovedDocumentsForApproval,
      },
    });

    return {success: true};
  },
);
