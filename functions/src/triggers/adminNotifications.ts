/*
|--------------------------------------------------------------------------
| Admin Notification Triggers
|--------------------------------------------------------------------------
|
| These notices contain operational summaries only: never document URLs,
| customer addresses, card data, or other sensitive private details.
| Scheduled reminders have deterministic keys, making retries safe.
|
*/

import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  onSchedule,
} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  notifyActiveAdministrators,
} from "../admin/adminNotificationService";

type Data = Record<string, unknown>;

const db = getFirestore("default");
const REVIEW_DAYS = 7;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Data
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function status(value: unknown): string {
  return text(value).toLowerCase();
}

function reviewStatus(value: unknown): string {
  return status(record(value).reviewStatus) || "pending";
}

function storeName(data: Data): string {
  return text(data.name) || "A store";
}

function driverName(data: Data): string {
  return [text(data.firstName), text(data.lastName)].filter(Boolean).join(" ") ||
    "A driver";
}

function hasPendingStoreDocuments(data: Data): boolean {
  const owner = record(data.owner);
  const documents = [
    [text(owner.photoIdUrl), reviewStatus(owner.photoIdReview)],
    [text(data.logoUrl), reviewStatus(data.logoReview)],
    [text(data.storeFrontUrl), reviewStatus(data.storeFrontReview)],
    [text(data.storeInsideUrl), reviewStatus(data.storeInsideReview)],
  ];

  return documents.some(([url, review]) => Boolean(url) && review === "pending");
}

function hasPendingDriverDocuments(data: Data): boolean {
  const license = record(data.driversLicense);
  const insurance = record(data.vehicleInsurance);
  const registration = record(data.vehicleRegistration);
  const documents = [
    [text(license.frontDocumentUrl), reviewStatus(license)],
    [text(license.backDocumentUrl), reviewStatus(license)],
    [text(insurance.documentUrl), reviewStatus(insurance)],
    [text(registration.documentUrl), reviewStatus(registration)],
  ];

  return documents.some(([url, review]) => Boolean(url) && review === "pending");
}

function utcWindow(hours: number): string {
  const now = new Date();
  const roundedHour = Math.floor(now.getUTCHours() / hours) * hours;
  return String(now.getUTCFullYear()) +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    String(roundedHour).padStart(2, "0");
}

function utcDay(): string {
  return utcWindow(24);
}

function expiresWithinReviewWindow(value: unknown): boolean {
  const dateText = text(value);
  if (!dateText) return false;

  const date = new Date(dateText + "T23:59:59.999");
  if (Number.isNaN(date.getTime())) return false;

  const remaining = date.getTime() - Date.now();
  return remaining >= 0 && remaining <= REVIEW_DAYS * 24 * 60 * 60 * 1_000;
}

export const adminStoreApplicationSubmitted = onDocumentWritten(
  {document: "stores/{storeId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;
    const afterData = after.data() as Data;
    if (afterData.onboardingCompleted !== true) return;

    const wasSubmitted = before?.exists &&
      (before.data() as Data).onboardingCompleted === true;
    if (wasSubmitted) return;

    await notifyActiveAdministrators({
      title: "New store application",
      body: storeName(afterData) + " submitted an application for review.",
      type: "application",
      deepLink: "/admin/store-applications/" + event.params.storeId,
      subject: {type: "store", id: event.params.storeId},
      dedupeKey: "store-submitted-" + event.params.storeId,
    });
  }
);

export const adminDriverApplicationSubmitted = onDocumentWritten(
  {document: "drivers/{driverId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;
    const afterData = after.data() as Data;
    if (afterData.onboardingCompleted !== true) return;

    const wasSubmitted = before?.exists &&
      (before.data() as Data).onboardingCompleted === true;
    if (wasSubmitted) return;

    await notifyActiveAdministrators({
      title: "New driver application",
      body: driverName(afterData) + " submitted an application for review.",
      type: "application",
      deepLink: "/admin/driver-applications/" + event.params.driverId,
      subject: {type: "driver", id: event.params.driverId},
      dedupeKey: "driver-submitted-" + event.params.driverId,
    });
  }
);

export const adminNewCustomerCreated = onDocumentCreated(
  {document: "users/{userId}", region: "us-central1", database: "default"},
  async (event) => {
    const data = event.data?.data() as Data | undefined;
    if (!data || text(data.accountType) !== "customer") return;

    await notifyActiveAdministrators({
      title: "New customer account",
      body: "A new customer has registered with LIA.",
      type: "customer",
      subject: {type: "customer", id: event.params.userId},
      dedupeKey: "customer-created-" + event.params.userId,
    });
  }
);

