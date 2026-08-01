/*
|--------------------------------------------------------------------------
| Stripe Transfer Reversal Processor
|--------------------------------------------------------------------------
|
| Reverses one previously completed marketplace transfer through Stripe.
|
| A customer refund and a connected-account transfer reversal are separate
| Stripe operations.
|
| This processor handles only the transfer-reversal portion.
|
| Responsibilities:
|
| - Load the trusted refund obligation
| - Locate the requested store or driver reversal
| - Atomically claim the reversal
| - Prevent concurrent workers from reversing the same obligation
| - Execute a full or partial Stripe transfer reversal
| - Use deterministic Stripe idempotency
| - Record successful or failed reversal state
|
| This processor does not:
|
| - Calculate refund amounts
| - Create refund obligations
| - Refund the customer Charge
| - Decide whether a store or driver is responsible
|
| Marketplace decides.
| Stripe executes.
|
*/

import Stripe from "stripe";

import {
  getFirestore,
  type DocumentReference,
} from "firebase-admin/firestore";

import type {
  MarketplacePaymentRefund,
  MarketplaceRefundReversal,
} from "../marketplace/paymentRefundTypes";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const COLLECTION =
  "paymentRefunds";

const PROCESSING_LEASE_MINUTES =
  10;

const MAXIMUM_AUTOMATIC_ATTEMPTS =
  3;

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface ProcessStripeTransferReversalInput {
  refundId: string;

  recipientType:
    "store" | "driver";

  stripe: Stripe;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface ProcessStripeTransferReversalResult {
  refundId: string;

  recipientType:
    "store" | "driver";

  recipientId: string;

  transferId: string;

  stripeTransferId: string;

  stripeReversalId: string;

  amount: number;

  alreadyCompleted: boolean;
}

/*
|--------------------------------------------------------------------------
| Claimed Reversal
|--------------------------------------------------------------------------
*/

interface ClaimedTransferReversal {
  refund:
    MarketplacePaymentRefund;

  reversal:
    MarketplaceRefundReversal;

  reversalIndex: number;

  attemptCount: number;
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export type StripeTransferReversalProcessorErrorCode =
  | "INVALID_ARGUMENT"
  | "REFUND_NOT_FOUND"
  | "REVERSAL_NOT_FOUND"
  | "INVALID_REVERSAL"
  | "REVERSAL_CANCELLED"
  | "REVERSAL_ALREADY_PROCESSING"
  | "INVALID_REVERSAL_STATUS"
  | "MAXIMUM_ATTEMPTS_REACHED"
  | "STRIPE_REVERSAL_FAILED"
  | "REVERSAL_PROCESSING_FAILED"
  | "POST_REVERSAL_STATE_FAILED";

export class StripeTransferReversalProcessorError extends Error {
  readonly code:
    StripeTransferReversalProcessorErrorCode;

  readonly causeMessage:
    string | null;

  constructor(
    code:
      StripeTransferReversalProcessorErrorCode,
    message: string,
    causeMessage?: string
  ) {
    super(message);

    this.name =
      "StripeTransferReversalProcessorError";

    this.code =
      code;

    this.causeMessage =
      causeMessage ?? null;
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
    throw new StripeTransferReversalProcessorError(
      "INVALID_ARGUMENT",
      `${fieldName} is required.`
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new StripeTransferReversalProcessorError(
      "INVALID_ARGUMENT",
      `${fieldName} contains invalid characters.`
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
    throw new StripeTransferReversalProcessorError(
      "INVALID_REVERSAL",
      `${fieldName} must be a positive integer amount.`
    );
  }

  return value;
}

function requireRecipientType(
  value: unknown
): "store" | "driver" {
  if (
    value !== "store" &&
    value !== "driver"
  ) {
    throw new StripeTransferReversalProcessorError(
      "INVALID_ARGUMENT",
      "Transfer-reversal recipient type is invalid."
    );
  }

  return value;
}

function requireStripeTransferId(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !value.trim().startsWith(
      "tr_"
    )
  ) {
    throw new StripeTransferReversalProcessorError(
      "INVALID_REVERSAL",
      "The original Stripe transfer ID is invalid."
    );
  }

  return value.trim();
}

function requireStripeReversalId(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !value.trim().startsWith(
      "trr_"
    )
  ) {
    throw new StripeTransferReversalProcessorError(
      "INVALID_REVERSAL",
      "The Stripe transfer-reversal ID is invalid."
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

  return "Unknown Stripe transfer-reversal failure.";
}

/*
|--------------------------------------------------------------------------
| Retry Timing
|--------------------------------------------------------------------------
*/

function calculateNextRetryAt(
  attemptCount: number
): string | undefined {
  const delayMinutesByAttempt:
    Record<number, number> = {
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
| Stripe Idempotency
|--------------------------------------------------------------------------
*/

function createStripeReversalIdempotencyKey(
  refundIdInput: string,
  recipientTypeInput:
    "store" | "driver"
): string {
  const refundId =
    requireIdentifier(
      refundIdInput,
      "Refund ID"
    );

  const recipientType =
    requireRecipientType(
      recipientTypeInput
    );

  return (
    `lia-marketplace-transfer-reversal-` +
    `${refundId}-${recipientType}`
  );
}

/*
|--------------------------------------------------------------------------
| Reversal Validation
|--------------------------------------------------------------------------
*/

function validateReversal(
  reversal:
    MarketplaceRefundReversal,
  expectedRecipientType:
    "store" | "driver"
): MarketplaceRefundReversal {
  if (
    reversal.recipientType !==
    expectedRecipientType
  ) {
    throw new StripeTransferReversalProcessorError(
      "INVALID_REVERSAL",
      "The transfer reversal has an invalid recipient type."
    );
  }

  requireIdentifier(
    reversal.recipientId,
    "Reversal recipient ID"
  );

  requireIdentifier(
    reversal.transferId,
    "Internal transfer ID"
  );

  requireStripeTransferId(
    reversal.stripeTransferId
  );

  requirePositiveInteger(
    reversal.amount,
    "Transfer-reversal amount"
  );

  if (
    !Number.isSafeInteger(
      reversal.attemptCount
    ) ||
    reversal.attemptCount < 0
  ) {
    throw new StripeTransferReversalProcessorError(
      "INVALID_REVERSAL",
      "The transfer-reversal attempt count is invalid."
    );
  }

  return reversal;
}

/*
|--------------------------------------------------------------------------
| Claim Reversal
|--------------------------------------------------------------------------
|
| The reversal is stored inside the refund document's reversals array.
|
| This transaction reloads the array, locates the recipient reversal, and
| places it into processing state with a temporary lease.
|
*/

async function claimReversal(
  refundReference:
    DocumentReference,
  recipientType:
    "store" | "driver"
): Promise<{
  claimed:
    ClaimedTransferReversal;

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
          refundReference
        );

      if (!snapshot.exists) {
        throw new StripeTransferReversalProcessorError(
          "REFUND_NOT_FOUND",
          "The marketplace refund was not found."
        );
      }

      const refund =
        snapshot.data() as
          MarketplacePaymentRefund;

      if (
        !Array.isArray(
          refund.reversals
        )
      ) {
        throw new StripeTransferReversalProcessorError(
          "INVALID_REVERSAL",
          "The marketplace refund has invalid transfer reversals."
        );
      }

      const reversalIndex =
        refund.reversals.findIndex(
          (
            reversal
          ) =>
            reversal
              .recipientType ===
            recipientType
        );

      if (
        reversalIndex < 0
      ) {
        throw new StripeTransferReversalProcessorError(
          "REVERSAL_NOT_FOUND",
          `The refund has no ${recipientType} transfer reversal.`
        );
      }

      const reversal =
        validateReversal(
          refund.reversals[
            reversalIndex
          ],
          recipientType
        );

      if (
        reversal.status ===
        "completed"
      ) {
        requireStripeReversalId(
          reversal
            .stripeReversalId
        );

        return {
          claimed: {
            refund,

            reversal,

            reversalIndex,

            attemptCount:
              reversal.attemptCount,
          },

          alreadyCompleted:
            true,
        };
      }

      if (
        reversal.status ===
        "not_required"
      ) {
        throw new StripeTransferReversalProcessorError(
          "REVERSAL_CANCELLED",
          `The ${recipientType} transfer reversal is not required.`
        );
      }

      if (
        reversal.status !==
          "pending" &&
        reversal.status !==
          "failed" &&
        reversal.status !==
          "processing"
      ) {
        throw new StripeTransferReversalProcessorError(
          "INVALID_REVERSAL_STATUS",
          "The transfer reversal is not eligible for processing."
        );
      }

      if (
        reversal.attemptCount >=
        MAXIMUM_AUTOMATIC_ATTEMPTS
      ) {
        throw new StripeTransferReversalProcessorError(
          "MAXIMUM_ATTEMPTS_REACHED",
          "The transfer reversal reached the maximum automatic retry limit."
        );
      }

      const operationalReversal =
        reversal as
          MarketplaceRefundReversal & {
            processingLeaseUntil?:
              string;

            nextRetryAt?:
              string;
          };

      if (
        reversal.status ===
          "failed" &&
        operationalReversal
          .nextRetryAt
      ) {
        const retryAt =
          new Date(
            operationalReversal
              .nextRetryAt
          ).getTime();

        if (
          Number.isFinite(
            retryAt
          ) &&
          retryAt >
            Date.now()
        ) {
          throw new StripeTransferReversalProcessorError(
            "INVALID_REVERSAL_STATUS",
            "The transfer reversal is not ready for its next retry."
          );
        }
      }

      if (
        reversal.status ===
        "processing"
      ) {
        const leaseUntil =
          operationalReversal
            .processingLeaseUntil;

        if (leaseUntil) {
          const leaseTime =
            new Date(
              leaseUntil
            ).getTime();

          if (
            Number.isFinite(
              leaseTime
            ) &&
            leaseTime >
              Date.now()
          ) {
            throw new StripeTransferReversalProcessorError(
              "REVERSAL_ALREADY_PROCESSING",
              "Another worker is currently processing this transfer reversal."
            );
          }
        }
      }

      const now =
        new Date();

      const attemptCount =
        reversal.attemptCount +
        1;

      const processingLeaseUntil =
        new Date(
          now.getTime() +
            PROCESSING_LEASE_MINUTES *
              60 *
              1000
        ).toISOString();

      const updatedReversals =
        refund.reversals.map(
          (
            current,
            index
          ) => {
            if (
              index !==
              reversalIndex
            ) {
              return current;
            }

            return {
              ...current,

              status:
                "processing" as const,

              attemptCount,

              lastError:
                undefined,

              nextRetryAt:
                undefined,

              processingStartedAt:
                now.toISOString(),

              processingLeaseUntil,
            };
          }
        );

      transaction.update(
        refundReference,
        {
          reversals:
            updatedReversals,

          updatedAt:
            now.toISOString(),
        }
      );

      return {
        claimed: {
          refund: {
            ...refund,

            reversals:
              updatedReversals,
          },

          reversal: {
            ...reversal,

            status:
              "processing",

            attemptCount,
          },

          reversalIndex,

          attemptCount,
        },

        alreadyCompleted:
          false,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Save Completed Reversal
|--------------------------------------------------------------------------
*/

async function saveCompletedReversal(
  refundReference:
    DocumentReference,
  recipientType:
    "store" | "driver",
  stripeReversalId: string
): Promise<void> {
  const db =
    getFirestore("default");

  await db.runTransaction(
    async (
      transaction
    ) => {
      const snapshot =
        await transaction.get(
          refundReference
        );

      if (!snapshot.exists) {
        throw new StripeTransferReversalProcessorError(
          "REFUND_NOT_FOUND",
          "The marketplace refund disappeared after Stripe reversed the transfer."
        );
      }

      const refund =
        snapshot.data() as
          MarketplacePaymentRefund;

      const reversalIndex =
        refund.reversals.findIndex(
          (
            reversal
          ) =>
            reversal
              .recipientType ===
            recipientType
        );

      if (
        reversalIndex < 0
      ) {
        throw new StripeTransferReversalProcessorError(
          "REVERSAL_NOT_FOUND",
          "The transfer reversal could not be reloaded after Stripe completion."
        );
      }

      const now =
        new Date()
          .toISOString();

      const updatedReversals =
        refund.reversals.map(
          (
            reversal,
            index
          ) => {
            if (
              index !==
              reversalIndex
            ) {
              return reversal;
            }

            return {
              ...reversal,

              status:
                "completed" as const,

              stripeReversalId,

              lastError:
                undefined,

              nextRetryAt:
                undefined,

              processingStartedAt:
                undefined,

              processingLeaseUntil:
                undefined,
            };
          }
        );

      transaction.update(
        refundReference,
        {
          reversals:
            updatedReversals,

          updatedAt:
            now,
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| Save Failed Reversal
|--------------------------------------------------------------------------
*/

async function saveFailedReversal(
  refundReference:
    DocumentReference,
  recipientType:
    "store" | "driver",
  errorMessage: string,
  nextRetryAt?: string
): Promise<void> {
  const db =
    getFirestore("default");

  await db.runTransaction(
    async (
      transaction
    ) => {
      const snapshot =
        await transaction.get(
          refundReference
        );

      if (!snapshot.exists) {
        return;
      }

      const refund =
        snapshot.data() as
          MarketplacePaymentRefund;

      const updatedReversals =
        refund.reversals.map(
          (
            reversal
          ) => {
            if (
              reversal
                .recipientType !==
              recipientType
            ) {
              return reversal;
            }

            return {
              ...reversal,

              status:
                "failed" as const,

              lastError:
                errorMessage
                  .slice(
                    0,
                    1_000
                  ),

              ...(nextRetryAt
                ? {
                    nextRetryAt,
                  }
                : {
                    nextRetryAt:
                      undefined,
                  }),

              processingStartedAt:
                undefined,

              processingLeaseUntil:
                undefined,
            };
          }
        );

      transaction.update(
        refundReference,
        {
          reversals:
            updatedReversals,

          updatedAt:
            new Date()
              .toISOString(),
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| Processor
|--------------------------------------------------------------------------
*/

export const stripeTransferReversalProcessor = {
  async process(
    input:
      ProcessStripeTransferReversalInput
  ): Promise<
    ProcessStripeTransferReversalResult
  > {
    const refundId =
      requireIdentifier(
        input.refundId,
        "Refund ID"
      );

    const recipientType =
      requireRecipientType(
        input.recipientType
      );

    const refundReference =
      getFirestore("default")
        .collection(COLLECTION)
        .doc(refundId);

    let claimed:
      ClaimedTransferReversal | null =
        null;

    let stripeReversalSucceeded =
      false;

    try {
      const claim =
        await claimReversal(
          refundReference,
          recipientType
        );

      claimed =
        claim.claimed;

      if (
        claim.alreadyCompleted
      ) {
        return {
          refundId,

          recipientType,

          recipientId:
            claimed
              .reversal
              .recipientId,

          transferId:
            claimed
              .reversal
              .transferId,

          stripeTransferId:
            claimed
              .reversal
              .stripeTransferId,

          stripeReversalId:
            requireStripeReversalId(
              claimed
                .reversal
                .stripeReversalId
            ),

          amount:
            claimed
              .reversal
              .amount,

          alreadyCompleted:
            true,
        };
      }

      const stripeTransferId =
        requireStripeTransferId(
          claimed
            .reversal
            .stripeTransferId
        );

      const idempotencyKey =
        createStripeReversalIdempotencyKey(
          refundId,
          recipientType
        );

      const stripeReversal =
        await input.stripe
          .transfers
          .createReversal(
            stripeTransferId,
            {
              amount:
                claimed
                  .reversal
                  .amount,

              description:
                `LIA ${recipientType} reversal for refund ${refundId}`,

              metadata: {
                liaRefundId:
                  refundId,

                liaOrderId:
                  claimed
                    .refund
                    .orderId,

                liaRecipientType:
                  recipientType,

                liaRecipientId:
                  claimed
                    .reversal
                    .recipientId,

                liaTransferId:
                  claimed
                    .reversal
                    .transferId,
              },
            },
            {
              idempotencyKey,
            }
          );

      stripeReversalSucceeded =
        true;

      await saveCompletedReversal(
        refundReference,
        recipientType,
        stripeReversal.id
      );

      return {
        refundId,

        recipientType,

        recipientId:
          claimed
            .reversal
            .recipientId,

        transferId:
          claimed
            .reversal
            .transferId,

        stripeTransferId,

        stripeReversalId:
          stripeReversal.id,

        amount:
          claimed
            .reversal
            .amount,

        alreadyCompleted:
          false,
      };
    } catch (
      error: unknown
    ) {
      if (!claimed) {
        throw error;
      }

      /*
       * Once Stripe confirms the reversal, never change it back to failed
       * because a later Firestore update did not finish.
       */
      if (
        stripeReversalSucceeded
      ) {
        throw new StripeTransferReversalProcessorError(
          "POST_REVERSAL_STATE_FAILED",
          "Stripe completed the transfer reversal, but LIA could not finish recording its state.",
          getSafeErrorMessage(
            error
          )
        );
      }

      const errorMessage =
        getSafeErrorMessage(
          error
        );

      const nextRetryAt =
        calculateNextRetryAt(
          claimed
            .attemptCount
        );

      try {
        await saveFailedReversal(
          refundReference,
          recipientType,
          errorMessage,
          nextRetryAt
        );
      } catch (
        stateError: unknown
      ) {
        console.error(
          "Unable to record transfer-reversal failure.",
          {
            refundId,

            recipientType,

            originalError:
              errorMessage,

            stateError,
          }
        );
      }

      if (
        error instanceof
        StripeTransferReversalProcessorError
      ) {
        throw error;
      }

      if (
        error instanceof
          Stripe.errors.StripeError
      ) {
        throw new StripeTransferReversalProcessorError(
          "STRIPE_REVERSAL_FAILED",
          "Stripe could not reverse the marketplace transfer.",
          error.message
        );
      }

      throw new StripeTransferReversalProcessorError(
        "REVERSAL_PROCESSING_FAILED",
        "The marketplace transfer reversal could not be processed.",
        errorMessage
      );
    }
  },
};