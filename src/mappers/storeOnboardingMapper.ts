/*
  Store Onboarding Mapper.

  Converts a partial Firestore store document into a complete draft the
  onboarding UI can safely render, including defaults for new owners.
*/
import type { DocumentData } from "firebase/firestore";
import {
  DEFAULT_STORE_SCHEDULE,
  type StoreApplicationStatus,
  type StoreDocumentReview,
  type StoreDocumentReviewStatus,
  type StoreOnboardingDraft,
  type StoreOnboardingStep,
} from "@/types/storeOnboarding";

/* Only persisted onboarding steps recognized by the current flow. */
const validSteps = new Set<StoreOnboardingStep>([
  "owner", "store-information", "business-information", "schedule", "stripe",
]);

const validReviewStatuses = new Set<StoreDocumentReviewStatus>([
  "pending", "approved", "rejected", "expired",
]);

const validApplicationStatuses = new Set<StoreApplicationStatus>([
  "draft", "pending_review", "approved", "rejected", "suspended",
]);

function mapDocumentReview(data: DocumentData | undefined): StoreDocumentReview {
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

export function mapStoreOnboardingDraft(
  storeId: string | null,
  ownerId: string,
  data?: DocumentData
): StoreOnboardingDraft {
  const onboardingStep = data?.onboardingStep;
  const applicationStatus = data?.status;

  return {
    storeId,
    ownerId,
    isApproved: data?.isApproved === true,
    isActive: data?.isActive === true,
    onboardingCompleted: data?.onboardingCompleted === true,
    onboardingStep: validSteps.has(onboardingStep) ? onboardingStep : "owner",
    status: validApplicationStatuses.has(applicationStatus)
      ? applicationStatus
      : data?.isApproved === true
        ? "approved"
        : "draft",
    submittedAt: data?.submittedAt ?? null,
    owner: {
      firstName: data?.owner?.firstName ?? "", lastName: data?.owner?.lastName ?? "",
      email: data?.owner?.email ?? "", phone: data?.owner?.phone ?? "",
      address: data?.owner?.address ?? "", city: data?.owner?.city ?? "",
      state: data?.owner?.state ?? "", zip: data?.owner?.zip ?? "",
      formattedAddress: data?.owner?.formattedAddress, photoIdUrl: data?.owner?.photoIdUrl,
      photoIdReview: mapDocumentReview(data?.owner?.photoIdReview),
      photoIdSubmissionVersion:
        typeof data?.owner?.photoIdSubmissionVersion === "number"
          ? data.owner.photoIdSubmissionVersion
          : 0,
    },
    name: data?.name ?? "", email: data?.email ?? "", phone: data?.phone ?? "",
    description: data?.description ?? "", address: data?.address ?? "", city: data?.city ?? "",
    state: data?.state ?? "", zip: data?.zip ?? "",
    formattedAddress: data?.formattedAddress ?? "", logoUrl: data?.logoUrl,
    logoReview: mapDocumentReview(data?.logoReview),
    logoSubmissionVersion: typeof data?.logoSubmissionVersion === "number"
      ? data.logoSubmissionVersion
      : 0,
    bannerUrl: data?.bannerUrl,
    bannerReview: mapDocumentReview(data?.bannerReview),
    bannerSubmissionVersion: typeof data?.bannerSubmissionVersion === "number"
      ? data.bannerSubmissionVersion
      : 0,
    storeFrontUrl: data?.storeFrontUrl,
    storeFrontReview: mapDocumentReview(data?.storeFrontReview),
    storeFrontSubmissionVersion: typeof data?.storeFrontSubmissionVersion === "number"
      ? data.storeFrontSubmissionVersion
      : 0,
    storeInsideUrl: data?.storeInsideUrl,
    storeInsideReview: mapDocumentReview(data?.storeInsideReview),
    storeInsideSubmissionVersion: typeof data?.storeInsideSubmissionVersion === "number"
      ? data.storeInsideSubmissionVersion
      : 0,
    businessType: data?.businessType ?? "",
    registeredName: data?.registeredName ?? "", ein: data?.ein ?? "",
    businessStructure: data?.businessStructure ?? "", schedule: Array.isArray(data?.schedule) ? data.schedule : DEFAULT_STORE_SCHEDULE,
    stripeAccountId: data?.stripeAccountId, stripeAccountStatus: data?.stripeAccountStatus,
    stripeDetailsSubmitted: data?.stripeDetailsSubmitted,
    stripeTransfersEnabled: data?.stripeTransfersEnabled === true,
    stripePayoutsEnabled: data?.stripePayoutsEnabled === true,
    stripeRequiresAction: data?.stripeRequiresAction,
  };
}
