/*
|--------------------------------------------------------------------------
| Driver Onboarding Mapper
|--------------------------------------------------------------------------
|
| Converts partial Firestore driver data into a complete, UI-safe onboarding
| draft. New drivers receive predictable empty values at every step.
|
*/

import type {
  DocumentData,
} from "firebase/firestore";

import {
  DRIVER_LEGAL_CONFIG,
} from "@/config/driverLegal";
import {
  type DriverOnboardingDraft,
  type DriverDocumentReview,
  type DriverDocumentReviewStatus,
  type DriverApplicationStatus,
  type DriverAvailabilityStatus,
  type DriverOnboardingStep,
} from "@/types/driverOnboarding";

const validSteps = new Set<DriverOnboardingStep>([
  "personal-information",
  "address-service-area",
  "vehicle-information",
  "documents",
  "agreement",
  "stripe",
]);

const validReviewStatuses = new Set<DriverDocumentReviewStatus>([
  "pending",
  "approved",
  "rejected",
  "expired",
]);

const validApplicationStatuses = new Set<DriverApplicationStatus>([
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
]);

const validAvailabilityStatuses = new Set<DriverAvailabilityStatus>([
  "offline",
  "available",
]);

function mapDocumentReview(data: DocumentData | undefined): DriverDocumentReview {
  const reviewStatus = data?.reviewStatus;

  return {
    reviewStatus: validReviewStatuses.has(reviewStatus)
      ? reviewStatus
      : "pending",
    rejectionReason: typeof data?.rejectionReason === "string"
      ? data.rejectionReason
      : null,
    reviewedAt: data?.reviewedAt ?? null,
    reviewedBy: typeof data?.reviewedBy === "string"
      ? data.reviewedBy
      : null,
  };
}

function mapAgreement(
  data: DocumentData | undefined,
  version: string,
  legacyAccepted = false
) {
  return {
    accepted: data?.accepted === true || legacyAccepted,
    version: typeof data?.version === "string" && data.version
      ? data.version
      : version,
    acceptedAt: data?.acceptedAt ?? null,
  };
}

export function mapDriverOnboardingDraft(
  driverId: string,
  data?: DocumentData
): DriverOnboardingDraft {
  const step = data?.onboardingStep;
  const applicationStatus = data?.status;
  const availabilityStatus = data?.availabilityStatus;

  return {
    driverId,
    isApproved: data?.isApproved === true,
    onboardingCompleted: data?.onboardingCompleted === true,
    onboardingStep: validSteps.has(step)
      ? step
      : "personal-information",
    status: validApplicationStatuses.has(applicationStatus)
      ? applicationStatus
      : "draft",
    availabilityStatus: validAvailabilityStatuses.has(availabilityStatus)
      ? availabilityStatus
      : "offline",
    submittedAt: data?.submittedAt ?? null,
    firstName: data?.firstName ?? "",
    middleName: data?.middleName ?? "",
    lastName: data?.lastName ?? "",
    phone: data?.phone ?? "",
    email: data?.email ?? "",
    dateOfBirth: data?.dateOfBirth ?? "",
    profilePhotoUrl: data?.profilePhotoUrl,
    address: {
      street: data?.address?.street ?? "",
      apartment: data?.address?.apartment ?? "",
      city: data?.address?.city ?? "",
      state: data?.address?.state ?? "",
      zip: data?.address?.zip ?? "",
      formattedAddress: data?.address?.formattedAddress ?? "",
      latitude: typeof data?.address?.latitude === "number"
        ? data.address.latitude
        : null,
      longitude: typeof data?.address?.longitude === "number"
        ? data.address.longitude
        : null,
    },
    serviceArea: {
      city: data?.serviceArea?.city ?? "",
      state: data?.serviceArea?.state ?? "",
      preferredRadiusMiles:
        typeof data?.serviceArea?.preferredRadiusMiles === "number"
          ? data.serviceArea.preferredRadiusMiles
          : null,
      approvedRadiusMiles:
        typeof data?.serviceArea?.approvedRadiusMiles === "number"
          ? data.serviceArea.approvedRadiusMiles
          : null,
    },
    deliveryMethod: data?.deliveryMethod ?? "",
    vehicle: {
      make: data?.vehicle?.make ?? "",
      model: data?.vehicle?.model ?? "",
      year: typeof data?.vehicle?.year === "number"
        ? data.vehicle.year
        : null,
      color: data?.vehicle?.color ?? "",
      licensePlate: data?.vehicle?.licensePlate ?? "",
      registrationState: data?.vehicle?.registrationState ?? "",
    },
    driversLicense: {
      frontDocumentUrl: data?.driversLicense?.frontDocumentUrl,
      backDocumentUrl: data?.driversLicense?.backDocumentUrl,
      submissionVersion: typeof data?.driversLicense?.submissionVersion === "number"
        ? data.driversLicense.submissionVersion
        : 0,
      issuingState: data?.driversLicense?.issuingState ?? "",
      expirationDate: data?.driversLicense?.expirationDate ?? "",
      ...mapDocumentReview(data?.driversLicense),
    },
    vehicleInsurance: {
      documentUrl: data?.vehicleInsurance?.documentUrl,
      submissionVersion: typeof data?.vehicleInsurance?.submissionVersion === "number"
        ? data.vehicleInsurance.submissionVersion
        : 0,
      provider: data?.vehicleInsurance?.provider ?? "",
      expirationDate: data?.vehicleInsurance?.expirationDate ?? "",
      ...mapDocumentReview(data?.vehicleInsurance),
    },
    vehicleRegistration: {
      documentUrl: data?.vehicleRegistration?.documentUrl,
      submissionVersion: typeof data?.vehicleRegistration?.submissionVersion === "number"
        ? data.vehicleRegistration.submissionVersion
        : 0,
      expirationDate: data?.vehicleRegistration?.expirationDate ?? "",
      ...mapDocumentReview(data?.vehicleRegistration),
    },
    agreements: {
      terms: mapAgreement(
        data?.agreements?.terms,
        DRIVER_LEGAL_CONFIG.TERMS_VERSION,
        data?.acceptedTerms === true
      ),
      privacyPolicy: mapAgreement(
        data?.agreements?.privacyPolicy,
        DRIVER_LEGAL_CONFIG.PRIVACY_POLICY_VERSION,
        data?.acceptedPrivacyPolicy === true
      ),
      driverAgreement: mapAgreement(
        data?.agreements?.driverAgreement,
        DRIVER_LEGAL_CONFIG.DRIVER_AGREEMENT_VERSION,
        data?.acceptedDriverAgreement === true
      ),
      informationCertifiedAccurate:
        data?.agreements?.informationCertifiedAccurate === true ||
        data?.informationCertifiedAccurate === true,
    },
    stripeAccountId: data?.stripeAccountId,
    stripeAccountStatus: data?.stripeConnect?.status ?? data?.stripeAccountStatus,
    stripeDetailsSubmitted: data?.stripeDetailsSubmitted,
    stripeTransfersEnabled:
      data?.stripeTransfersEnabled === true ||
      data?.stripeConnect?.transfersEnabled === true,
    stripePayoutsEnabled:
      data?.stripePayoutsEnabled === true ||
      data?.stripeConnect?.payoutsEnabled === true,
    stripeRequiresAction: data?.stripeRequiresAction,
  };
}
