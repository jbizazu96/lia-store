/*
|--------------------------------------------------------------------------
| Admin Workspace Callables
|--------------------------------------------------------------------------
|
| The Admin UI receives small, operational summaries only. Private store,
| driver, customer, Stripe, and document records remain behind server-side
| functions as the admin workspace expands.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";
import {
  requireActiveAdmin,
  requireAdminPermission,
} from "../admin/adminAuthorizationService";
import {
  getStoreApplicationPolicy,
  type StoreApplicationPolicy,
} from "../admin/storeApplicationPolicy";
import {
  getDriverApplicationPolicy,
  type DriverApplicationPolicy,
} from "../admin/driverApplicationPolicy";
import {isStoreReadyForActivation} from "../services/store/storeApprovalPolicy";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

async function countCollection(
  collection: string,
  field: string,
  value: string
): Promise<number> {
  const aggregate = await db
    .collection(collection)
    .where(field, "==", value)
    .count()
    .get();

  return aggregate.data().count;
}

async function countAllDocuments(
  collection: string
): Promise<number> {
  const aggregate = await db
    .collection(collection)
    .count()
    .get();

  return aggregate.data().count;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return typeof value === "string" ? value : null;
}

type ReviewStatus = "pending" | "approved" | "rejected" | "expired";

function review(value: unknown) {
  const data = record(value);
  const status = text(data.reviewStatus);
  return {
    reviewStatus: (status === "approved" || status === "rejected" || status === "expired" || status === "pending"
      ? status
      : "pending") as ReviewStatus,
    rejectionReason: text(data.rejectionReason) || null,
    reviewedAt: timestamp(data.reviewedAt),
    reviewedBy: text(data.reviewedBy) || null,
  };
}

function applicationStatus(value: unknown): "draft" | "pending_review" | "approved" | "rejected" | "suspended" {
  const status = text(value);
  return status === "pending_review" || status === "approved" || status === "rejected" || status === "suspended"
    ? status
    : "draft";
}

const storeMerchantAgreementVersion = "lia-merchant-agreement-v1";

function hasCurrentStoreMerchantAgreement(data: Record<string, unknown>): boolean {
  const acceptance = record(data.merchantAgreementAcceptance);
  return acceptance.accepted === true &&
    text(acceptance.version) === storeMerchantAgreementVersion &&
    text(acceptance.acceptedByUid) === text(data.ownerId);
}

function reviewFieldsForStore(
  data: Record<string, unknown>,
  policy: StoreApplicationPolicy,
) {
  const owner = record(data.owner);
  return [
    {key: "owner-photo-id", label: "Owner photo ID", required: policy.requiredDocuments.ownerPhotoId, url: text(owner.photoIdUrl) || null, review: review(owner.photoIdReview)},
    {key: "logo", label: "Store logo", required: policy.requiredDocuments.logo, url: text(data.logoUrl) || null, review: review(data.logoReview)},
    {key: "banner", label: "Store banner", required: policy.requiredDocuments.banner, url: text(data.bannerUrl) || null, review: review(data.bannerReview)},
    {key: "store-front", label: "Store front", required: policy.requiredDocuments.storeFront, url: text(data.storeFrontUrl) || null, review: review(data.storeFrontReview)},
    {key: "store-inside", label: "Store inside", required: policy.requiredDocuments.storeInside, url: text(data.storeInsideUrl) || null, review: review(data.storeInsideReview)},
  ];
}

function reviewFieldsForDriver(
  data: Record<string, unknown>,
  policy: DriverApplicationPolicy,
) {
  const license = record(data.driversLicense);
  const insurance = record(data.vehicleInsurance);
  const registration = record(data.vehicleRegistration);
  return [
    {key: "drivers-license", label: "Driver license (front and back)", required: policy.requiredDocuments.driversLicenseFront || policy.requiredDocuments.driversLicenseBack, urls: [text(license.frontDocumentUrl), text(license.backDocumentUrl)].filter(Boolean), expirationDate: text(license.expirationDate) || null, review: review(license)},
    {key: "vehicle-insurance", label: "Vehicle insurance", required: policy.requiredDocuments.vehicleInsurance, urls: [text(insurance.documentUrl)].filter(Boolean), expirationDate: text(insurance.expirationDate) || null, review: review(insurance)},
    {key: "vehicle-registration", label: "Vehicle registration", required: policy.requiredDocuments.vehicleRegistration, urls: [text(registration.documentUrl)].filter(Boolean), expirationDate: text(registration.expirationDate) || null, review: review(registration)},
  ];
}

function allRequiredStoreDocumentsApproved(
  data: Record<string, unknown>,
  policy: StoreApplicationPolicy,
): boolean {
  return reviewFieldsForStore(data, policy)
    .filter((item) => item.required)
    .every((item) => Boolean(item.url) && item.review.reviewStatus === "approved");
}

function allRequiredDriverDocumentsApproved(
  data: Record<string, unknown>,
  policy: DriverApplicationPolicy,
): boolean {
  const license = record(data.driversLicense);
  const hasRequiredLicenseFiles =
    (!policy.requiredDocuments.driversLicenseFront ||
      Boolean(text(license.frontDocumentUrl))) &&
    (!policy.requiredDocuments.driversLicenseBack ||
      Boolean(text(license.backDocumentUrl)));

  return hasRequiredLicenseFiles && reviewFieldsForDriver(data, policy)
    .filter((item) => item.required)
    .every((item) => item.urls.length > 0 && item.review.reviewStatus === "approved");
}

/*
 * Tabs reflect effective operational review state, rather than trusting a
 * stale lifecycle status alone. This keeps an application with an unreviewed
 * document in Pending review even if a field was manually edited in Console.
 */