export const adminProductAdded = onDocumentCreated(
  {document: "products/{productId}", region: "us-central1", database: "default"},
  async (event) => {
    const data = event.data?.data() as Data | undefined;
    if (!data) return;

    const productName = text(data.name) || "A product";
    const storeId = text(data.storeId);
    const store = storeId ? await db.collection("stores").doc(storeId).get() : null;
    const name = store?.exists ? storeName(store.data() as Data) : "a store";

    await notifyActiveAdministrators({
      title: "New product added",
      body: productName + " was added by " + name + ".",
      type: "product",
      subject: {type: "product", id: event.params.productId},
      dedupeKey: "product-created-" + event.params.productId,
    });
  }
);

export const adminLowStockProduct = onDocumentUpdated(
  {document: "products/{productId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.data() as Data;
    const after = event.data?.after.data() as Data;
    const previousStock = number(before.stock);
    const currentStock = number(after.stock);

    /*
     * Alert at 10 and every lower value only when inventory was reduced.
     * A store correction that increases stock deliberately does not alert.
     */
    if (
      previousStock === null ||
      currentStock === null ||
      currentStock >= previousStock ||
      currentStock > 10
    ) return;

    const productName = text(after.name) || "A product";
    await notifyActiveAdministrators({
      title: currentStock === 0 ? "Product out of stock" : "Low product stock",
      body: currentStock === 0
        ? productName + " is out of stock."
        : productName + " now has " + String(currentStock) + " in stock.",
      type: "inventory",
      subject: {type: "product", id: event.params.productId},
      dedupeKey: "low-stock-" + event.params.productId + "-" + String(currentStock),
    });
  }
);

export const adminPaymentTransferFailed = onDocumentWritten(
  {document: "paymentTransfers/{transferId}", region: "us-central1", database: "default"},
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    if (status((after.data() as Data).status) !== "failed") return;
    if (status(event.data?.before.data()?.status) === "failed") return;

    await notifyActiveAdministrators({
      title: "Payout transfer failed",
      body: "A marketplace payout transfer failed and needs review.",
      type: "payment",
      subject: {type: "payment-transfer", id: event.params.transferId},
      dedupeKey: "transfer-failed-" + event.params.transferId,
    });
  }
);

/*
 * Customer payment attempts keep the order reusable, so payment failure lives
 * at orders/{id}. Alert only on the transition into failed, never including
 * Stripe's failure message in the Admin notification.
 */
export const adminCustomerPaymentFailed = onDocumentUpdated(
  {document: "orders/{orderId}", region: "us-central1", database: "default"},
  async (event) => {
    const beforePayment = record((event.data?.before.data() as Data).payment);
    const afterPayment = record((event.data?.after.data() as Data).payment);

    if (
      status(beforePayment.status) === "failed" ||
      status(afterPayment.status) !== "failed"
    ) return;

    await notifyActiveAdministrators({
      title: "Customer payment failed",
      body: "A customer payment attempt failed and may need support.",
      type: "payment",
      subject: {type: "order", id: event.params.orderId},
      dedupeKey: "customer-payment-failed-" + event.params.orderId,
    });
  }
);

/*
 * paymentRefunds is the current trusted refund/return-claim record. A future
 * customer returns feature can use the same notification service and type.
 */
export const adminRefundRequested = onDocumentCreated(
  {document: "paymentRefunds/{refundId}", region: "us-central1", database: "default"},
  async (event) => {
    await notifyActiveAdministrators({
      title: "Customer refund claim",
      body: "A refund record was created and should be reviewed.",
      type: "refund",
      subject: {type: "payment-refund", id: event.params.refundId},
      dedupeKey: "refund-requested-" + event.params.refundId,
    });
  }
);

/*
 * Refund processing is asynchronous. Admins receive a separate immutable
 * notification for each actual status transition so a failure or retry is
 * visible without inspecting Stripe records manually.
 */
export const adminRefundStatusChanged = onDocumentUpdated(
  {document: "paymentRefunds/{refundId}", region: "us-central1", database: "default"},
  async (event) => {
    const beforeStatus = status(event.data?.before.data()?.status);
    const afterStatus = status(event.data?.after.data()?.status);

    if (!afterStatus || beforeStatus === afterStatus) return;

    await notifyActiveAdministrators({
      title: "Refund status updated",
      body: "Refund " + event.params.refundId +
        " is now " + afterStatus.replace(/_/g, " ") + ".",
      type: "refund",
      deepLink: "/admin/finance",
      subject: {type: "payment-refund", id: event.params.refundId},
      dedupeKey: "refund-status-" +
        event.params.refundId +
        "-" +
        afterStatus,
    });
  }
);

/*
 * A customer claim is the review request. The later paymentRefund record is
 * created only after an admin approves that request.
 */
