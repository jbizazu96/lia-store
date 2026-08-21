/*
|--------------------------------------------------------------------------
| Customer Refund Claim Notifications
|--------------------------------------------------------------------------
|
| Claims and payment refunds are separate records. These server triggers keep
| the customer informed when a claim is reviewed and when the trusted refund
| processor reaches a terminal payment outcome.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {
  notificationService,
} from "../services/notificationService";
import {queueCustomerRefundClaimActivityEmail} from "../email/emailEventService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function record(value: unknown): Data {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Data
    : {};
}

function isTerminalRefundStatus(value: string): boolean {
  return [
    "completed",
    "partially_completed",
    "failed",
    "cancelled",
  ].includes(value);
}

async function notifyCustomer(
  customerId: string,
  claimId: string,
  orderId: string,
  title: string,
  body: string,
): Promise<void> {
  if (!customerId || !orderId) return;

  await db
    .collection("users")
    .doc(customerId)
    .collection("notifications")
    .doc("refund-claim-" + claimId)
    .set({
      title,
      body,
      type: "refund",
      deepLink: "/orders/" + orderId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {
      merge: true,
    });

  try {
    await notificationService.sendToUser(
      customerId,
      title,
      body,
      "/orders/" + orderId,
      "orderUpdates",
    );
  } catch (error) {
    console.error("Customer refund push notification failed.", {
      claimId,
      message: error instanceof Error
        ? error.message
        : "Unknown error",
    });
  }
}

export const customerRefundClaimSubmissionNotification =
  onDocumentCreated(
    {
      document: "refundClaims/{claimId}",
      region: "us-central1",
      database: "default",
    },
    async (event) => {
      const claim = event.data?.data() as Data | undefined;
      if (!claim || text(claim.status) !== "pending_review") return;

      await queueCustomerRefundClaimActivityEmail({
        claimId: event.params.claimId,
        customerId: text(claim.customerId),
        orderId: text(claim.orderId),
        eventKey: "submitted",
        title: "We received your refund claim",
        summary: "LIA received your refund claim and it is waiting for Admin review. We will email you when its status changes.",
      });
    },
  );

export const customerRefundClaimDecisionNotification =
  onDocumentUpdated(
    {
      document: "refundClaims/{claimId}",
      region: "us-central1",
      database: "default",
    },
    async (event) => {
      const before = event.data?.before.data() as Data | undefined;
      const after = event.data?.after.data() as Data | undefined;

      if (!before || !after) return;

      const previousStatus = text(before.status);
      const nextStatus = text(after.status);

      if (
        previousStatus === nextStatus ||
        (nextStatus !== "approved" && nextStatus !== "rejected")
      ) return;

      const decision = record(after.decision);
      const note = text(decision.reason);

      const title = nextStatus === "approved"
        ? "Your refund claim was approved"
        : "Your refund claim was reviewed";
      const body = nextStatus === "approved"
        ? "Your refund is now being processed."
        : note
          ? "Your claim was not approved. Review note: " + note
          : "Your claim was not approved.";

      await Promise.all([
        notifyCustomer(
        text(after.customerId),
        event.params.claimId,
        text(after.orderId),
        title,
        body,
        ),
        queueCustomerRefundClaimActivityEmail({
          claimId: event.params.claimId,
          customerId: text(after.customerId),
          orderId: text(after.orderId),
          eventKey: nextStatus,
          title,
          summary: body,
        }),
      ]);
    },
  );

export const customerRefundClaimPaymentNotification =
  onDocumentUpdated(
    {
      document: "paymentRefunds/{refundId}",
      region: "us-central1",
      database: "default",
    },
    async (event) => {
      const before = event.data?.before.data() as Data | undefined;
      const after = event.data?.after.data() as Data | undefined;

      if (!before || !after) return;

      const previousStatus = text(before.status);
      const nextStatus = text(after.status);

      if (previousStatus === nextStatus) return;

      const claims = await db
        .collection("refundClaims")
        .where("refundId", "==", event.params.refundId)
        .limit(5)
        .get();

      if (isTerminalRefundStatus(nextStatus) && claims.empty && text(after.reason) === "store_cancelled") {
        const orderId = text(after.orderId);
        const order = orderId ? await db.collection("orders").doc(orderId).get() : null;
        const customerId = text(record(order?.data()?.customer).uid);
        const title = nextStatus === "completed"
          ? "Your cancelled order was refunded"
          : nextStatus === "partially_completed"
            ? "Your cancelled-order refund needs review"
            : "Your cancelled-order refund needs attention";
        const body = nextStatus === "completed"
          ? "The full payment was returned to your original payment method. Your bank controls when it appears."
          : "Please contact LIA Support for help with this refund.";

        await notifyCustomer(customerId, event.params.refundId, orderId, title, body);
      }

      if (isTerminalRefundStatus(nextStatus)) await Promise.all(claims.docs.map(async (claim) => {
        const data = claim.data();
        const title = nextStatus === "completed"
          ? "Your refund is complete"
          : nextStatus === "partially_completed"
            ? "Your refund was partially completed"
            : "Your refund could not be completed";

        const body = nextStatus === "completed"
          ? "Your payment provider is processing the returned funds."
          : "Please contact LIA Support if you need more help.";

        await notifyCustomer(
          text(data.customerId),
          claim.id,
          text(data.orderId),
          title,
          body,
        );
      }));

      const activity = {
        pending: ["Your refund is pending", "LIA is preparing your approved refund."],
        eligible: ["Your refund is ready for processing", "Your approved refund is queued for secure payment processing."],
        processing: ["Your refund is processing", "LIA has started processing your refund with the payment provider."],
        completed: ["Your refund is complete", "Your refund was sent to the original payment method. Your bank controls when it appears."],
        partially_completed: ["Your refund needs additional review", "Part of the refund completed, and LIA Support is reviewing the remaining activity."],
        failed: ["Your refund needs attention", "The latest refund attempt did not complete. LIA will retry or review it; you do not need to submit another claim."],
        cancelled: ["Your refund activity changed", "The refund obligation was cancelled. Open the order for the current claim status or contact LIA Support."],
      }[nextStatus];

      if (activity) {
        await Promise.all(claims.docs.map((claim) => {
          const data = claim.data();
          return queueCustomerRefundClaimActivityEmail({
            claimId: claim.id,
            customerId: text(data.customerId),
            orderId: text(data.orderId),
            eventKey: `refund-${event.params.refundId}-${nextStatus}`,
            title: activity[0],
            summary: activity[1],
          });
        }));
      }
    },
  );
