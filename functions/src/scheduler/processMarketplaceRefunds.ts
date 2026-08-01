/*
|--------------------------------------------------------------------------
| Process Marketplace Refunds
|--------------------------------------------------------------------------
|
| Firebase scheduled entry point for marketplace refund execution.
|
| Responsibilities:
|
| - Bind the Stripe secret
| - Find refund obligations ready for processing
| - Recover retry-ready failed refunds
| - Recover processing refunds whose worker lease expired
| - Execute transfer reversals and customer refunds
| - Continue processing when one refund fails
|
| This scheduled function does not calculate refund amounts.
|
| Refund amounts and participant responsibility are decided by trusted
| marketplace services before a refund becomes eligible.
|
| Marketplace decides.
| Stripe executes.
|
*/

import Stripe from "stripe";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  paymentRefundOrchestrationService,
} from "../payment/marketplace/paymentRefundOrchestrationService";

/*
|--------------------------------------------------------------------------
| Stripe Secret
|--------------------------------------------------------------------------
*/

const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const ELIGIBLE_REFUND_BATCH_SIZE =
  20;

const RETRY_REFUND_BATCH_SIZE =
  20;

const EXPIRED_PROCESSING_BATCH_SIZE =
  20;

/*
|--------------------------------------------------------------------------
| Internal Types
|--------------------------------------------------------------------------
*/

type RefundWorkSource =
  | "eligible"
  | "retry"
  | "expired_processing";

interface RefundWorkItem {
  refundId: string;

  source:
    RefundWorkSource;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

interface MarketplaceRefundSchedulerResult {
  eligibleFound: number;

  retriesFound: number;

  expiredProcessingFound: number;

  processed: number;

  completed: number;

  pending: number;

  failed: number;
}

/*
|--------------------------------------------------------------------------
| Error Helper
|--------------------------------------------------------------------------
*/

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown marketplace refund scheduler error.";
}

/*
|--------------------------------------------------------------------------
| Eligible Refund Discovery
|--------------------------------------------------------------------------
*/

async function findEligibleRefunds(): Promise<
  RefundWorkItem[]
> {
  const snapshot =
    await getFirestore("default")
      .collection(
        "paymentRefunds"
      )
      .where(
        "status",
        "==",
        "eligible"
      )
      .orderBy(
        "createdAt",
        "asc"
      )
      .limit(
        ELIGIBLE_REFUND_BATCH_SIZE
      )
      .get();

  return snapshot.docs.map(
    (
      document
    ): RefundWorkItem => ({
      refundId:
        document.id,

      source:
        "eligible",
    })
  );
}

/*
|--------------------------------------------------------------------------
| Retry-Ready Refund Discovery
|--------------------------------------------------------------------------
|
| Refunds without nextRetryAt have exhausted automatic retries or require
| administrator review.
|
*/

async function findRetryableRefunds(): Promise<
  RefundWorkItem[]
> {
  const now =
    new Date()
      .toISOString();

  const snapshot =
    await getFirestore("default")
      .collection(
        "paymentRefunds"
      )
      .where(
        "status",
        "==",
        "failed"
      )
      .where(
        "nextRetryAt",
        "<=",
        now
      )
      .orderBy(
        "nextRetryAt",
        "asc"
      )
      .limit(
        RETRY_REFUND_BATCH_SIZE
      )
      .get();

  return snapshot.docs.map(
    (
      document
    ): RefundWorkItem => ({
      refundId:
        document.id,

      source:
        "retry",
    })
  );
}

/*
|--------------------------------------------------------------------------
| Expired Processing Refund Discovery
|--------------------------------------------------------------------------
|
| A worker may stop after claiming a refund but before completing it.
|
| Once processingLeaseUntil expires, another worker may safely resume the
| obligation. Stripe refund and reversal idempotency keys prevent duplicate
| financial operations.
|
| Refunds whose Stripe Refund object already exists normally have their
| processing lease cleared and are therefore not selected by this query.
|
*/

async function findExpiredProcessingRefunds(): Promise<
  RefundWorkItem[]
> {
  const now =
    new Date()
      .toISOString();

  const snapshot =
    await getFirestore("default")
      .collection(
        "paymentRefunds"
      )
      .where(
        "status",
        "==",
        "processing"
      )
      .where(
        "processingLeaseUntil",
        "<=",
        now
      )
      .orderBy(
        "processingLeaseUntil",
        "asc"
      )
      .limit(
        EXPIRED_PROCESSING_BATCH_SIZE
      )
      .get();

  return snapshot.docs.map(
    (
      document
    ): RefundWorkItem => ({
      refundId:
        document.id,

      source:
        "expired_processing",
    })
  );
}

