/*
|--------------------------------------------------------------------------
| Driver Application Policy
|--------------------------------------------------------------------------
|
| Driver eligibility, document requirements, and approval gates are owned by
| the Admin-controlled policy below. Onboarding, workspace edits, and Admin
| review all read this same trusted source.
|
*/

import {getFirestore} from "firebase-admin/firestore";

export interface DriverApplicationPolicy {
  minimumAge: number;
  maximumPreferredRadiusMiles: number;
  requiredDocuments: {
    driversLicenseFront: boolean;
    driversLicenseBack: boolean;
    vehicleInsurance: boolean;
    vehicleRegistration: boolean;
  };
  requireStripeAccount: boolean;
  requireApprovedDocumentsForApproval: boolean;
}

export const DRIVER_APPLICATION_POLICY_DOCUMENT = "driverApplication";

/* Preserves the current eligibility rules until Admin Settings saves a policy. */
const DEFAULT_DRIVER_APPLICATION_POLICY: DriverApplicationPolicy = {
  minimumAge: 18,
  maximumPreferredRadiusMiles: 50,
  requiredDocuments: {
    driversLicenseFront: true,
    driversLicenseBack: true,
    vehicleInsurance: true,
    vehicleRegistration: true,
  },
  requireStripeAccount: true,
  requireApprovedDocumentsForApproval: true,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= minimum && value <= maximum
    ? value
    : fallback;
}

export function parseDriverApplicationPolicy(
  value: unknown,
): DriverApplicationPolicy {
  const data = record(value);
  const documents = record(data.requiredDocuments);

  return {
    minimumAge: numberValue(
      data.minimumAge,
      DEFAULT_DRIVER_APPLICATION_POLICY.minimumAge,
      18,
      100,
    ),
    maximumPreferredRadiusMiles: numberValue(
      data.maximumPreferredRadiusMiles,
      DEFAULT_DRIVER_APPLICATION_POLICY.maximumPreferredRadiusMiles,
      1,
      100,
    ),
    requiredDocuments: {
      driversLicenseFront: booleanValue(
        documents.driversLicenseFront,
        DEFAULT_DRIVER_APPLICATION_POLICY.requiredDocuments.driversLicenseFront,
      ),
      driversLicenseBack: booleanValue(
        documents.driversLicenseBack,
        DEFAULT_DRIVER_APPLICATION_POLICY.requiredDocuments.driversLicenseBack,
      ),
      vehicleInsurance: booleanValue(
        documents.vehicleInsurance,
        DEFAULT_DRIVER_APPLICATION_POLICY.requiredDocuments.vehicleInsurance,
      ),
      vehicleRegistration: booleanValue(
        documents.vehicleRegistration,
        DEFAULT_DRIVER_APPLICATION_POLICY.requiredDocuments.vehicleRegistration,
      ),
    },
    requireStripeAccount: booleanValue(
      data.requireStripeAccount,
      DEFAULT_DRIVER_APPLICATION_POLICY.requireStripeAccount,
    ),
    requireApprovedDocumentsForApproval: booleanValue(
      data.requireApprovedDocumentsForApproval,
      DEFAULT_DRIVER_APPLICATION_POLICY.requireApprovedDocumentsForApproval,
    ),
  };
}

export async function getDriverApplicationPolicy(): Promise<
  DriverApplicationPolicy
> {
  const snapshot = await getFirestore("default")
    .collection("settings")
    .doc(DRIVER_APPLICATION_POLICY_DOCUMENT)
    .get();

  return parseDriverApplicationPolicy(snapshot.data());
}
