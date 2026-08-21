/* Creates one idempotent full refund when a store cancels a paid order before accepting it. */

import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {createRefund} from "../payment/marketplace/paymentRefundService";

if (admin.apps.length === 0) admin.initializeApp();

type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Data
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cents(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Cancelled order has an invalid ${label}.`);
  }
  return value;
}

function storeCancellationActor(order: Data): string {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const last = record(history.at(-1));
  const changedBy = record(last.changedBy);
  return text(changedBy.actorType) === "store" ? text(changedBy.uid) : "";
}

export const storeCancelledOrderRefund = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
    database: "default",
    retry: true,
  },
  async (event) => {
    const change = event.data;
    const before = change?.before.data() as Data | undefined;
    const after = change?.after.data() as Data | undefined;
    if (!change || !before || !after) return;

    const actorUid = storeCancellationActor(after);
    if (
      text(before.status) !== "pending" ||
      text(after.status) !== "cancelled" ||
      !actorUid
    ) return;

    const payment = record(after.payment);
    const pricing = record(after.pricing);
    if (text(after.checkoutStatus) !== "confirmed" || text(payment.status) !== "paid") {
      throw new Error("A store-cancelled order is not a confirmed paid order.");
    }

    const merchandiseAmount = cents(pricing.subtotalAmount, "subtotal");
    const taxAmount = cents(pricing.taxAmount, "tax amount");
    const deliveryFeeAmount = cents(pricing.deliveryFeeAmount, "delivery fee");
    const serviceFeeAmount = cents(pricing.serviceFeeAmount, "service fee");
    const driverTipAmount = cents(pricing.tipAmount, "driver tip");
    const totalAmount = cents(pricing.totalAmount, "total amount");
    if (merchandiseAmount + taxAmount + deliveryFeeAmount + serviceFeeAmount + driverTipAmount !== totalAmount || totalAmount <= 0) {
      throw new Error("Cancelled order pricing does not equal its paid total.");
    }

    const result = await createRefund({
      orderId: event.params.orderId,
      refundKey: "store_cancellation",
      stripePaymentIntentId: text(payment.paymentIntentId),
      stripeChargeId: text(payment.stripeChargeId),
      scope: "full",
      reason: "store_cancelled",
      note: "Automatic full refund after the store cancelled before accepting the order.",
      allocation: {
        merchandiseAmount,
        taxAmount,
        deliveryFeeAmount,
        serviceFeeAmount,
        driverTipAmount,
        totalAmount,
        storeReversalAmount: 0,
        driverReversalAmount: 0,
        platformRevenueReductionAmount: totalAmount,
      },
      reversals: [],
      requestedBy: actorUid,
    });

    await change.after.ref.update({
      cancellationRefundId: result.refundId,
      cancellationRefundCreatedAt: FieldValue.serverTimestamp(),
    });
  },
);
