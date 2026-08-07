/*
|--------------------------------------------------------------------------
| Store Stripe Status Notifications
|--------------------------------------------------------------------------
|
| Stripe Connect status is written only by the verified Stripe webhook. This
| trigger turns meaningful status changes into owner notifications without
| exposing any Stripe account details to the browser.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

import {
  notificationService,
} from "../services/notificationService";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusNotification(status: string): {
  title: string;
  body: string;
  color: "green" | "orange" | "red";
} | null {
  switch (status) {
    case "complete":
      return {
        title: "Stripe payout account ready",
        body: "Your Stripe account is ready to receive LIA payouts.",
        color: "green",
      };
    case "pending_verification":
      return {
        title: "Stripe verification in progress",
        body: "Stripe is reviewing your payout account information.",
        color: "orange",
      };
    case "action_required":
    case "restricted":
      return {
        title: "Stripe account needs attention",
        body: "Open Payment & Payouts to complete Stripe's required steps.",
        color: "red",
      };
    default:
      return null;
  }
}

export const storeStripeStatusNotifications = onDocumentUpdated(
  {
    document: "stores/{storeId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const previousStatus = text(before.stripeAccountStatus);
    const nextStatus = text(after.stripeAccountStatus);
    const ownerId = text(after.ownerId);

    if (!ownerId || previousStatus === nextStatus) return;

    const notice = statusNotification(nextStatus);
    if (!notice) return;

    const db = getFirestore("default");
    const notificationReference = db
      .collection("users")
      .doc(ownerId)
      .collection("notifications")
      .doc(`store-stripe-status-${event.id}`);

    await notificationReference.set({
      uid: ownerId,
      title: notice.title,
      body: notice.body,
      type: "payment",
      icon: "credit-card",
      color: notice.color,
      deepLink: "/store/settings?section=payment",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    try {
      await notificationService.sendToUser(
        ownerId,
        notice.title,
        notice.body,
        "/store/settings?section=payment",
        "paymentUpdates",
      );
    } catch (error) {
      console.error("Store Stripe status push notification failed.", {
        storeId: event.params.storeId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
