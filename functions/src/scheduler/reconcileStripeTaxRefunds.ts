import Stripe from "stripe";
import {defineSecret} from "firebase-functions/params";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

import {reconcileStripeTaxRefund} from "../payment/tax/stripeTaxRefundReconciliationService";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const BATCH_SIZE = 50;
const MAXIMUM_CHECKS = 32;

export const reconcileStripeTaxRefunds = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    timeZone: "America/Chicago",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: [stripeSecretKey],
  },
  async () => {
    const db = getFirestore("default");
    const pending = await db.collection("paymentRefunds")
      .where("taxReversalPending", "==", true)
      .limit(BATCH_SIZE)
      .get();
    if (pending.empty) return;

    const stripe = new Stripe(stripeSecretKey.value(), {
      appInfo: {name: "LIA Marketplace", version: "1.0.0"},
      maxNetworkRetries: 2,
      timeout: 30_000,
    });

    for (const document of pending.docs) {
      const refund = document.data();
      const paymentIntentId = typeof refund.stripePaymentIntentId === "string"
        ? refund.stripePaymentIntentId.trim()
        : "";
      const stripeRefundId = typeof refund.stripeRefundId === "string"
        ? refund.stripeRefundId.trim()
        : "";
      const orderId = typeof refund.orderId === "string" ? refund.orderId.trim() : "";
      const checkedAt = new Date().toISOString();
      const checkCount = Number.isInteger(refund.taxReversalCheckCount)
        ? refund.taxReversalCheckCount + 1
        : 1;

      try {
        if (!paymentIntentId.startsWith("pi_") || !stripeRefundId.startsWith("re_") || !orderId) {
          throw new Error("The refund is missing its trusted Stripe or order reference.");
        }

        const order = await db.collection("orders").doc(orderId).get();
        if (order.data()?.taxCalculation?.provider !== "stripe_tax") {
          await document.ref.update({
            taxReversalPending: false,
            taxReversal: {
              provider: "stripe_tax_payment_intent",
              automatic: true,
              status: "not_applicable",
              checkedAt,
            },
            updatedAt: checkedAt,
          });
          continue;
        }

        const result = await reconcileStripeTaxRefund(stripe, {
          paymentIntentId,
          stripeRefundId,
        });
        const timedOut = result.status === "pending" && checkCount >= MAXIMUM_CHECKS;
        await document.ref.update({
          taxReversalPending: result.status === "pending" && !timedOut,
          taxReversal: {
            provider: "stripe_tax_payment_intent",
            automatic: true,
            ...result,
            ...(timedOut ? {
              status: "failed",
              error: "Stripe did not report the automatic tax reversal within the reconciliation window.",
            } : {}),
            checkedAt,
          },
          taxReversalCheckCount: FieldValue.increment(1),
          updatedAt: checkedAt,
        });
      } catch (error: unknown) {
        const message = error instanceof Error && error.message.trim()
          ? error.message.trim().slice(0, 500)
          : "Stripe Tax association could not be checked.";
        console.error("Stripe Tax refund reconciliation failed.", {
          refundId: document.id,
          paymentIntentId,
          stripeRefundId,
          error: message,
        });
        const exhausted = checkCount >= MAXIMUM_CHECKS;
        await document.ref.update({
          /* Keep temporary Stripe delays retryable, then surface a durable failure. */
          taxReversalPending: !exhausted,
          "taxReversal.checkedAt": checkedAt,
          "taxReversal.error": message,
          ...(exhausted ? {"taxReversal.status": "failed"} : {}),
          taxReversalCheckCount: FieldValue.increment(1),
          updatedAt: checkedAt,
        });
      }
    }
  }
);