function storeReviewStatus(
  data: Record<string, unknown>,
  policy: StoreApplicationPolicy,
) {
  const saved = applicationStatus(data.status);
  if (saved === "rejected" || saved === "suspended") return saved;
  return allRequiredStoreDocumentsApproved(data, policy)
    ? "approved"
    : "pending_review";
}

function driverReviewStatus(
  data: Record<string, unknown>,
  policy: DriverApplicationPolicy,
) {
  const saved = applicationStatus(data.status);
  if (saved === "rejected" || saved === "suspended") return saved;
  return data.isApproved === true && allRequiredDriverDocumentsApproved(data, policy)
    ? "approved"
    : "pending_review";
}

function storeListItem(
  document: FirebaseFirestore.QueryDocumentSnapshot,
  policy: StoreApplicationPolicy,
) {
  const data = document.data();
  const owner = record(data.owner);
  return {
    id: document.id,
    name: text(data.name) || "Unnamed store",
    ownerName: [text(owner.firstName), text(owner.lastName)].filter(Boolean).join(" ") || "Owner information incomplete",
    city: text(data.city),
    state: text(data.state),
    status: storeReviewStatus(data, policy),
    submittedAt: timestamp(data.submittedAt),
  };
}

function driverListItem(
  document: FirebaseFirestore.QueryDocumentSnapshot,
  policy: DriverApplicationPolicy,
) {
  const data = document.data();
  return {
    id: document.id,
    name: [text(data.firstName), text(data.lastName)].filter(Boolean).join(" ") || "Driver information incomplete",
    city: text(record(data.address).city),
    state: text(record(data.address).state),
    status: driverReviewStatus(data, policy),
    submittedAt: timestamp(data.submittedAt),
  };
}

function sortedNewest<T extends {submittedAt: string | null}>(items: T[]): T[] {
  return items.sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""));
}

export const getAdminWorkspaceEntry = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);

    await db.collection("admins").doc(administrator.uid).set({
      lastWorkspaceAccessAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      administrator,
    };
  }
);

export const getAdminWorkspaceOverview = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "overview");

    const [
      pendingStoreApplications,
      pendingDriverApplications,
      pendingDeletionRequests,
      failedTransfers,
      pendingRefunds,
      totalStores,
      totalDrivers,
      totalCustomers,
      totalOrders,
    ] = await Promise.all([
      countCollection("stores", "status", "pending_review"),
      countCollection("drivers", "status", "pending_review"),
      countCollection("accountDeletionRequests", "status", "pending_review"),
      countCollection("paymentTransfers", "status", "failed"),
      /* Refunds are queued for Stripe processing with the eligible status. */
      countCollection("paymentRefunds", "status", "eligible"),
      countAllDocuments("stores"),
      countAllDocuments("drivers"),
      countCollection("users", "accountType", "customer"),
      countAllDocuments("orders"),
    ]);

    return {
      reviewQueue: {
        pendingStoreApplications,
        pendingDriverApplications,
        pendingDeletionRequests,
        failedTransfers,
        pendingRefunds,
        totalStores,
        totalDrivers,
        totalCustomers,
        totalOrders,
      },
    };
  }
);

