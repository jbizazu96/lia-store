/*
|--------------------------------------------------------------------------
| Stripe Payment Refund Processor
|--------------------------------------------------------------------------
|
| Executes one trusted LIA customer-refund obligation through Stripe.
|
| Responsibilities:
|
| - Load and validate the marketplace refund
| - Confirm every required store and driver transfer reversal completed
| - Atomically claim the customer refund
| - Prevent concurrent workers from refunding the same Charge
| - Create a full or partial Stripe refund
| - Use a deterministic Stripe idempotency key
| - Preserve Stripe-successful or Stripe-pending refunds
| - Record retryable failures safely
|
| This processor does not calculate refund amounts or decide financial
| responsibility.
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
  MarketplaceRefundReason,
  MarketplaceRefundReversal,
} from "../marketplace/paymentRefundTypes";

const COLLECTION =
  "paymentRefunds";

const PROCESSING_LEASE_MINUTES =
  10;

const MAXIMUM_AUTOMATIC_ATTEMPTS =
  3;

export interface ProcessStripePaymentRefundInput {
  refundId: string;

  stripe: Stripe;
}

export interface ProcessStripePaymentRefundResult {
  refundId: string;

  orderId: string;

  stripeRefundId: string;

  stripeRefundStatus: string;

  amount: number;

  currency: "usd";

  alreadyCreated: boolean;

  completed: boolean;
}

interface ClaimedPaymentRefund {
  refund:
    MarketplacePaymentRefund;

  attemptCount: number;
}

export type StripePaymentRefundProcessorErrorCode =
  | "INVALID_ARGUMENT"
  | "REFUND_NOT_FOUND"
  | "INVALID_REFUND"
  | "REVERSALS_NOT_COMPLETED"
  | "REFUND_CANCELLED"
  | "REFUND_ALREADY_PROCESSING"
  | "INVALID_REFUND_STATUS"
  | "MAXIMUM_ATTEMPTS_REACHED"
  | "RETRY_NOT_READY"
  | "STRIPE_REFUND_FAILED"
  | "REFUND_PROCESSING_FAILED"
  | "POST_REFUND_STATE_FAILED";

export class StripePaymentRefundProcessorError extends Error {
  readonly code:
    StripePaymentRefundProcessorErrorCode;

  readonly causeMessage:
    string | null;

  constructor(
    code:
      StripePaymentRefundProcessorErrorCode,
    message: string,
    causeMessage?: string
  ) {
    super(message);

    this.name =
      "StripePaymentRefundProcessorError";

    this.code =
      code;

    this.causeMessage =
      causeMessage ?? null;
  }
}

function requireIdentifier(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_ARGUMENT",
      `${fieldName} is required.`
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_ARGUMENT",
      `${fieldName} contains invalid characters.`
    );
  }

  return normalized;
}

function requireStringField(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      `${fieldName} is missing or invalid.`
    );
  }

  return value.trim();
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
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      `${fieldName} must be a positive integer amount.`
    );
  }

  return value;
}

function requireStripePaymentIntentId(
  value: unknown
): string {
  const normalized =
    requireStringField(
      value,
      "Stripe PaymentIntent ID"
    );

  if (
    !normalized.startsWith(
      "pi_"
    )
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      "The Stripe PaymentIntent ID is invalid."
    );
  }

  return normalized;
}

function requireStripeChargeId(
  value: unknown
): string {
  const normalized =
    requireStringField(
      value,
      "Stripe Charge ID"
    );

  if (
    !normalized.startsWith(
      "ch_"
    )
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      "The Stripe Charge ID is invalid."
    );
  }

  return normalized;
}

function requireStripeRefundId(
  value: unknown
): string {
  const normalized =
    requireStringField(
      value,
      "Stripe refund ID"
    );

  if (
    !normalized.startsWith(
      "re_"
    )
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      "The Stripe refund ID is invalid."
    );
  }

  return normalized;
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

  return "Unknown Stripe customer-refund failure.";
}

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

function mapStripeRefundReason(
  reason:
    MarketplaceRefundReason
):
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer"
  | undefined {
  switch (reason) {
    case "duplicate_charge":
      return "duplicate";

    case "fraudulent_payment":
      return "fraudulent";

    case "customer_cancelled":
      return "requested_by_customer";

    default:
      return undefined;
  }
}

function validateRequiredReversals(
  reversals:
    MarketplaceRefundReversal[]
): void {
  if (
    !Array.isArray(
      reversals
    )
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      "The refund transfer reversals are invalid."
    );
  }

  for (
    const reversal of
    reversals
  ) {
    if (
      reversal.recipientType !==
        "store" &&
      reversal.recipientType !==
        "driver"
    ) {
      throw new StripePaymentRefundProcessorError(
        "INVALID_REFUND",
        "A refund transfer reversal has an invalid recipient type."
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

    const stripeTransferId =
      requireStringField(
        reversal.stripeTransferId,
        "Stripe transfer ID"
      );

    if (
      !stripeTransferId.startsWith(
        "tr_"
      )
    ) {
      throw new StripePaymentRefundProcessorError(
        "INVALID_REFUND",
        "A refund Stripe transfer ID is invalid."
      );
    }

    requirePositiveInteger(
      reversal.amount,
      "Transfer-reversal amount"
    );

    if (
      reversal.status !==
        "completed" &&
      reversal.status !==
        "not_required"
    ) {
      throw new StripePaymentRefundProcessorError(
        "REVERSALS_NOT_COMPLETED",
        `The ${reversal.recipientType} transfer reversal must complete before the customer refund.`
      );
    }

    if (
      reversal.status ===
      "completed"
    ) {
      const stripeReversalId =
        requireStringField(
          reversal.stripeReversalId,
          "Stripe transfer-reversal ID"
        );

      if (
        !stripeReversalId.startsWith(
          "trr_"
        )
      ) {
        throw new StripePaymentRefundProcessorError(
          "INVALID_REFUND",
          "A completed transfer reversal has an invalid Stripe reversal ID."
        );
      }
    }
  }
}

function validateRefund(
  refund:
    MarketplacePaymentRefund
): MarketplacePaymentRefund {
  requireIdentifier(
    refund.id,
    "Refund ID"
  );

  requireIdentifier(
    refund.orderId,
    "Order ID"
  );

  requireIdentifier(
    refund.requestedBy,
    "Refund requester"
  );

  requireStripePaymentIntentId(
    refund.stripePaymentIntentId
  );

  requireStripeChargeId(
    refund.stripeChargeId
  );

  requireIdentifier(
    refund.stripeIdempotencyKey,
    "Stripe refund idempotency key"
  );

  requirePositiveInteger(
    refund.allocation
      ?.totalAmount,
    "Customer refund amount"
  );

  if (
    !Number.isSafeInteger(
      refund.attemptCount
    ) ||
    refund.attemptCount < 0
  ) {
    throw new StripePaymentRefundProcessorError(
      "INVALID_REFUND",
      "The customer-refund attempt count is invalid."
    );
  }

  validateRequiredReversals(
    refund.reversals
  );

  return refund;
}

async function claimRefund(
  refundReference:
    DocumentReference
): Promise<{
  claimed:
    ClaimedPaymentRefund;

  alreadyCreated:
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
        throw new StripePaymentRefundProcessorError(
          "REFUND_NOT_FOUND",
          "The marketplace refund was not found."
        );
      }

      const refund =
        validateRefund(
          snapshot.data() as
            MarketplacePaymentRefund
        );

      if (
        refund.stripeRefundId
      ) {
        requireStripeRefundId(
          refund.stripeRefundId
        );

        return {
          claimed: {
            refund,

            attemptCount:
              refund.attemptCount,
          },

          alreadyCreated:
            true,
        };
      }

      if (
        refund.status ===
        "cancelled"
      ) {
        throw new StripePaymentRefundProcessorError(
          "REFUND_CANCELLED",
          "The marketplace refund was cancelled."
        );
      }

      if (
        refund.status !==
          "eligible" &&
        refund.status !==
          "failed" &&
        refund.status !==
          "processing" &&
        refund.status !==
          "pending"
      ) {
        throw new StripePaymentRefundProcessorError(
          "INVALID_REFUND_STATUS",
          "The customer refund is not eligible for Stripe processing."
        );
      }

      if (
        refund.attemptCount >=
        MAXIMUM_AUTOMATIC_ATTEMPTS
      ) {
        throw new StripePaymentRefundProcessorError(
          "MAXIMUM_ATTEMPTS_REACHED",
          "The customer refund reached the maximum automatic retry limit."
        );
      }

      const operationalRefund =
        refund as
          MarketplacePaymentRefund & {
            processingLeaseUntil?:
              string;
          };

      if (
        refund.status ===
          "failed" &&
        refund.nextRetryAt
      ) {
        const retryTime =
          new Date(
            refund.nextRetryAt
          ).getTime();

        if (
          Number.isFinite(
            retryTime
          ) &&
          retryTime >
            Date.now()
        ) {
          throw new StripePaymentRefundProcessorError(
            "RETRY_NOT_READY",
            "The customer refund is not ready for its next retry."
          );
        }
      }

      if (
        refund.status ===
        "processing"
      ) {
        const leaseUntil =
          operationalRefund
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
            throw new StripePaymentRefundProcessorError(
              "REFUND_ALREADY_PROCESSING",
              "Another worker is currently processing this customer refund."
            );
          }
        }
      }

      const now =
        new Date();

      const attemptCount =
        refund.attemptCount +
        1;

      const processingLeaseUntil =
        new Date(
          now.getTime() +
            PROCESSING_LEASE_MINUTES *
              60 *
              1000
        ).toISOString();

      transaction.update(
        refundReference,
        {
          status:
            "processing",

          attemptCount,

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
        claimed: {
          refund: {
            ...refund,

            status:
              "processing",

            attemptCount,

            updatedAt:
              now.toISOString(),
          },

          attemptCount,
        },

        alreadyCreated:
          false,
      };
    }
  );
}

async function saveStripeRefundState(
  refundReference:
    DocumentReference,
  stripeRefund:
    Stripe.Refund
): Promise<void> {
  const stripeRefundId =
    requireStripeRefundId(
      stripeRefund.id
    );

  const stripeStatus =
    typeof stripeRefund.status ===
      "string"
      ? stripeRefund.status
      : "unknown";

  const now =
    new Date()
      .toISOString();

  const completed =
    stripeStatus ===
    "succeeded";

  const failed =
    stripeStatus ===
      "failed" ||
    stripeStatus ===
      "canceled";

  await refundReference.update({
    stripeRefundId,

    stripeRefundStatus:
      stripeStatus,

    status:
      completed
        ? "completed"
        : failed
          ? "failed"
          : "processing",

    ...(completed
      ? {
          completedAt:
            now,

          taxReversalPending: true,

          taxReversal: {
            provider: "stripe_tax_payment_intent",
            automatic: true,
            status: "pending",
            checkedAt: now,
          },
        }
      : {}),

    ...(failed
      ? {
          lastError:
            stripeRefund
              .failure_reason ??
            "Stripe reported that the customer refund failed.",
        }
      : {
          lastError:
            null,
        }),

    processingStartedAt:
      null,

    processingLeaseUntil:
      null,

    nextRetryAt:
      null,

    updatedAt:
      now,
  });
}

async function saveRefundFailure(
  refundReference:
    DocumentReference,
  errorMessage: string,
  nextRetryAt?: string
): Promise<void> {
  await refundReference.update({
    status:
      "failed",

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
            null,
        }),

    processingStartedAt:
      null,

    processingLeaseUntil:
      null,

    updatedAt:
      new Date()
        .toISOString(),
  });
}

export const stripePaymentRefundProcessor = {
  async process(
    input:
      ProcessStripePaymentRefundInput
  ): Promise<
    ProcessStripePaymentRefundResult
  > {
    const refundId =
      requireIdentifier(
        input.refundId,
        "Refund ID"
      );

    const refundReference =
      getFirestore("default")
        .collection(COLLECTION)
        .doc(refundId);

    let claimed:
      ClaimedPaymentRefund | null =
        null;

    let stripeRefundCreated =
      false;

    try {
      const claim =
        await claimRefund(
          refundReference
        );

      claimed =
        claim.claimed;

      if (
        claim.alreadyCreated
      ) {
        const stripeRefundId =
          requireStripeRefundId(
            claimed
              .refund
              .stripeRefundId
          );

        const storedStripeStatus =
          (
            claimed.refund as
              MarketplacePaymentRefund & {
                stripeRefundStatus?:
                  string;
              }
          ).stripeRefundStatus ??
          (
            claimed.refund.status ===
            "completed"
              ? "succeeded"
              : "pending"
          );

        return {
          refundId,

          orderId:
            claimed
              .refund
              .orderId,

          stripeRefundId,

          stripeRefundStatus:
            storedStripeStatus,

          amount:
            claimed
              .refund
              .allocation
              .totalAmount,

          currency:
            "usd",

          alreadyCreated:
            true,

          completed:
            claimed
              .refund
              .status ===
            "completed",
        };
      }

      const stripeReason =
        mapStripeRefundReason(
          claimed
            .refund
            .reason
        );

      const stripeRefund =
        await input.stripe
          .refunds.create(
            {
              charge:
                claimed
                  .refund
                  .stripeChargeId,

              amount:
                claimed
                  .refund
                  .allocation
                  .totalAmount,

              ...(stripeReason
                ? {
                    reason:
                      stripeReason,
                  }
                : {}),

              metadata: {
                liaRefundId:
                  claimed
                    .refund
                    .id,

                liaOrderId:
                  claimed
                    .refund
                    .orderId,

                liaRefundScope:
                  claimed
                    .refund
                    .scope,

                liaRefundReason:
                  claimed
                    .refund
                    .reason,

                liaRequestedBy:
                  claimed
                    .refund
                    .requestedBy,

                liaPaymentIntentId:
                  claimed
                    .refund
                    .stripePaymentIntentId,
              },
            },
            {
              idempotencyKey:
                claimed
                  .refund
                  .stripeIdempotencyKey,
            }
          );

      stripeRefundCreated =
        true;

      await saveStripeRefundState(
        refundReference,
        stripeRefund
      );

      const stripeStatus =
        typeof stripeRefund.status ===
          "string"
          ? stripeRefund.status
          : "unknown";

      return {
        refundId,

        orderId:
          claimed
            .refund
            .orderId,

        stripeRefundId:
          stripeRefund.id,

        stripeRefundStatus:
          stripeStatus,

        amount:
          claimed
            .refund
            .allocation
            .totalAmount,

        currency:
          "usd",

        alreadyCreated:
          false,

        completed:
          stripeStatus ===
          "succeeded",
      };
    } catch (
      error: unknown
    ) {
      if (!claimed) {
        throw error;
      }

      if (
        stripeRefundCreated
      ) {
        throw new StripePaymentRefundProcessorError(
          "POST_REFUND_STATE_FAILED",
          "Stripe created the customer refund, but LIA could not finish recording its state.",
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
        await saveRefundFailure(
          refundReference,
          errorMessage,
          nextRetryAt
        );
      } catch (
        stateError: unknown
      ) {
        console.error(
          "Unable to record customer-refund failure.",
          {
            refundId,

            originalError:
              errorMessage,

            stateError,
          }
        );
      }

      if (
        error instanceof
        StripePaymentRefundProcessorError
      ) {
        throw error;
      }

      if (
        error instanceof
          Stripe.errors.StripeError
      ) {
        throw new StripePaymentRefundProcessorError(
          "STRIPE_REFUND_FAILED",
          "Stripe could not create the customer refund.",
          error.message
        );
      }

      throw new StripePaymentRefundProcessorError(
        "REFUND_PROCESSING_FAILED",
        "The marketplace customer refund could not be processed.",
        errorMessage
      );
    }
  },
};
