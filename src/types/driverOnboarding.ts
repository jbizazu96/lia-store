/*
|--------------------------------------------------------------------------
| Driver Onboarding Types
|--------------------------------------------------------------------------
|
| The driver application is saved as one private document at
| drivers/{driverId}. These types are shared by the onboarding UI, mapper,
| hook, and persistence service.
|
*/

import type {
  StripeOnboardingStatus,
} from "./stripeConnect";
import type {
  Timestamp,
} from "firebase/firestore";

export type DriverOnboardingStep =
  | "personal-information"
  | "address-service-area"
  | "vehicle-information"
  | "documents"
  | "agreement"
  | "stripe";

export type DeliveryMethod =
  | "car"
  | "motorcycle"
  | "scooter";

export type DriverApplicationStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export type DriverAvailabilityStatus =
  | "offline"
  | "available";

/* Administrative verification is separate from upload processing readiness. */
export type DriverDocumentReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface DriverDocumentReview {
  reviewStatus: DriverDocumentReviewStatus;
  rejectionReason: string | null;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
}

export interface DriverLegalAcceptance {
  accepted: boolean;
  version: string;
  acceptedAt: Timestamp | null;
}

export interface DriverAgreements {
  terms: DriverLegalAcceptance;
  privacyPolicy: DriverLegalAcceptance;
  driverAgreement: DriverLegalAcceptance;
  informationCertifiedAccurate: boolean;
}

export interface DriverAddress {
  street: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DriverVehicle {
  make: string;
  model: string;
  year: number | null;
  color: string;
  licensePlate: string;
  registrationState: string;
}

export interface DriverLicenseDocument extends DriverDocumentReview {
  frontDocumentUrl?: string;
  backDocumentUrl?: string;
  submissionVersion: number;
  issuingState: string;
  expirationDate: string;
}

export interface DriverInsuranceDocument extends DriverDocumentReview {
  documentUrl?: string;
  submissionVersion: number;
  provider: string;
  expirationDate: string;
}

export interface DriverRegistrationDocument extends DriverDocumentReview {
  documentUrl?: string;
  submissionVersion: number;
  expirationDate: string;
}

/* Application requirements are read from the Admin-controlled policy. */
export interface DriverOnboardingApplicationPolicy {
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

export interface DriverOnboardingDraft {
  driverId: string;
  isApproved: boolean;
  onboardingCompleted: boolean;
  onboardingStep: DriverOnboardingStep;
  status: DriverApplicationStatus;
  availabilityStatus: DriverAvailabilityStatus;
  submittedAt: Timestamp | null;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  profilePhotoUrl?: string;
  address: DriverAddress;
  serviceArea: {
    city: string;
    state: string;
    /* Driver preference; it is not an approved operational delivery limit. */
    preferredRadiusMiles: number | null;
    /* Set only by an administrator after reviewing the application. */
    approvedRadiusMiles: number | null;
  };
  deliveryMethod: DeliveryMethod | "";
  vehicle: DriverVehicle;
  driversLicense: DriverLicenseDocument;
  vehicleInsurance: DriverInsuranceDocument;
  vehicleRegistration: DriverRegistrationDocument;
  agreements: DriverAgreements;
  stripeAccountId?: string;
  stripeAccountStatus?: StripeOnboardingStatus;
  stripeDetailsSubmitted?: boolean;
  stripeTransfersEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeRequiresAction?: boolean;
  applicationPolicy?: DriverOnboardingApplicationPolicy;
}

export const DRIVER_ONBOARDING_STEPS: DriverOnboardingStep[] = [
  "personal-information",
  "address-service-area",
  "vehicle-information",
  "documents",
  "agreement",
  "stripe",
];