/*
 * Review queues intentionally return only non-sensitive list fields. Full
 * applications, private document images, and decisions are retrieved through
 * separate authenticated calls below.
 */
export const getAdminStoreApplications = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "stores");
    const policy = await getStoreApplicationPolicy();
    const status = text(record(request.data).status) || "pending_review";

    if (!["draft", "pending_review", "approved", "rejected", "suspended"].includes(status)) {
      throw new HttpsError("invalid-argument", "A valid application status is required.");
    }

    const snapshot = await db.collection("stores")
      .limit(100)
      .get();

    const allApplications = snapshot.docs.map((document) =>
      storeListItem(document, policy),
    );
    return {
      applications: sortedNewest(allApplications.filter((item) => item.status === status)),
      counts: {
        pending_review: allApplications.filter((item) => item.status === "pending_review").length,
        approved: allApplications.filter((item) => item.status === "approved").length,
        rejected: allApplications.filter((item) => item.status === "rejected").length,
      },
    };
  }
);

export const getAdminDriverApplications = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "drivers");
    const policy = await getDriverApplicationPolicy();
    const status = text(record(request.data).status) || "pending_review";

    if (!["draft", "pending_review", "approved", "rejected", "suspended"].includes(status)) {
      throw new HttpsError("invalid-argument", "A valid application status is required.");
    }

    const snapshot = await db.collection("drivers")
      .limit(100)
      .get();

    const allApplications = snapshot.docs.map((document) =>
      driverListItem(document, policy),
    );
    return {
      applications: sortedNewest(allApplications.filter((item) => item.status === status)),
      counts: {
        pending_review: allApplications.filter((item) => item.status === "pending_review").length,
        approved: allApplications.filter((item) => item.status === "approved").length,
        rejected: allApplications.filter((item) => item.status === "rejected").length,
      },
    };
  }
);

export const getAdminStoreApplication = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "stores");
    const storeId = text(record(request.data).storeId);
    if (!storeId || storeId.includes("/")) throw new HttpsError("invalid-argument", "A valid store is required.");

    const store = await db.collection("stores").doc(storeId).get();
    if (!store.exists) throw new HttpsError("not-found", "Store application not found.");
    const data = store.data() ?? {};
    const policy = await getStoreApplicationPolicy();
    const owner = record(data.owner);
    const agreement = record(data.merchantAgreementAcceptance);

    return {
      id: store.id,
      status: storeReviewStatus(data, policy),
      submittedAt: timestamp(data.submittedAt),
      isApproved: data.isApproved === true,
      isActive: data.isActive === true,
      zoneAssignment: {
        homeZoneId: text(data.homeZoneId) || null,
        serviceZoneIds: Array.isArray(data.serviceZoneIds) ? data.serviceZoneIds.filter((value): value is string => typeof value === "string") : [],
      },
      owner: {
        name: [text(owner.firstName), text(owner.lastName)].filter(Boolean).join(" "),
        email: text(owner.email), phone: text(owner.phone),
        address: [text(owner.formattedAddress) || text(owner.address), text(owner.city), text(owner.state), text(owner.zip)].filter(Boolean).join(", "),
      },
      store: {
        name: text(data.name), email: text(data.email), phone: text(data.phone), description: text(data.description),
        address: text(data.formattedAddress) || [text(data.address), text(data.city), text(data.state), text(data.zip)].filter(Boolean).join(", "),
        businessType: text(data.businessType), registeredName: text(data.registeredName), ein: text(data.ein), businessStructure: text(data.businessStructure),
        schedule: Array.isArray(data.schedule) ? data.schedule : [],
      },
      merchantAgreement: {
        accepted: hasCurrentStoreMerchantAgreement(data),
        version: text(agreement.version) || null,
        representativeName: text(agreement.representativeName) || null,
        acceptedByEmail: text(agreement.acceptedByEmail) || null,
        acceptedAt: timestamp(agreement.acceptedAt),
        manualSignatureRequired: agreement.manualSignatureRequired === true,
      },
      stripe: {accountStatus: text(data.stripeAccountStatus) || "not_started", detailsSubmitted: data.stripeDetailsSubmitted === true, transfersEnabled: data.stripeTransfersEnabled === true, payoutsEnabled: data.stripePayoutsEnabled === true, requiresAction: data.stripeRequiresAction === true},
      documents: reviewFieldsForStore(data, policy),
      applicationReview: record(data.applicationReview),
    };
  }
);

