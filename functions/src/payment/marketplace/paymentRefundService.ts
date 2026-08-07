/*
|--------------------------------------------------------------------------
| Marketplace Payment Refund Service
|--------------------------------------------------------------------------
|
| Creates and manages LIA's internal customer-refund obligations.
|
| This service does not call Stripe.
|
| Responsibilities:
|
| - Create deterministic refund records
| - Support multiple partial refunds for one order
| - Preserve the trusted PaymentIntent and Charge relationship
| - Preserve the immutable refund allocation
| - Preserve required store and driver transfer reversals
| - Reject conflicting retries
| - Track refund processing, completion, and failure state
|
| Marketplace decides.
| Stripe executes.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  MarketplacePaymentRefund,
  MarketplaceRefundAllocation,
  MarketplaceRefundReason,
  MarketplaceRefundReversal,
  MarketplaceRefundScope,
  MarketplaceRefundStatus,
} from "./paymentRefundTypes";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const COLLECTION =
  "paymentRefunds";

/*
|--------------------------------------------------------------------------
| Create Input
|--------------------------------------------------------------------------
|
| This input must come only from trusted server-side refund orchestration.
|
| refundKey
| ---------
| Identifies one refund request within an order.
|
| Examples:
|
| full_cancellation
| missing_item_product123
| admin_adjustment_case456
|
| Retrying the same business refund must reuse the same refundKey.
|
*/

export interface CreateMarketplaceRefundInput {
  orderId: string;

  sourceClaimId?: string;

  /*
   * Stable identity for this refund within the order.
   */
  refundKey: string;

  settlementId?: string;

  stripePaymentIntentId: string;

  stripeChargeId: string;

  scope:
    MarketplaceRefundScope;

  reason:
    MarketplaceRefundReason;

  note?: string;

  allocation:
    MarketplaceRefundAllocation;

  reversals:
    MarketplaceRefundReversal[];

  requestedBy: string;
}

/*
|--------------------------------------------------------------------------
| Create Result
|--------------------------------------------------------------------------
*/

export interface CreateMarketplaceRefundResult {
  refundId: string;

  created: boolean;

  refund:
    MarketplacePaymentRefund;
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export type PaymentRefundServiceErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_PAYMENT_INTENT"
  | "INVALID_CHARGE"
  | "INVALID_AMOUNT"
  | "INVALID_ALLOCATION"
  | "INVALID_REVERSAL"
  | "DUPLICATE_RECIPIENT_REVERSAL"
  | "REFUND_CONFLICT"
  | "REFUND_NOT_FOUND"
  | "INVALID_REFUND_STATUS"
  | "UNSUPPORTED_CURRENCY";

export class PaymentRefundServiceError extends Error {
  readonly code:
    PaymentRefundServiceErrorCode;

  constructor(
    code:
      PaymentRefundServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PaymentRefundServiceError";

    this.code =
      code;
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
    throw new PaymentRefundServiceError(
      "INVALID_ARGUMENT",
      `${fieldName} is required.`
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_ARGUMENT",
      `${fieldName} contains invalid characters.`
    );
  }

  return normalized;
}

function requireOptionalIdentifier(
  value: string | undefined,
  fieldName: string
): string | undefined {
  if (
    value === undefined
  ) {
    return undefined;
  }

  return requireIdentifier(
    value,
    fieldName
  );
}

function requireNonNegativeInteger(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_AMOUNT",
      `${fieldName} must be a non-negative integer amount.`
    );
  }

  return value;
}

function requirePositiveInteger(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_AMOUNT",
      `${fieldName} must be a positive integer amount.`
    );
  }

  return value;
}

function requireStripePaymentIntentId(
  value: string
): string {
  const normalized =
    requireIdentifier(
      value,
      "Stripe PaymentIntent ID"
    );

  if (
    !normalized.startsWith(
      "pi_"
    )
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_PAYMENT_INTENT",
      "The Stripe PaymentIntent ID is invalid."
    );
  }

  return normalized;
}

function requireStripeChargeId(
  value: string
): string {
  const normalized =
    requireIdentifier(
      value,
      "Stripe Charge ID"
    );

  if (
    !normalized.startsWith(
      "ch_"
    )
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_CHARGE",
      "The Stripe Charge ID is invalid."
    );
  }

  return normalized;
}

function normalizeOptionalNote(
  value: string | undefined
): string | undefined {
  if (
    typeof value !== "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(
    0,
    1_000
  );
}

/*
|--------------------------------------------------------------------------
| Deterministic Refund Identity
|--------------------------------------------------------------------------
|
| One order may have multiple refunds.
|
| The refundKey distinguishes those obligations while preserving safe
| idempotency for retries of the same business action.
|
| Example:
|
| order123_missing_item_product456
|
*/