export const adminCustomerRefundClaimSubmitted = onDocumentCreated(
  {document: "refundClaims/{claimId}", region: "us-central1", database: "default"},
  async (event) => {
    const claim = event.data?.data() as Data | undefined;

    if (!claim || status(claim.status) !== "pending_review") return;

    await notifyActiveAdministrators({
      title: "New refund or return claim",
      body: "A customer support claim is waiting for review.",
      type: "refund",
      deepLink: "/admin/refund-claims?claim=" + event.params.claimId,
      subject: {type: "refund-claim", id: event.params.claimId},
      dedupeKey: "refund-claim-" + event.params.claimId,
    });
  }
);

export const adminAccountDeletionRequested = onDocumentCreated(
  {document: "accountDeletionRequests/{requestId}", region: "us-central1", database: "default"},
  async (event) => {
    await notifyActiveAdministrators({
      title: "Account deletion request",
      body: "An account deletion request is waiting for review.",
      type: "account",
      deepLink: "/admin/deletion-requests/" + event.params.requestId,
      subject: {type: "account-deletion-request", id: event.params.requestId},
      dedupeKey: "account-deletion-" + event.params.requestId,
    });
  }
);

export const remindAdminDocumentReviews = onSchedule(
  {schedule: "every 3 hours", region: "us-central1", timeZone: "America/Chicago"},
  async () => {
    const [stores, drivers] = await Promise.all([
      db.collection("stores").where("onboardingCompleted", "==", true).limit(500).get(),
      db.collection("drivers").where("onboardingCompleted", "==", true).limit(500).get(),
    ]);
    const window = utcWindow(3);
    const notices: Array<Promise<void>> = [];

    stores.docs.filter((document) => hasPendingStoreDocuments(document.data() as Data))
      .forEach((document) => notices.push(notifyActiveAdministrators({
        title: "Store documents need review",
        body: storeName(document.data() as Data) + " has pending documents to review.",
        type: "document",
        deepLink: "/admin/store-applications/" + document.id,
        subject: {type: "store", id: document.id},
        dedupeKey: "store-document-reminder-" + document.id + "-" + window,
      })));
    drivers.docs.filter((document) => hasPendingDriverDocuments(document.data() as Data))
      .forEach((document) => notices.push(notifyActiveAdministrators({
        title: "Driver documents need review",
        body: driverName(document.data() as Data) + " has pending documents to review.",
        type: "document",
        deepLink: "/admin/driver-applications/" + document.id,
        subject: {type: "driver", id: document.id},
        dedupeKey: "driver-document-reminder-" + document.id + "-" + window,
      })));

    await Promise.all(notices);
  }
);

export const remindAdminDocumentExpirations = onSchedule(
  {schedule: "every 24 hours", region: "us-central1", timeZone: "America/Chicago"},
  async () => {
    const [stores, drivers] = await Promise.all([
      db.collection("stores").where("onboardingCompleted", "==", true).limit(500).get(),
      db.collection("drivers").where("onboardingCompleted", "==", true).limit(500).get(),
    ]);
    const day = utcDay();
    const notices: Array<Promise<void>> = [];

    stores.docs.forEach((document) => {
      const data = document.data() as Data;
      const owner = record(data.owner);
      /*
       * Store onboarding does not currently collect a document expiration
       * date. This is ready for that optional future field without exposing it.
       */
      if (!expiresWithinReviewWindow(owner.photoIdExpirationDate)) return;
      notices.push(notifyActiveAdministrators({
        title: "Store document expiring soon",
        body: storeName(data) + " has owner verification expiring within " +
          String(REVIEW_DAYS) + " days.",
        type: "expiration",
        deepLink: "/admin/store-applications/" + document.id,
        subject: {type: "store", id: document.id},
        dedupeKey: "store-document-expiring-" + document.id + "-owner-photo-id-" + day,
      }));
    });

    drivers.docs.forEach((document) => {
      const data = document.data() as Data;
      const checks = [
        ["drivers-license", record(data.driversLicense).expirationDate],
        ["vehicle-insurance", record(data.vehicleInsurance).expirationDate],
        ["vehicle-registration", record(data.vehicleRegistration).expirationDate],
      ];
      checks.forEach(([documentType, expirationDate]) => {
        if (!expiresWithinReviewWindow(expirationDate)) return;
        notices.push(notifyActiveAdministrators({
          title: "Driver document expiring soon",
          body: driverName(data) + " has " +
            String(documentType).replace(/-/g, " ") +
            " expiring within " + String(REVIEW_DAYS) + " days.",
          type: "expiration",
          deepLink: "/admin/driver-applications/" + document.id,
          subject: {type: "driver", id: document.id},
          dedupeKey: "driver-document-expiring-" + document.id + "-" +
            String(documentType) + "-" + day,
        }));
      });
    });

    await Promise.all(notices);
  }
);