export const getAdminDriverApplication = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "drivers");
    const driverId = text(record(request.data).driverId);
    if (!driverId || driverId.includes("/")) throw new HttpsError("invalid-argument", "A valid driver is required.");

    const driver = await db.collection("drivers").doc(driverId).get();
    if (!driver.exists) throw new HttpsError("not-found", "Driver application not found.");
    const policy = await getDriverApplicationPolicy();
    const data = driver.data() ?? {};
    const address = record(data.address);
    const area = record(data.serviceArea);
    const vehicle = record(data.vehicle);

    return {
      id: driver.id,
      status: driverReviewStatus(data, policy),
      submittedAt: timestamp(data.submittedAt),
      isApproved: data.isApproved === true,
      zoneAssignment: {
        homeZoneId: text(data.homeZoneId) || null,
        serviceZoneIds: Array.isArray(data.serviceZoneIds) ? data.serviceZoneIds.filter((value): value is string => typeof value === "string") : [],
      },
      profile: {name: [text(data.firstName), text(data.middleName), text(data.lastName)].filter(Boolean).join(" "), email: text(data.email), phone: text(data.phone), dateOfBirth: text(data.dateOfBirth), address: [text(address.formattedAddress) || text(address.street), text(address.city), text(address.state), text(address.zip)].filter(Boolean).join(", ")},
      serviceArea: {city: text(area.city), state: text(area.state), preferredRadiusMiles: typeof area.preferredRadiusMiles === "number" ? area.preferredRadiusMiles : null, approvedRadiusMiles: typeof area.approvedRadiusMiles === "number" ? area.approvedRadiusMiles : null},
      vehicle: {deliveryMethod: text(data.deliveryMethod), make: text(vehicle.make), model: text(vehicle.model), year: typeof vehicle.year === "number" ? vehicle.year : null, color: text(vehicle.color), licensePlate: text(vehicle.licensePlate), registrationState: text(vehicle.registrationState)},
      stripe: {accountStatus: text(data.stripeAccountStatus) || "not_started", detailsSubmitted: data.stripeDetailsSubmitted === true, transfersEnabled: data.stripeTransfersEnabled === true, payoutsEnabled: data.stripePayoutsEnabled === true, requiresAction: data.stripeRequiresAction === true},
      documents: reviewFieldsForDriver(data, policy),
      applicationReview: record(data.applicationReview),
    };
  }
);