/*
|--------------------------------------------------------------------------
| Duplicate Protection
|--------------------------------------------------------------------------
|
| A refund should normally appear in only one status query.
|
| We still de-duplicate by refund ID in case a concurrent state transition
| occurs while the discovery queries are running.
|
*/

function mergeWorkItems(
  groups:
    ReadonlyArray<
      ReadonlyArray<
        RefundWorkItem
      >
    >
): RefundWorkItem[] {
  const workByRefundId =
    new Map<
      string,
      RefundWorkItem
    >();

  for (
    const group of
    groups
  ) {
    for (
      const item of
      group
    ) {
      if (
        !workByRefundId.has(
          item.refundId
        )
      ) {
        workByRefundId.set(
          item.refundId,
          item
        );
      }
    }
  }

  return Array.from(
    workByRefundId.values()
  );
}

/*
|--------------------------------------------------------------------------
| Scheduled Function
|--------------------------------------------------------------------------
*/

export const processMarketplaceRefunds =
  onSchedule(
    {
      schedule:
        "every 5 minutes",

      region:
        "us-central1",

      timeZone:
        "America/Chicago",

      memory:
        "512MiB",

      timeoutSeconds:
        540,

      secrets: [
        stripeSecretKey,
      ],
    },

    async () => {
      console.log(
        "Starting marketplace refund processing..."
      );

      /*
      |--------------------------------------------------------------------------
      | Stripe Client
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | Discover Work
      |--------------------------------------------------------------------------
      */

      const [
        eligibleRefunds,
        retryableRefunds,
        expiredProcessingRefunds,
      ] =
        await Promise.all([
          findEligibleRefunds(),

          findRetryableRefunds(),

          findExpiredProcessingRefunds(),
        ]);

      const workItems =
        mergeWorkItems([
          eligibleRefunds,

          retryableRefunds,

          expiredProcessingRefunds,
        ]);

      const result:
        MarketplaceRefundSchedulerResult = {
        eligibleFound:
          eligibleRefunds.length,

        retriesFound:
          retryableRefunds.length,

        expiredProcessingFound:
          expiredProcessingRefunds.length,

        processed:
          0,

        completed:
          0,

        pending:
          0,

        failed:
          0,
      };

      if (
        workItems.length ===
        0
      ) {
        console.log(
          "Marketplace refund scheduler found no ready refunds."
        );

        return;
      }

      console.log(
        "Marketplace refund scheduler starting batch.",
        {
          eligibleFound:
            result
              .eligibleFound,

          retriesFound:
            result
              .retriesFound,

          expiredProcessingFound:
            result
              .expiredProcessingFound,

          totalWorkItems:
            workItems.length,
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Process Sequentially
      |--------------------------------------------------------------------------
      |
      | Financial operations are intentionally processed sequentially during
      | the first production phase.
      |
      | This keeps resource use predictable and makes failures easier to
      | investigate.
      |
      */

      for (
        const workItem of
        workItems
      ) {
        result.processed +=
          1;

        try {
          const processingResult =
            await paymentRefundOrchestrationService
              .process({
                refundId:
                  workItem
                    .refundId,

                stripe,
              });

          if (
            processingResult
              .customerRefund
              .completed
          ) {
            result.completed +=
              1;
          } else {
            /*
             * Stripe may accept a refund but report it as pending.
             *
             * A pending Stripe Refund already has a permanent refund ID and
             * must not be recreated.
             */
            result.pending +=
              1;
          }

          console.log(
            "Marketplace refund processed.",
            {
              refundId:
                processingResult
                  .refundId,

              orderId:
                processingResult
                  .orderId,

              workSource:
                workItem.source,

              storeReversalCompleted:
                processingResult
                  .storeReversal
                  .completed,

              driverReversalCompleted:
                processingResult
                  .driverReversal
                  .completed,

              customerRefundCompleted:
                processingResult
                  .customerRefund
                  .completed,

              stripeRefundId:
                processingResult
                  .customerRefund
                  .stripeRefundId,

              stripeRefundStatus:
                processingResult
                  .customerRefund
                  .stripeRefundStatus,
            }
          );
        } catch (
          error: unknown
        ) {
          result.failed +=
            1;

          console.error(
            "Marketplace refund processing failed.",
            {
              refundId:
                workItem
                  .refundId,

              workSource:
                workItem
                  .source,

              error:
                getSafeErrorMessage(
                  error
                ),
            }
          );

          /*
           * Continue processing the remaining refund obligations.
           *
           * One failed store reversal, driver reversal, or customer refund
           * must not block unrelated refunds.
           */
        }
      }

      console.log(
        "Marketplace refund processing completed.",
        result
      );
    }
  );