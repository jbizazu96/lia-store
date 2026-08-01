/**
 * ================================================================
 * Marketplace Payment Transfer Scheduler
 * ================================================================
 *
 * Finds marketplace transfer obligations that are ready for Stripe
 * execution.
 *
 * Responsibilities:
 *
 * - Find eligible transfers
 * - Find failed transfers whose retry time has arrived
 * - Recover processing transfers whose worker lease expired
 * - Pass each obligation to the Stripe transfer processor
 * - Continue processing when one transfer fails
 *
 * This service does not create financial obligations and does not
 * calculate payment amounts.
 *
 * Marketplace decides.
 * Stripe executes.
 */

import Stripe from "stripe";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  stripePaymentTransferProcessor,
} from "../stripe/stripePaymentTransferProcessor";

const ELIGIBLE_TRANSFER_BATCH_SIZE =
  25;

const RETRY_TRANSFER_BATCH_SIZE =
  25;

const EXPIRED_PROCESSING_BATCH_SIZE =
  25;

export interface RunPaymentTransferSchedulerInput {
  stripe: Stripe;
}

export interface PaymentTransferSchedulerResult {
  eligibleFound: number;
  retriesFound: number;
  expiredProcessingFound: number;
  processed: number;
  completed: number;
  alreadyCompleted: number;
  failed: number;
}

type TransferWorkSource =
  | "eligible"
  | "retry"
  | "expired_processing";

interface TransferWorkItem {
  transferId: string;
  source: TransferWorkSource;
}

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown marketplace transfer scheduler error.";
}

async function findEligibleTransfers(): Promise<
  TransferWorkItem[]
> {
  const snapshot =
    await getFirestore("default")
      .collection("paymentTransfers")
      .where("status", "==", "eligible")
      .orderBy("createdAt", "asc")
      .limit(ELIGIBLE_TRANSFER_BATCH_SIZE)
      .get();

  return snapshot.docs.map(
    (document): TransferWorkItem => ({
      transferId: document.id,
      source: "eligible",
    })
  );
}

async function findRetryableTransfers(): Promise<
  TransferWorkItem[]
> {
  const now =
    new Date().toISOString();

  const snapshot =
    await getFirestore("default")
      .collection("paymentTransfers")
      .where("status", "==", "failed")
      .where("nextRetryAt", "<=", now)
      .orderBy("nextRetryAt", "asc")
      .limit(RETRY_TRANSFER_BATCH_SIZE)
      .get();

  return snapshot.docs.map(
    (document): TransferWorkItem => ({
      transferId: document.id,
      source: "retry",
    })
  );
}

async function findExpiredProcessingTransfers(): Promise<
  TransferWorkItem[]
> {
  const now =
    new Date().toISOString();

  const snapshot =
    await getFirestore("default")
      .collection("paymentTransfers")
      .where("status", "==", "processing")
      .where("processingLeaseUntil", "<=", now)
      .orderBy("processingLeaseUntil", "asc")
      .limit(EXPIRED_PROCESSING_BATCH_SIZE)
      .get();

  return snapshot.docs.map(
    (document): TransferWorkItem => ({
      transferId: document.id,
      source: "expired_processing",
    })
  );
}

function mergeWorkItems(
  groups: ReadonlyArray<
    ReadonlyArray<TransferWorkItem>
  >
): TransferWorkItem[] {
  const workByTransferId =
    new Map<string, TransferWorkItem>();

  for (const group of groups) {
    for (const item of group) {
      if (
        !workByTransferId.has(
          item.transferId
        )
      ) {
        workByTransferId.set(
          item.transferId,
          item
        );
      }
    }
  }

  return Array.from(
    workByTransferId.values()
  );
}

export const paymentTransferScheduler = {
  async run(
    input: RunPaymentTransferSchedulerInput
  ): Promise<
    PaymentTransferSchedulerResult
  > {
    const [
      eligibleTransfers,
      retryableTransfers,
      expiredProcessingTransfers,
    ] =
      await Promise.all([
        findEligibleTransfers(),
        findRetryableTransfers(),
        findExpiredProcessingTransfers(),
      ]);

    const workItems =
      mergeWorkItems([
        eligibleTransfers,
        retryableTransfers,
        expiredProcessingTransfers,
      ]);

    const result:
      PaymentTransferSchedulerResult = {
        eligibleFound:
          eligibleTransfers.length,

        retriesFound:
          retryableTransfers.length,

        expiredProcessingFound:
          expiredProcessingTransfers.length,

        processed: 0,
        completed: 0,
        alreadyCompleted: 0,
        failed: 0,
      };

    if (workItems.length === 0) {
      console.log(
        "Marketplace transfer scheduler found no ready transfers."
      );

      return result;
    }

    console.log(
      "Marketplace transfer scheduler starting.",
      {
        eligibleFound:
          result.eligibleFound,

        retriesFound:
          result.retriesFound,

        expiredProcessingFound:
          result.expiredProcessingFound,

        totalWorkItems:
          workItems.length,
      }
    );

    for (const workItem of workItems) {
      result.processed += 1;

      try {
        const processingResult =
          await stripePaymentTransferProcessor
            .process({
              transferId:
                workItem.transferId,

              stripe:
                input.stripe,
            });

        if (
          processingResult
            .alreadyCompleted
        ) {
          result.alreadyCompleted +=
            1;
        } else {
          result.completed += 1;
        }

        console.log(
          "Marketplace transfer processed successfully.",
          {
            transferId:
              processingResult
                .transferId,

            stripeTransferId:
              processingResult
                .stripeTransferId,

            recipientType:
              processingResult
                .recipientType,

            recipientId:
              processingResult
                .recipientId,

            amount:
              processingResult
                .amount,

            currency:
              processingResult
                .currency,

            workSource:
              workItem.source,

            alreadyCompleted:
              processingResult
                .alreadyCompleted,
          }
        );
      } catch (error: unknown) {
        result.failed += 1;

        console.error(
          "Marketplace transfer processing failed.",
          {
            transferId:
              workItem.transferId,

            workSource:
              workItem.source,

            error:
              getSafeErrorMessage(
                error
              ),
          }
        );
      }
    }

    console.log(
      "Marketplace transfer scheduler completed.",
      result
    );

    return result;
  },
};
