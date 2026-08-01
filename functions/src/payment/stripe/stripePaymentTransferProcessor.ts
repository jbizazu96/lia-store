/**
 * ================================================================
 * Stripe Marketplace Transfer Processor
 * ================================================================
 *
 * Executes one eligible LIA marketplace transfer through Stripe.
 *
 * Responsibilities:
 *
 * - Load and validate the internal transfer obligation
 * - Atomically claim the transfer for processing
 * - Prevent concurrent workers from processing the same transfer
 * - Create the Stripe transfer with a deterministic idempotency key
 * - Record successful Stripe completion
 * - Record retryable failure information
 *
 * This processor handles one recipient at a time.
 *
 * Store and driver transfers remain independent so one participant
 * can succeed while the other participant is retried later.
 */

import Stripe from "stripe";

import {
  DocumentReference,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  MarketplacePaymentTransfer,
} from "../marketplace/paymentTransferTypes";

import {
  markTransferCompleted,
  markTransferFailed,
} from "../marketplace/paymentTransferService";

import {
  paymentSettlementCompletionService,
} from "../marketplace/paymentSettlementCompletionService";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const COLLECTION =
  "paymentTransfers";

const PROCESSING_LEASE_MINUTES =
  10;

const MAXIMUM_AUTOMATIC_ATTEMPTS =
  3;

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface ProcessStripePaymentTransferInput {
  transferId: string;

  stripe: Stripe;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface ProcessStripePaymentTransferResult {
  transferId: string;

  stripeTransferId: string;

  recipientType:
    "store" | "driver";

  recipientId: string;

  amount: number;

  currency: "usd";

  alreadyCompleted: boolean;
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export class StripePaymentTransferProcessorError extends Error {
  readonly code: string;
  readonly causeMessage: string | null;

  constructor(
    message: string,
    options: {
      code: string;
      causeMessage?: string;
    }
  ) {
    super(message);

    this.name =
      "StripePaymentTransferProcessorError";

    this.code =
      options.code;

    this.causeMessage =
      options.causeMessage ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function requireIdentifier(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new StripePaymentTransferProcessorError(
      `${fieldName} is required.`,
      {
        code:
          "invalid-argument",
      }
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new StripePaymentTransferProcessorError(
      `${fieldName} contains invalid characters.`,
      {
        code:
          "invalid-argument",
      }
    );
  }

  return normalized;
}

function requirePositiveInteger(
  value: unknown,
  fieldName: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new StripePaymentTransferProcessorError(
      `${fieldName} must be a positive integer amount.`,
      {
        code:
          "invalid-amount",
      }
    );
  }

  return value;
}

function requireStringField(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new StripePaymentTransferProcessorError(
      `${fieldName} is missing or invalid.`,
      {
        code:
          "invalid-transfer",
      }
    );
  }

  return value.trim();
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

  return "Unknown Stripe transfer failure.";
}

/*
|--------------------------------------------------------------------------
| Retry Timing
|--------------------------------------------------------------------------
*/

function calculateNextRetryAt(
  attemptCount: number
): string | undefined {
  const delayMinutesByAttempt: Record<
    number,
    number
  > = {
    1: 1,
    2: 5,
    3: 15,
  };

  const delayMinutes =
    delayMinutesByAttempt[
      attemptCount
    ];

  if (!delayMinutes) {
    return undefined;
  }

  return new Date(
    Date.now() +
      delayMinutes *
        60 *
        1000
  ).toISOString();
}

/*
|--------------------------------------------------------------------------
| Transfer Validation
|--------------------------------------------------------------------------
*/

function validateTransfer(
  transfer:
    MarketplacePaymentTransfer
): MarketplacePaymentTransfer {
  requireIdentifier(
    transfer.id,
    "Transfer ID"
  );

  requireIdentifier(
    transfer.settlementId,
    "Settlement ID"
  );

  requireIdentifier(
    transfer.orderId,
    "Order ID"
  );

  if (
    transfer.recipient.type !==
      "store" &&
    transfer.recipient.type !==
      "driver"
  ) {
    throw new StripePaymentTransferProcessorError(
      "Transfer recipient type is invalid.",
      {
        code:
          "invalid-recipient-type",
      }
    );
  }

  requireIdentifier(
    transfer.recipient.id,
    "Recipient ID"
  );

  const stripeAccountId =
    requireStringField(
      transfer.recipient
        .stripeAccountId,
      "Stripe account ID"
    );

  if (
    !stripeAccountId.startsWith(
      "acct_"
    )
  ) {
    throw new StripePaymentTransferProcessorError(
      "Transfer recipient Stripe account ID is invalid.",
      {
        code:
          "invalid-stripe-account-id",
      }
    );
  }

  const paymentIntentId =
    requireStringField(
      transfer.source
        .stripePaymentIntentId,
      "Stripe PaymentIntent ID"
    );

  if (
    !paymentIntentId.startsWith(
      "pi_"
    )
  ) {
    throw new StripePaymentTransferProcessorError(
      "Transfer Stripe PaymentIntent ID is invalid.",
      {
        code:
          "invalid-payment-intent-id",
      }
    );
  }

  const stripeChargeId =
    requireStringField(
      transfer.source
        .stripeChargeId,
      "Stripe charge ID"
    );

  if (
    !stripeChargeId.startsWith(
      "ch_"
    )
  ) {
    throw new StripePaymentTransferProcessorError(
      "Transfer Stripe charge ID is invalid.",
      {
        code:
          "invalid-charge-id",
      }
    );
  }

  requireIdentifier(
    transfer.source.transferGroup,
    "Transfer group"
  );

  requireIdentifier(
    transfer.stripeIdempotencyKey,
    "Stripe idempotency key"
  );

  requirePositiveInteger(
    transfer.amount,
    "Transfer amount"
  );

  if (
    transfer.currency !==
    "usd"
  ) {
    throw new StripePaymentTransferProcessorError(
      "Only USD transfers are currently supported.",
      {
        code:
          "unsupported-currency",
      }
    );
  }

  return transfer;
}

/*
|--------------------------------------------------------------------------
| Claim Transfer
|--------------------------------------------------------------------------
|
| This Firestore transaction prevents two scheduler instances from
| processing the same transfer simultaneously.
|
| A short processing lease also allows recovery if a previous worker
| stopped after claiming the transfer.
|
*/

async function claimTransfer(
  transferReference:
    DocumentReference
): Promise<{
  transfer:
    MarketplacePaymentTransfer;

  alreadyCompleted:
    boolean;
}> {
  const db =
    getFirestore("default");

  return db.runTransaction(
    async (
      transaction
    ) => {
      const snapshot =
        await transaction.get(
          transferReference
        );

      if (!snapshot.exists) {
        throw new StripePaymentTransferProcessorError(
          "The marketplace transfer was not found.",
          {
            code:
              "transfer-not-found",
          }
        );
      }

      const transfer =
        validateTransfer(
          snapshot.data() as
            MarketplacePaymentTransfer
        );

      if (
        transfer.status ===
        "completed"
      ) {
        if (
          !transfer.stripeTransferId
        ) {
          throw new StripePaymentTransferProcessorError(
            "The completed transfer is missing its Stripe transfer ID.",
            {
              code:
                "invalid-transfer",
            }
          );
        }

        return {
          transfer,
          alreadyCompleted:
            true,
        };
      }

      if (
        transfer.status ===
        "cancelled"
      ) {
        throw new StripePaymentTransferProcessorError(
          "The marketplace transfer was cancelled.",
          {
            code:
              "transfer-cancelled",
          }
        );
      }

      if (
        transfer.status !==
          "eligible" &&
        transfer.status !==
          "failed" &&
        transfer.status !==
          "processing"
      ) {
        throw new StripePaymentTransferProcessorError(
          "The marketplace transfer is not eligible for processing.",
          {
            code:
              "invalid-transfer-status",
          }
        );
      }

      const currentAttemptCount =
        typeof transfer.attemptCount ===
          "number" &&
        Number.isSafeInteger(
          transfer.attemptCount
        )
          ? transfer.attemptCount
          : 0;

      if (
        currentAttemptCount >=
        MAXIMUM_AUTOMATIC_ATTEMPTS
      ) {
        throw new StripePaymentTransferProcessorError(
          "The marketplace transfer reached the maximum automatic retry limit.",
          {
            code:
              "maximum-attempts-reached",
          }
        );
      }

      if (
        transfer.status ===
        "failed" &&
        transfer.nextRetryAt
      ) {
        const nextRetryTime =
          new Date(
            transfer.nextRetryAt
          ).getTime();

        if (
          Number.isFinite(
            nextRetryTime
          ) &&
          nextRetryTime >
            Date.now()
        ) {
          throw new StripePaymentTransferProcessorError(
            "The marketplace transfer is not ready for its next retry.",
            {
              code:
                "retry-not-ready",
            }
          );
        }
      }

      if (
        transfer.status ===
        "processing"
      ) {
        const processingLeaseUntil =
          typeof (
            snapshot.data()
          )?.processingLeaseUntil ===
            "string"
            ? (
                snapshot.data()
              )?.processingLeaseUntil
            : null;

        if (
          processingLeaseUntil
        ) {
          const leaseTime =
            new Date(
              processingLeaseUntil
            ).getTime();

          if (
            Number.isFinite(
              leaseTime
            ) &&
            leaseTime >
              Date.now()
          ) {
            throw new StripePaymentTransferProcessorError(
              "Another worker is currently processing this transfer.",
              {
                code:
                  "transfer-already-processing",
              }
            );
          }
        }
      }

      const now =
        new Date();

      const processingLeaseUntil =
        new Date(
          now.getTime() +
            PROCESSING_LEASE_MINUTES *
              60 *
              1000
        ).toISOString();

      transaction.update(
        transferReference,
        {
          status:
            "processing",

          attemptCount:
            currentAttemptCount +
            1,

          processingStartedAt:
            now.toISOString(),

          processingLeaseUntil,

          lastError:
            null,

          nextRetryAt:
            null,

          updatedAt:
            now.toISOString(),
        }
      );

      return {
        transfer: {
          ...transfer,

          status:
            "processing",

          attemptCount:
            currentAttemptCount +
            1,

          updatedAt:
            now.toISOString(),
        },

        alreadyCompleted:
          false,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Processor
|--------------------------------------------------------------------------
*/

export const stripePaymentTransferProcessor = {
  async process(
    input:
      ProcessStripePaymentTransferInput
  ): Promise<
    ProcessStripePaymentTransferResult
  > {
    const transferId =
      requireIdentifier(
        input.transferId,
        "Transfer ID"
      );

    const transferReference =
      getFirestore("default")
        .collection(COLLECTION)
        .doc(transferId);

    let claimedTransfer:
      MarketplacePaymentTransfer | null =
        null;
      
    let stripeTransferSucceeded =
        false;

    try {
      const claim =
        await claimTransfer(
          transferReference
        );

      claimedTransfer =
        claim.transfer;

      if (
        claim.alreadyCompleted
      ) {
        return {
          transferId:
            claimedTransfer.id,

          stripeTransferId:
            requireStringField(
              claimedTransfer
                .stripeTransferId,
              "Stripe transfer ID"
            ),

          recipientType:
            claimedTransfer
              .recipient.type,

          recipientId:
            claimedTransfer
              .recipient.id,

          amount:
            claimedTransfer.amount,

          currency:
            claimedTransfer.currency,

          alreadyCompleted:
            true,
        };
      }

      /*
       * Create the platform-to-connected-account transfer.
       *
       * The deterministic Stripe idempotency key protects retries that
       * occur after Stripe succeeds but before Firestore is updated.
       */
      const stripeTransfer =
        await input.stripe
          .transfers.create(
            {
              amount:
                claimedTransfer.amount,

              currency:
                claimedTransfer.currency,

              destination:
                claimedTransfer
                  .recipient
                  .stripeAccountId,

              source_transaction:
                claimedTransfer
                  .source
                  .stripeChargeId,

              transfer_group:
                claimedTransfer
                  .source
                  .transferGroup,

              description:
                `LIA ${claimedTransfer.recipient.type} settlement for order ${claimedTransfer.orderId}`,

              metadata: {
                liaTransferId:
                  claimedTransfer.id,

                liaSettlementId:
                  claimedTransfer
                    .settlementId,

                liaOrderId:
                  claimedTransfer
                    .orderId,

                liaRecipientType:
                  claimedTransfer
                    .recipient.type,

                liaRecipientId:
                  claimedTransfer
                    .recipient.id,

                liaPaymentIntentId:
                  claimedTransfer
                    .source
                    .stripePaymentIntentId,
              },
            },
            {
              idempotencyKey:
                claimedTransfer
                  .stripeIdempotencyKey,
            }
          );

      stripeTransferSucceeded =
        true;

      await markTransferCompleted(
        claimedTransfer.id,
        stripeTransfer.id
      );

      /*
      |--------------------------------------------------------------------------
      | Settlement Completion Check
      |--------------------------------------------------------------------------
      |
      | Stripe has already moved the money and the internal transfer is now
      | recorded as completed.
      |
      | Settlement completion is a separate accounting operation.
      |
      | If settlement reconciliation fails, never change this successful
      | transfer back to "failed".
      |
      */

      try {
        const settlementCompletion =
          await paymentSettlementCompletionService
            .complete({
              settlementId:
                claimedTransfer
                  .settlementId,
            });

        console.log(
          "Marketplace settlement completion checked.",
          {
            settlementId:
              settlementCompletion
                .settlementId,

            completed:
              settlementCompletion
                .completed,

            alreadyCompleted:
              settlementCompletion
                .alreadyCompleted,

            storeTransferCompleted:
              settlementCompletion
                .storeTransferCompleted,

            driverTransferCompleted:
              settlementCompletion
                .driverTransferCompleted,
          }
        );
      } catch (
        settlementCompletionError:
          unknown
      ) {
        /*
        * Do not throw.
        *
        * The Stripe transfer succeeded and must remain completed.
        * A reconciliation worker will repair the settlement separately.
        */
        console.error(
          "Stripe transfer completed, but settlement reconciliation failed.",
          {
            transferId:
              claimedTransfer.id,

            settlementId:
              claimedTransfer
                .settlementId,

            stripeTransferId:
              stripeTransfer.id,

            error:
              settlementCompletionError,
          }
        );
      }

      /*
       * Remove the processing lease after successful completion.
       */
      try {
          await transferReference.update({
            processingLeaseUntil:
              null,

            processingStartedAt:
              null,
          });
        } catch (
          leaseCleanupError:
            unknown
        ) {
          /*
          * Stripe succeeded and the transfer was already recorded completed.
          *
          * Lease cleanup is operational housekeeping and must never change the
          * financial result.
          */
          console.error(
            "Stripe transfer completed, but processing lease cleanup failed.",
            {
              transferId:
                claimedTransfer.id,

              stripeTransferId:
                stripeTransfer.id,

              leaseCleanupError,
            }
          );
        }

      return {
        transferId:
          claimedTransfer.id,

        stripeTransferId:
          stripeTransfer.id,

        recipientType:
          claimedTransfer
            .recipient.type,

        recipientId:
          claimedTransfer
            .recipient.id,

        amount:
          claimedTransfer.amount,

        currency:
          claimedTransfer.currency,

        alreadyCompleted:
          false,
      };
    } catch (
      error: unknown
    ) {
      /*
       * Claim errors happen before this worker owns the transfer and
       * should not overwrite another worker's state.
       */
      if (!claimedTransfer) {
        throw error;
      }

      /*
      * Once Stripe has confirmed the transfer, never mark the financial
      * obligation failed because of a later Firestore, ledger, reconciliation,
      * or cleanup error.
      */
      if (stripeTransferSucceeded) {
        throw new StripePaymentTransferProcessorError(
          "Stripe completed the marketplace transfer, but LIA could not finish recording all post-transfer state.",
          {
            code:
              "post-transfer-state-failed",

            causeMessage:
              getSafeErrorMessage(
                error
              ),
          }
        );
      }

      const errorMessage =
        getSafeErrorMessage(
          error
        );

      const nextRetryAt =
        calculateNextRetryAt(
          claimedTransfer
            .attemptCount
        );

      try {
        await markTransferFailed(
          claimedTransfer.id,
          errorMessage,
          nextRetryAt
        );

        await transferReference.update({
          processingLeaseUntil:
            null,

          processingStartedAt:
            null,
        });
      } catch (
        stateError: unknown
      ) {
        console.error(
          "Unable to record Stripe transfer failure.",
          {
            transferId:
              claimedTransfer.id,

            originalError:
              errorMessage,

            stateError,
          }
        );
      }

      if (
        error instanceof
        StripePaymentTransferProcessorError
      ) {
        throw error;
      }

      if (
        error instanceof
          Stripe.errors.StripeError
      ) {
        throw new StripePaymentTransferProcessorError(
          "Stripe could not create the marketplace transfer.",
          {
            code:
              "stripe-transfer-failed",

            causeMessage:
              error.message,
          }
        );
      }

      throw new StripePaymentTransferProcessorError(
        "The marketplace transfer could not be processed.",
        {
          code:
            "transfer-processing-failed",

          causeMessage:
            errorMessage,
        }
      );
    }
  },
};