export const decideAdminApplicationDocument = onCall(
  {region: "us-central1"},
  async (request) => {
    const input = record(request.data);
    const type = text(input.type);
    const administrator = await requireAdminPermission(request, type === "store" ? "stores" : "drivers", "write");
    const applicationId = text(input.applicationId);
    const documentKey = text(input.documentKey);
    const outcome = text(input.decision);
    const reason = text(input.reason);

    if (!applicationId || applicationId.includes("/") || !["store", "driver"].includes(type) || !["approved", "rejected"].includes(outcome)) {
      throw new HttpsError("invalid-argument", "A valid document decision is required.");
    }
    if (outcome === "rejected" && !reason) throw new HttpsError("invalid-argument", "Give a reason when rejecting a document.");

    const collection = type === "store" ? "stores" : "drivers";
    const application = await db.collection(collection).doc(applicationId).get();
    if (!application.exists) throw new HttpsError("not-found", "Application not found.");
    const data = application.data() ?? {};
    const policy = type === "store"
      ? await getStoreApplicationPolicy()
      : null;
    const driverPolicy = type === "driver"
      ? await getDriverApplicationPolicy()
      : null;
    const storeDocument = type === "store"
      ? reviewFieldsForStore(data, policy!).find((item) => item.key === documentKey)
      : null;
    const driverDocument = type === "driver"
      ? reviewFieldsForDriver(data, driverPolicy!).find((item) => item.key === documentKey)
      : null;

    if ((storeDocument && !storeDocument.url) || (driverDocument && driverDocument.urls.length === 0) || (!storeDocument && !driverDocument)) {
      throw new HttpsError("failed-precondition", "This uploaded document is not available for review.");
    }

    const reviewPath = type === "store"
      ? ({"owner-photo-id": "owner.photoIdReview", logo: "logoReview", banner: "bannerReview", "store-front": "storeFrontReview", "store-inside": "storeInsideReview"} as Record<string, string>)[documentKey]
      : ({"drivers-license": "driversLicense", "vehicle-insurance": "vehicleInsurance", "vehicle-registration": "vehicleRegistration"} as Record<string, string>)[documentKey];

    if (!reviewPath) throw new HttpsError("invalid-argument", "This document cannot be reviewed.");

    const updatePath = type === "driver" ? `${reviewPath}.reviewStatus` : reviewPath;
    const reviewUpdate = {reviewStatus: outcome, rejectionReason: outcome === "rejected" ? reason : null, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: administrator.uid};
    await application.ref.update(type === "driver"
      ? {[updatePath]: outcome, [`${reviewPath}.rejectionReason`]: reviewUpdate.rejectionReason, [`${reviewPath}.reviewedAt`]: reviewUpdate.reviewedAt, [`${reviewPath}.reviewedBy`]: administrator.uid, updatedAt: FieldValue.serverTimestamp()}
      : {[reviewPath]: reviewUpdate, updatedAt: FieldValue.serverTimestamp()});

    await writeAdminAuditLog(administrator, {action: `application_document_${outcome}`, targetType: `${type}_application`, targetId: applicationId, reason: outcome === "rejected" ? reason : null, details: {documentKey}});
    return {success: true};
  }
);

