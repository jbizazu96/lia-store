/*
  Store Onboarding Types.

  Defines the saved draft shared by the onboarding pages, service, and
  mapper so each step has one consistent contract.
*/
import type {
  Timestamp,
} from "firebase/firestore";
import type { StoreScheduleDay } from "./store";
import type { StripeOnboardingStatus } from "./stripeConnect";

/* Ordered route identifiers for the store-owner onboarding flow. */
export type StoreOnboardingStep =
  | "owner"
  | "store-information"
  | "business-information"
  | "schedule"
  | "agreement"
  | "stripe";

export const STORE_MERCHANT_AGREEMENT_VERSION = "lia-merchant-agreement-v1";

export interface StoreMerchantAgreementAcceptance {
  accepted: boolean;
  version: string;
  representativeName: string;
  acceptedByUid: string;
  acceptedByEmail: string | null;
  acceptedAt: string | null;
  manualSignatureRequired: boolean;
}

/* Store application review is separate from marketplace activation. */
export type StoreApplicationStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

/* Administrative review is separate from successful image processing. */
export type StoreDocumentReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface StoreDocumentReview {
  reviewStatus: StoreDocumentReviewStatus;
  rejectionReason: string | null;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
}

/* Application requirements are read from the Admin-controlled policy. */
export interface StoreOnboardingApplicationPolicy {
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

/* Private owner information saved inside the pending store document. */
export interface StoreOwnerOnboardingInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  formattedAddress?: string;
  photoIdUrl?: string;
  photoIdReview?: StoreDocumentReview;
  photoIdSubmissionVersion?: number;
}

/* Complete UI-safe representation of a store's onboarding progress. */
export interface StoreOnboardingDraft {
  storeId: string | null;
  ownerId: string;
  isApproved: boolean;
  isActive: boolean;
  onboardingCompleted: boolean;
  onboardingStep: StoreOnboardingStep;
  status: StoreApplicationStatus;
  submittedAt: Timestamp | null;
  owner: StoreOwnerOnboardingInfo;
  name: string;
  email: string;
  phone: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  formattedAddress: string;
  logoUrl?: string;
  logoReview: StoreDocumentReview;
  logoSubmissionVersion: number;
  bannerUrl?: string;
  bannerReview: StoreDocumentReview;
  bannerSubmissionVersion: number;
  storeFrontUrl?: string;
  storeFrontReview: StoreDocumentReview;
  storeFrontSubmissionVersion: number;
  storeInsideUrl?: string;
  storeInsideReview: StoreDocumentReview;
  storeInsideSubmissionVersion: number;
  businessType: string;
  registeredName: string;
  ein: string;
  businessStructure: string;
  schedule: StoreScheduleDay[];
  merchantAgreementAcceptance?: StoreMerchantAgreementAcceptance;
  stripeAccountId?: string;
  stripeAccountStatus?: StripeOnboardingStatus;
  stripeDetailsSubmitted?: boolean;
  stripeTransfersEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeRequiresAction?: boolean;
  applicationPolicy?: StoreOnboardingApplicationPolicy;
}

/* Canonical order used by navigation and the progress indicator. */
export const ONBOARDING_STEPS: StoreOnboardingStep[] = [
  "owner",
  "store-information",
  "business-information",
  "schedule",
  "agreement",
  "stripe",
];

/* Initial operating hours presented until the owner customizes them. */
export const DEFAULT_STORE_SCHEDULE: StoreScheduleDay[] = [
  { day: "Monday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Tuesday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Wednesday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Thursday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Friday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Saturday", open: "10:00", close: "16:00", isClosed: false },
  { day: "Sunday", open: "00:00", close: "00:00", isClosed: true },
];