export function createRefundDocumentId(
  orderIdInput: string,
  refundKeyInput: string
): string {
  const orderId =
    requireIdentifier(
      orderIdInput,
      "Order ID"
    );

  const refundKey =
    requireIdentifier(
      refundKeyInput,
      "Refund key"
    );

  return `${orderId}_${refundKey}`;
}

export function createStripeRefundIdempotencyKey(
  refundIdInput: string
): string {
  const refundId =
    requireIdentifier(
      refundIdInput,
      "Refund ID"
    );

  return `lia-marketplace-refund-${refundId}`;
}

/*
|--------------------------------------------------------------------------
| Allocation Validation
|--------------------------------------------------------------------------
*/

function validateRefundAllocation(
  allocation:
    MarketplaceRefundAllocation
): MarketplaceRefundAllocation {
  const normalized:
    MarketplaceRefundAllocation = {
    merchandiseAmount:
      requireNonNegativeInteger(
        allocation
          .merchandiseAmount,
        "Refund merchandise amount"
      ),

    taxAmount:
      requireNonNegativeInteger(
        allocation
          .taxAmount,
        "Refund tax amount"
      ),

    deliveryFeeAmount:
      requireNonNegativeInteger(
        allocation
          .deliveryFeeAmount,
        "Refund delivery-fee amount"
      ),

    serviceFeeAmount:
      requireNonNegativeInteger(
        allocation
          .serviceFeeAmount,
        "Refund service-fee amount"
      ),

    driverTipAmount:
      requireNonNegativeInteger(
        allocation
          .driverTipAmount,
        "Refund driver-tip amount"
      ),

    totalAmount:
      requirePositiveInteger(
        allocation
          .totalAmount,
        "Refund total amount"
      ),

    storeReversalAmount:
      requireNonNegativeInteger(
        allocation
          .storeReversalAmount,
        "Store reversal amount"
      ),

    driverReversalAmount:
      requireNonNegativeInteger(
        allocation
          .driverReversalAmount,
        "Driver reversal amount"
      ),

    platformRevenueReductionAmount:
      requireNonNegativeInteger(
        allocation
          .platformRevenueReductionAmount,
        "Platform revenue reduction amount"
      ),
  };

  const componentTotal =
    normalized
      .merchandiseAmount +
    normalized
      .taxAmount +
    normalized
      .deliveryFeeAmount +
    normalized
      .serviceFeeAmount +
    normalized
      .driverTipAmount;

  if (
    componentTotal !==
    normalized.totalAmount
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_ALLOCATION",
      "Refund components do not equal the customer refund total."
    );
  }

  const destinationReductionTotal =
    normalized
      .storeReversalAmount +
    normalized
      .driverReversalAmount +
    normalized
      .platformRevenueReductionAmount;

  if (
    destinationReductionTotal !==
    normalized.totalAmount
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_ALLOCATION",
      "Refund destination reductions do not equal the customer refund total."
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Reversal Validation
|--------------------------------------------------------------------------
*/

function validateRefundReversals(
  reversals:
    MarketplaceRefundReversal[],
  allocation:
    MarketplaceRefundAllocation
): MarketplaceRefundReversal[] {
  if (
    !Array.isArray(
      reversals
    )
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_REVERSAL",
      "Refund reversals must be an array."
    );
  }

  const normalized:
    MarketplaceRefundReversal[] = [];

  const seenRecipientTypes =
    new Set<
      "store" | "driver"
    >();

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
      throw new PaymentRefundServiceError(
        "INVALID_REVERSAL",
        "Refund reversal recipient type is invalid."
      );
    }

    if (
      seenRecipientTypes.has(
        reversal.recipientType
      )
    ) {
      throw new PaymentRefundServiceError(
        "DUPLICATE_RECIPIENT_REVERSAL",
        `The refund contains more than one ${reversal.recipientType} reversal.`
      );
    }

    seenRecipientTypes.add(
      reversal.recipientType
    );

    const expectedAmount =
      reversal.recipientType ===
      "store"
        ? allocation
            .storeReversalAmount
        : allocation
            .driverReversalAmount;

    const amount =
      requirePositiveInteger(
        reversal.amount,
        `${reversal.recipientType} reversal amount`
      );

    if (
      amount !==
      expectedAmount
    ) {
      throw new PaymentRefundServiceError(
        "INVALID_REVERSAL",
        `The ${reversal.recipientType} reversal does not match the refund allocation.`
      );
    }

    const transferId =
      requireIdentifier(
        reversal.transferId,
        `${reversal.recipientType} transfer ID`
      );

    const stripeTransferId =
      requireIdentifier(
        reversal.stripeTransferId,
        `${reversal.recipientType} Stripe transfer ID`
      );

    if (
      !stripeTransferId.startsWith(
        "tr_"
      )
    ) {
      throw new PaymentRefundServiceError(
        "INVALID_REVERSAL",
        `The ${reversal.recipientType} Stripe transfer ID is invalid.`
      );
    }

    normalized.push({
      recipientType:
        reversal.recipientType,

      recipientId:
        requireIdentifier(
          reversal.recipientId,
          `${reversal.recipientType} recipient ID`
        ),

      transferId,

      stripeTransferId,

      amount,

      status:
        reversal.status,

      attemptCount:
        Number.isSafeInteger(
          reversal.attemptCount
        ) &&
        reversal.attemptCount >= 0
          ? reversal.attemptCount
          : 0,

      ...(reversal.stripeReversalId
        ? {
            stripeReversalId:
              reversal
                .stripeReversalId,
          }
        : {}),

      ...(reversal.lastError
        ? {
            lastError:
              reversal
                .lastError
                .trim()
                .slice(
                  0,
                  1_000
                ),
          }
        : {}),
    });
  }

  const hasStoreReversal =
    normalized.some(
      (
        reversal
      ) =>
        reversal.recipientType ===
        "store"
    );

  const hasDriverReversal =
    normalized.some(
      (
        reversal
      ) =>
        reversal.recipientType ===
        "driver"
    );

  if (
    allocation
      .storeReversalAmount >
      0 &&
    !hasStoreReversal
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_REVERSAL",
      "The refund allocation requires a store transfer reversal."
    );
  }

  if (
    allocation
      .driverReversalAmount >
      0 &&
    !hasDriverReversal
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_REVERSAL",
      "The refund allocation requires a driver transfer reversal."
    );
  }

  if (
    allocation
      .storeReversalAmount ===
      0 &&
    hasStoreReversal
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_REVERSAL",
      "A store reversal was supplied when no store reversal is required."
    );
  }

  if (
    allocation
      .driverReversalAmount ===
      0 &&
    hasDriverReversal
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_REVERSAL",
      "A driver reversal was supplied when no driver reversal is required."
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Conflict Comparison
|--------------------------------------------------------------------------
*/

function serializeImmutableRefundData(
  refund:
    MarketplacePaymentRefund
): string {
  return JSON.stringify({
    orderId:
      refund.orderId,

    settlementId:
      refund.settlementId ??
      null,

    stripePaymentIntentId:
      refund
        .stripePaymentIntentId,

    stripeChargeId:
      refund.stripeChargeId,

    scope:
      refund.scope,

    reason:
      refund.reason,

    note:
      refund.note ??
      null,

    allocation:
      refund.allocation,

    reversals:
      refund.reversals.map(
        (
          reversal
        ) => ({
          recipientType:
            reversal
              .recipientType,

          recipientId:
            reversal
              .recipientId,

          transferId:
            reversal
              .transferId,

          stripeTransferId:
            reversal
              .stripeTransferId,

          amount:
            reversal.amount,
        })
      ),

    requestedBy:
      refund.requestedBy,

    stripeIdempotencyKey:
      refund
        .stripeIdempotencyKey,
  });
}

/*
|--------------------------------------------------------------------------
| Create Refund
|--------------------------------------------------------------------------
*/

export async function createRefund(
  input:
    CreateMarketplaceRefundInput
): Promise<
  CreateMarketplaceRefundResult
> {
  const orderId =
    requireIdentifier(
      input.orderId,
      "Order ID"
    );

  const refundKey =
    requireIdentifier(
      input.refundKey,
      "Refund key"
    );

  const settlementId =
    requireOptionalIdentifier(
      input.settlementId,
      "Settlement ID"
    );

  const sourceClaimId =
    requireOptionalIdentifier(
      input.sourceClaimId,
      "Source claim ID"
    );

  const stripePaymentIntentId =
    requireStripePaymentIntentId(
      input
        .stripePaymentIntentId
    );

  const stripeChargeId =
    requireStripeChargeId(
      input.stripeChargeId
    );

  const requestedBy =
    requireIdentifier(
      input.requestedBy,
      "Refund requester"
    );

  const allocation =
    validateRefundAllocation(
      input.allocation
    );

  const reversals =
    validateRefundReversals(
      input.reversals,
      allocation
    );

  const refundId =
    createRefundDocumentId(
      orderId,
      refundKey
    );

  const stripeIdempotencyKey =
    createStripeRefundIdempotencyKey(
      refundId
    );

  const now =
    new Date()
      .toISOString();

  const proposedRefund:
    MarketplacePaymentRefund = {
    id:
      refundId,

    orderId,

    ...(sourceClaimId
      ? {
          sourceClaimId,
        }
      : {}),

    ...(settlementId
      ? {
          settlementId,
        }
      : {}),

    stripePaymentIntentId,

    stripeChargeId,

    scope:
      input.scope,

    reason:
      input.reason,

    ...(normalizeOptionalNote(
      input.note
    )
      ? {
          note:
            normalizeOptionalNote(
              input.note
            ),
        }
      : {}),

    allocation,

    reversals,

    status:
      "eligible",

    stripeIdempotencyKey,

    attemptCount:
      0,

    requestedBy,

    createdAt:
      now,

    updatedAt:
      now,
  };

  const db =
    getFirestore("default");

  const reference =
    db
      .collection(COLLECTION)
      .doc(refundId);

  return db.runTransaction(
    async (
      transaction
    ) => {
      const snapshot =
        await transaction.get(
          reference
        );

      if (
        snapshot.exists
      ) {
        const existing =
          snapshot.data() as
            MarketplacePaymentRefund;

        const existingImmutableData =
          serializeImmutableRefundData(
            existing
          );

        const proposedImmutableData =
          serializeImmutableRefundData(
            proposedRefund
          );

        if (
          existingImmutableData !==
          proposedImmutableData
        ) {
          throw new PaymentRefundServiceError(
            "REFUND_CONFLICT",
            "An existing refund conflicts with the requested financial obligation."
          );
        }

        return {
          refundId,

          created:
            false,

          refund:
            existing,
        };
      }

      transaction.create(
        reference,
        proposedRefund
      );

      return {
        refundId,

        created:
          true,

        refund:
          proposedRefund,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Read Refund
|--------------------------------------------------------------------------
*/

export async function getRefund(
  refundIdInput: string
): Promise<
  MarketplacePaymentRefund | null
> {
  const refundId =
    requireIdentifier(
      refundIdInput,
      "Refund ID"
    );

  const snapshot =
    await getFirestore("default")
      .collection(COLLECTION)
      .doc(refundId)
      .get();

  if (
    !snapshot.exists
  ) {
    return null;
  }

  return snapshot.data() as
    MarketplacePaymentRefund;
}

/*
|--------------------------------------------------------------------------
| State Updates
|--------------------------------------------------------------------------
*/

async function updateRefundStatus(
  refundIdInput: string,
  status:
    MarketplaceRefundStatus,
  fields:
    Record<string, unknown> = {}
): Promise<void> {
  const refundId =
    requireIdentifier(
      refundIdInput,
      "Refund ID"
    );

  await getFirestore("default")
    .collection(COLLECTION)
    .doc(refundId)
    .update({
      status,

      ...fields,

      updatedAt:
        new Date()
          .toISOString(),
    });
}

export async function markRefundProcessing(
  refundId: string
): Promise<void> {
  await updateRefundStatus(
    refundId,
    "processing",
    {
      attemptCount:
        FieldValue.increment(1),

      lastError:
        FieldValue.delete(),

      nextRetryAt:
        FieldValue.delete(),
    }
  );
}

export async function markRefundCompleted(
  refundId: string,
  stripeRefundId: string
): Promise<void> {
  const normalizedStripeRefundId =
    requireIdentifier(
      stripeRefundId,
      "Stripe refund ID"
    );

  if (
    !normalizedStripeRefundId.startsWith(
      "re_"
    )
  ) {
    throw new PaymentRefundServiceError(
      "INVALID_ARGUMENT",
      "The Stripe refund ID is invalid."
    );
  }

  const now =
    new Date()
      .toISOString();

  await updateRefundStatus(
    refundId,
    "completed",
    {
      stripeRefundId:
        normalizedStripeRefundId,

      completedAt:
        now,

      lastError:
        FieldValue.delete(),

      nextRetryAt:
        FieldValue.delete(),
    }
  );
}

export async function markRefundPartiallyCompleted(
  refundId: string,
  stripeRefundId?: string
): Promise<void> {
  await updateRefundStatus(
    refundId,
    "partially_completed",
    {
      ...(stripeRefundId
        ? {
            stripeRefundId,
          }
        : {}),

      lastError:
        FieldValue.delete(),

      nextRetryAt:
        FieldValue.delete(),
    }
  );
}

export async function markRefundFailed(
  refundId: string,
  errorMessage: string,
  nextRetryAt?: string
): Promise<void> {
  const normalizedError =
    errorMessage.trim() ||
    "Unknown marketplace refund failure.";

  await updateRefundStatus(
    refundId,
    "failed",
    {
      lastError:
        normalizedError
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
              FieldValue.delete(),
          }),
    }
  );
}
