/*
|--------------------------------------------------------------------------
| Process Eligible Marketplace Refund
|--------------------------------------------------------------------------
|
| An approved customer claim creates one trusted paymentRefunds document.
| Process that obligation immediately instead of making the customer and
| administrator wait for the scheduled worker's next five-minute window.
|
| The scheduled worker remains the recovery path for failed attempts and
| expired processing leases. The payment processors claim their work in
| Firestore and use Stripe idempotency keys, so concurrent scheduler and
| trigger attempts cannot create duplicate reversals or customer refunds.
|
*/

import Stripe from "stripe";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onDocumentCreated,
} from "firebase-functions/v2/firestore";

import {
  paymentRefundOrchestrationService,
} from "../payment/marketplace/paymentRefundOrchestrationService";

const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown eligible marketplace refund processing error.";
}

export const processEligibleMarketplaceRefund =
  onDocumentCreated(
    {
      document:
        "paymentRefunds/{refundId}",

      database:
        "default",

      region:
        "us-central1",

      memory:
        "512MiB",

      timeoutSeconds:
        540,

      secrets: [
        stripeSecretKey,
      ],
    },

    async (
      event
    ) => {
      const document =
        event.data;

      if (!document) {
        return;
      }

      const refundId =
        event.params.refundId;

      const status =
        document.data().status;

      if (
        status !== "eligible"
      ) {
        return;
      }

      const stripe =
        new Stripe(
          stripeSecretKey.value(),
          {
            appInfo: {
              name:
                "LIA Store",

              version:
                "1.0.0",
            },

            maxNetworkRetries:
              2,

            timeout:
              30_000,
          }
        );

      try {
        const result =
          await paymentRefundOrchestrationService
            .process({
              refundId,

              stripe,
            });

        console.log(
          "Eligible marketplace refund processed.",
          {
            refundId:
              result.refundId,

            orderId:
              result.orderId,

            customerRefundCompleted:
              result.customerRefund.completed,

            stripeRefundStatus:
              result.customerRefund.stripeRefundStatus,
          }
        );
      } catch (
        error: unknown
      ) {
        /*
         * Do not throw here. The retry scheduler is deliberately the durable
         * recovery mechanism and will pick up a failed or expired obligation.
         */
        console.error(
          "Immediate marketplace refund processing failed; scheduler recovery remains available.",
          {
            refundId,

            error:
              getSafeErrorMessage(
                error
              ),
          }
        );
      }
    }
  );