export const decideAdminApplication = onCall(
  {region: "us-central1"},
  async (request) => {
    const input = record(request.data);
    const type = text(input.type);
    const administrator = await requireAdminPermission(request, type === "store" ? "stores" : "drivers", "write");
    const applicationId = text(input.applicationId);
    const outcome = text(input.decision);
    const reason = text(input.reason);

    if (!applicationId || applicationId.includes("/") || !["store", "driver"].includes(type) || !["approved", "rejected"].includes(outcome)) {
      throw new HttpsError("invalid-argument", "A valid application decision is required.");
    }
    if (outcome === "rejected" && !reason) throw new HttpsError("invalid-argument", "Give a reason when rejecting an application.");

    const collection = type === "store" ? "stores" : "drivers";
    const application = await db.collection(collection).doc(applicationId).get();
    if (!application.exists) throw new HttpsError("not-found", "Application not found.");
    const data = application.data() ?? {};
    const storePolicy = type === "store"
      ? await getStoreApplicationPolicy()
      : null;
    const driverPolicy = type === "driver"
      ? await getDriverApplicationPolicy()
      : null;
    const documents = type === "store"
      ? reviewFieldsForStore(data, storePolicy!).map((item) => ({
          required: item.required,
          hasFile: Boolean(item.url),
          review: item.review,
        }))
      : reviewFieldsForDriver(data, driverPolicy!).map((item) => ({
          required: item.required,
          hasFile: item.urls.length > 0,
          review: item.review,
        }));
    const missingReviews = documents.filter((item) => item.required && !item.hasFile);
    const unapprovedReviews = documents.filter((item) => item.required && item.review.reviewStatus !== "approved");
    const license = record(data.driversLicense);
    const missingRequiredDriverLicense = Boolean(driverPolicy) && (
      (driverPolicy!.requiredDocuments.driversLicenseFront &&
        !text(license.frontDocumentUrl)) ||
      (driverPolicy!.requiredDocuments.driversLicenseBack &&
        !text(license.backDocumentUrl))
    );

    /*
     * Stores may be approved for owner workspace access while documents are
     * still under review, so they can prepare inventory before launch.
     * Drivers remain fully document-gated because approval provisions their
     * delivery-carrier access.
     */
    if (outcome === "approved" && type === "driver" && driverPolicy &&
      driverPolicy.requireApprovedDocumentsForApproval &&
      (missingReviews.length > 0 || missingRequiredDriverLicense ||
        unapprovedReviews.length > 0)) {
      throw new HttpsError("failed-precondition", "Approve every required document before approving this application.");
    }
    if (outcome === "approved" && type === "store" &&
      storePolicy && !storePolicy.allowWorkspaceApprovalBeforeDocumentReview &&
      (missingReviews.length > 0 || unapprovedReviews.length > 0)) {
      throw new HttpsError("failed-precondition", "Approve every required store document before approving this application.");
    }
    if (outcome === "approved" && data.onboardingCompleted !== true) {
      throw new HttpsError("failed-precondition", "The applicant has not submitted a complete onboarding application.");
    }
    if (outcome === "approved" && type === "store" && !hasCurrentStoreMerchantAgreement(data)) {
      throw new HttpsError("failed-precondition", "The store owner has not accepted the current LIA Merchant Agreement.");
    }

    await application.ref.update({
      status: outcome === "approved" ? "approved" : "rejected",
      isApproved: outcome === "approved",
      /* Marketplace activation is intentionally a separate admin decision. */
      ...(type === "store" ? {
        isActive: false,
        ...(outcome === "approved" ? {approvalRevokedAt: FieldValue.delete()} : {}),
      } : {availabilityStatus: "offline"}),
      applicationReview: {decision: outcome, reason: outcome === "rejected" ? reason : null, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: administrator.uid},
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAdminAuditLog(administrator, {action: `application_${outcome}`, targetType: `${type}_application`, targetId: applicationId, reason: outcome === "rejected" ? reason : null});
    return {success: true};
  }
);

/*
 * Approval grants a store owner workspace access. Activation is deliberately
 * separate because only an approved store should be made customer-visible.
 */
export const setAdminStoreApproval = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "stores", "write");
    const input = record(request.data);
    const storeId = text(input.storeId);
    const isApproved = input.isApproved === true;
    if (!storeId || storeId.includes("/")) throw new HttpsError("invalid-argument", "A valid store is required.");

    const storeReference = db.collection("stores").doc(storeId);
    const policy = await getStoreApplicationPolicy();
    await db.runTransaction(async (transaction) => {
      const store = await transaction.get(storeReference);
      if (!store.exists) throw new HttpsError("not-found", "Store application not found.");
      const data = store.data() ?? {};
      const ownerId = text(data.ownerId);
      const owner = ownerId ?
        await transaction.get(db.collection("users").doc(ownerId)) : null;
      if (isApproved && owner &&
        ["deletion_pending", "deletion_processing"].includes(
          text(owner.data()?.accountDeletionState)
        )) {
        throw new HttpsError(
          "failed-precondition",
          "Reinstate or cancel the owner's account deletion request before approving this store."
        );
      }
      if (isApproved && data.onboardingCompleted !== true) {
        throw new HttpsError("failed-precondition", "The store owner has not submitted a complete onboarding application.");
      }
      if (isApproved && !hasCurrentStoreMerchantAgreement(data)) {
        throw new HttpsError("failed-precondition", "The store owner has not accepted the current LIA Merchant Agreement.");
      }
      if (isApproved && !policy.allowWorkspaceApprovalBeforeDocumentReview &&
        !allRequiredStoreDocumentsApproved(data, policy)) {
        throw new HttpsError("failed-precondition", "Approve every required store document before approving this store.");
      }

      transaction.update(storeReference, {
        isApproved,
        /* An unapproved store must never remain customer-visible. */
        ...(isApproved ? {
          status: "approved",
          approvalRevokedAt: FieldValue.delete(),
          accountDeletionRequestId: FieldValue.delete(),
          accountDeletionDisabledAt: FieldValue.delete(),
        } : {
          status: "pending_review",
          isActive: false,
          ...(data.isApproved === true ? {
            approvalRevokedAt: FieldValue.serverTimestamp(),
          } : {}),
        }),
        approvalUpdatedAt: FieldValue.serverTimestamp(),
        approvalUpdatedBy: administrator.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await writeAdminAuditLog(administrator, {
      action: isApproved ? "store_approved" : "store_unapproved",
      targetType: "store_application",
      targetId: storeId,
    });

    return {success: true};
  }
);

export const setAdminDriverApproval = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "drivers", "write");
    const input = record(request.data);
    const driverId = text(input.driverId);
    const isApproved = input.isApproved === true;
    if (!driverId || driverId.includes("/")) throw new HttpsError("invalid-argument", "A valid driver is required.");

    const driver = await db.collection("drivers").doc(driverId).get();
    if (!driver.exists) throw new HttpsError("not-found", "Driver application not found.");
    const data = driver.data() ?? {};
    const policy = await getDriverApplicationPolicy();

    if (isApproved) {
      if (data.onboardingCompleted !== true ||
        (policy.requireApprovedDocumentsForApproval &&
          !allRequiredDriverDocumentsApproved(data, policy))) {
        throw new HttpsError("failed-precondition", "Approve every required document before approving this driver.");
      }
    }

    await driver.ref.update({
      isApproved,
      status: isApproved ? "approved" : "pending_review",
      availabilityStatus: "offline",
      approvalUpdatedAt: FieldValue.serverTimestamp(),
      approvalUpdatedBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAdminAuditLog(administrator, {
      action: isApproved ? "driver_approved" : "driver_unapproved",
      targetType: "driver_application",
      targetId: driverId,
    });

    return {success: true};
  }
);

export const activateAdminStore = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "stores", "write");
    const input = record(request.data);
    const storeId = text(input.storeId);
    const isActive = input.isActive !== false;
    if (!storeId || storeId.includes("/")) throw new HttpsError("invalid-argument", "A valid store is required.");

    const storeReference = db.collection("stores").doc(storeId);
    const policy = await getStoreApplicationPolicy();
    await db.runTransaction(async (transaction) => {
      const store = await transaction.get(storeReference);
      if (!store.exists) throw new HttpsError("not-found", "Store application not found.");
      const data = store.data() ?? {};
      const ownerId = text(data.ownerId);
      const owner = ownerId ?
        await transaction.get(db.collection("users").doc(ownerId)) : null;
      if (isActive && owner &&
        ["deletion_pending", "deletion_processing"].includes(
          text(owner.data()?.accountDeletionState)
        )) {
        throw new HttpsError(
          "failed-precondition",
          "Reinstate or cancel the owner's account deletion request before activating this store."
        );
      }
      if (isActive && data.isApproved !== true) {
        throw new HttpsError("failed-precondition", "Approve the store before activating it.");
      }
      if (isActive && !hasCurrentStoreMerchantAgreement(data)) {
        throw new HttpsError("failed-precondition", "The store owner has not accepted the current LIA Merchant Agreement.");
      }
      if (isActive && policy.requireApprovedDocumentsForActivation &&
        !allRequiredStoreDocumentsApproved(data, policy)) {
        throw new HttpsError("failed-precondition", "Approve every required store document before activating this store.");
      }
      if (isActive && !isStoreReadyForActivation(data)) {
        throw new HttpsError(
          "failed-precondition",
          "The store must finish Stripe Connect and have transfers enabled before it can be activated.",
        );
      }

      transaction.update(storeReference, {
        isActive,
        ...(isActive ? {activatedAt: FieldValue.serverTimestamp(), activatedBy: administrator.uid} : {deactivatedAt: FieldValue.serverTimestamp(), deactivatedBy: administrator.uid}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await writeAdminAuditLog(administrator, {
      action: isActive ? "store_activated" : "store_deactivated",
      targetType: "store_application",
      targetId: storeId,
    });

    return {success: true};
  }
);

/*
 * Suspension is an operational safety control, not an application rejection.
 * Removing a suspension returns the record to pending review; an explicit
 * approval is still required before any store or driver regains access.
 */
export const setAdminStoreSuspension = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "stores", "write");
    const input = record(request.data);
    const storeId = text(input.storeId);
    const isSuspended = input.isSuspended === true;
    const reason = text(input.reason);

    if (!storeId || storeId.includes("/")) {
      throw new HttpsError("invalid-argument", "A valid store is required.");
    }
    if (isSuspended && !reason) {
      throw new HttpsError("invalid-argument", "Give a reason when suspending a store.");
    }

    const store = await db.collection("stores").doc(storeId).get();
    if (!store.exists) throw new HttpsError("not-found", "Store application not found.");

    await store.ref.update(isSuspended
      ? {
        status: "suspended",
        isApproved: false,
        isActive: false,
        ...(store.data()?.isApproved === true ? {
          approvalRevokedAt: FieldValue.serverTimestamp(),
        } : {}),
        suspension: {
          reason,
          suspendedAt: FieldValue.serverTimestamp(),
          suspendedBy: administrator.uid,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }
      : {
        status: "pending_review",
        isApproved: false,
        isActive: false,
        suspension: FieldValue.delete(),
        unsuspendedAt: FieldValue.serverTimestamp(),
        unsuspendedBy: administrator.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

    await writeAdminAuditLog(administrator, {
      action: isSuspended ? "store_suspended" : "store_suspension_removed",
      targetType: "store_application",
      targetId: storeId,
      reason: isSuspended ? reason : null,
    });

    return {success: true};
  }
);

export const setAdminDriverSuspension = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "drivers", "write");
    const input = record(request.data);
    const driverId = text(input.driverId);
    const isSuspended = input.isSuspended === true;
    const reason = text(input.reason);

    if (!driverId || driverId.includes("/")) {
      throw new HttpsError("invalid-argument", "A valid driver is required.");
    }
    if (isSuspended && !reason) {
      throw new HttpsError("invalid-argument", "Give a reason when suspending a driver.");
    }

    const driver = await db.collection("drivers").doc(driverId).get();
    if (!driver.exists) throw new HttpsError("not-found", "Driver application not found.");

    await driver.ref.update(isSuspended
      ? {
        status: "suspended",
        isApproved: false,
        availabilityStatus: "offline",
        suspension: {
          reason,
          suspendedAt: FieldValue.serverTimestamp(),
          suspendedBy: administrator.uid,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }
      : {
        status: "pending_review",
        isApproved: false,
        availabilityStatus: "offline",
        suspension: FieldValue.delete(),
        unsuspendedAt: FieldValue.serverTimestamp(),
        unsuspendedBy: administrator.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

    await writeAdminAuditLog(administrator, {
      action: isSuspended ? "driver_suspended" : "driver_suspension_removed",
      targetType: "driver_application",
      targetId: driverId,
      reason: isSuspended ? reason : null,
    });

    return {success: true};
  }
);

/*
 * A driver may ask for up to their requested radius. The final usable radius
 * is stored separately so it cannot be changed by driver profile updates.
 */
export const setAdminDriverApprovedRadius = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "drivers", "write");
    const input = record(request.data);
    const driverId = text(input.driverId);
    const approvedRadiusMiles = input.approvedRadiusMiles;

    if (
      !driverId ||
      driverId.includes("/") ||
      typeof approvedRadiusMiles !== "number" ||
      !Number.isInteger(approvedRadiusMiles) ||
      approvedRadiusMiles <= 0
    ) {
      throw new HttpsError("invalid-argument", "Enter a valid approved service radius.");
    }

    const driver = await db.collection("drivers").doc(driverId).get();
    if (!driver.exists) throw new HttpsError("not-found", "Driver application not found.");
    const policy = await getDriverApplicationPolicy();
    const serviceArea = record(driver.data()?.serviceArea);
    const preferredRadiusMiles = serviceArea.preferredRadiusMiles;

    if (
      typeof preferredRadiusMiles !== "number" ||
      !Number.isFinite(preferredRadiusMiles) ||
      approvedRadiusMiles > preferredRadiusMiles ||
      approvedRadiusMiles > policy.maximumPreferredRadiusMiles
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The approved radius cannot exceed the driver's request or the platform maximum."
      );
    }

    await driver.ref.update({
      "serviceArea.approvedRadiusMiles": approvedRadiusMiles,
      approvedRadiusUpdatedAt: FieldValue.serverTimestamp(),
      approvedRadiusUpdatedBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAdminAuditLog(administrator, {
      action: "driver_radius_approved",
      targetType: "driver_application",
      targetId: driverId,
      details: {
        approvedRadiusMiles,
      },
    });

    return {success: true};
  }
);
