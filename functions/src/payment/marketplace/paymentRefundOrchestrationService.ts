/*
|--------------------------------------------------------------------------
| Marketplace Payment Refund Orchestration Service
|--------------------------------------------------------------------------
|
| Coordinates one trusted marketplace refund from internal obligation
| through connected-account transfer reversals and customer refund.
|
| Processing order:
|
| 1. Load the trusted refund obligation
| 2. Reverse the store transfer when required
| 3. Reverse the driver transfer when required
| 4. Refund the customer only after required reversals complete
| 5. Record immutable refund ledger events
|
| This service does not calculate refund amounts.
| It does not create refund obligations.
|
| Marketplace decides.
| Stripe executes.
|
*/

import Stripe from "stripe";

import type {
  MarketplacePaymentRefund,
  MarketplaceRefundReversal,
} from "./paymentRefundTypes";

import {
  createLedgerEntry,
} from "./paymentLedgerService";

import {
  getRefund,
} from "./paymentRefundService";

import {
  stripeTransferReversalProcessor,
} from "../stripe/stripeTransferReversalProcessor";

import {
  stripePaymentRefundProcessor,
} from "../stripe/stripePaymentRefundProcessor";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface ProcessMarketplaceRefundInput {
  refundId: string;

  stripe: Stripe;
}

/*
|--------------------------------------------------------------------------
| Reversal Result
|--------------------------------------------------------------------------
*/

export interface MarketplaceRefundReversalProcessingResult {
  recipientType:
    "store" | "driver";

  required: boolean;

  processed: boolean;

  completed: boolean;

  alreadyCompleted: boolean;

  stripeReversalId:
    string | null;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface ProcessMarketplaceRefundResult {
  refundId: string;

  orderId: string;

  storeReversal:
    MarketplaceRefundReversalProcessingResult;

  driverReversal:
    MarketplaceRefundReversalProcessingResult;

  customerRefund: {
    processed: boolean;

    completed: boolean;

    alreadyCreated: boolean;

    stripeRefundId:
      string | null;

    stripeRefundStatus:
      string | null;
  };
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export type PaymentRefundOrchestrationErrorCode =
  | "INVALID_ARGUMENT"
  | "REFUND_NOT_FOUND"
  | "INVALID_REFUND"
  | "REVERSAL_PROCESSING_FAILED"
  | "CUSTOMER_REFUND_FAILED"
  | "REFUND_ORCHESTRATION_FAILED";

export class PaymentRefundOrchestrationError extends Error {
  readonly code:
    PaymentRefundOrchestrationErrorCode;

  readonly causeMessage:
    string | null;

  constructor(
    code:
      PaymentRefundOrchestrationErrorCode,
    message: string,
    causeMessage?: string
  ) {
    super(message);

    this.name =
      "PaymentRefundOrchestrationError";

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
    throw new PaymentRefundOrchestrationError(
      "INVALID_ARGUMENT",
      `${fieldName} is required.`
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentRefundOrchestrationError(
      "INVALID_ARGUMENT",
      `${fieldName} contains invalid characters.`
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

  return "Unknown marketplace refund orchestration failure.";
}

/*
|--------------------------------------------------------------------------
| Refund Validation
|--------------------------------------------------------------------------
*/

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

  if (
    !refund.allocation ||
    !Number.isSafeInteger(
      refund.allocation
        .totalAmount
    ) ||
    refund.allocation
      .totalAmount <= 0
  ) {
    throw new PaymentRefundOrchestrationError(
      "INVALID_REFUND",
      "The marketplace refund amount is invalid."
    );
  }

  if (
    !Array.isArray(
      refund.reversals
    )
  ) {
    throw new PaymentRefundOrchestrationError(
      "INVALID_REFUND",
      "The marketplace refund reversals are invalid."
    );
  }

  return refund;
}

/*
|--------------------------------------------------------------------------
| Reversal Lookup
|--------------------------------------------------------------------------
*/

function findReversal(
  refund:
    MarketplacePaymentRefund,
  recipientType:
    "store" | "driver"
): MarketplaceRefundReversal | null {
  return (
    refund.reversals.find(
      (
        reversal
      ) =>
        reversal
          .recipientType ===
        recipientType
    ) ??
    null
  );
}

/*
|--------------------------------------------------------------------------
| Not Required Result
|--------------------------------------------------------------------------
*/

function buildNotRequiredResult(
  recipientType:
    "store" | "driver"
): MarketplaceRefundReversalProcessingResult {
  return {
    recipientType,

    required:
      false,

    processed:
      false,

    completed:
      true,

    alreadyCompleted:
      true,

    stripeReversalId:
      null,
  };
}

/*
|--------------------------------------------------------------------------
| Process One Reversal
|--------------------------------------------------------------------------
*/

async function processReversal(
  input:
    ProcessMarketplaceRefundInput,
  refund:
    MarketplacePaymentRefund,
  recipientType:
    "store" | "driver"
): Promise<
  MarketplaceRefundReversalProcessingResult
> {
  const reversal =
    findReversal(
      refund,
      recipientType
    );

  /*
   * No reversal document means the original allocation did not require
   * recovery from this participant.
   */
  if (!reversal) {
    return buildNotRequiredResult(
      recipientType
    );
  }

  if (
    reversal.status ===
    "not_required"
  ) {
    return buildNotRequiredResult(
      recipientType
    );
  }

  try {
    const result =
      await stripeTransferReversalProcessor
        .process({
          refundId:
            input.refundId,

          recipientType,

          stripe:
            input.stripe,
        });

    /*
     * The deterministic ledger key ensures retries do not duplicate the
     * financial event.
     */
    await createLedgerEntry({
      orderId:
        refund.orderId,

      event:
        "refund_created",

      eventKey:
        `${recipientType}_transfer_reversal_completed_${refund.id}`,

      amount:
        result.amount,

      description:
        `${recipientType === "store"
          ? "Store"
          : "Driver"} transfer reversal completed for customer refund.`,

      metadata: {
        refundId:
          refund.id,

        recipientType,

        recipientId:
          result.recipientId,

        transferId:
          result.transferId,

        stripeTransferId:
          result.stripeTransferId,

        stripeReversalId:
          result.stripeReversalId,
      },
    });

    return {
      recipientType,

      required:
        true,

      processed:
        true,

      completed:
        true,

      alreadyCompleted:
        result
          .alreadyCompleted,

      stripeReversalId:
        result
          .stripeReversalId,
    };
  } catch (
    error: unknown
  ) {
    throw new PaymentRefundOrchestrationError(
      "REVERSAL_PROCESSING_FAILED",
      `The ${recipientType} transfer reversal could not be completed.`,
      getSafeErrorMessage(
        error
      )
    );
  }
}

/*
|--------------------------------------------------------------------------
| Process Customer Refund
|--------------------------------------------------------------------------
*/

async function processCustomerRefund(
  input:
    ProcessMarketplaceRefundInput,
  refund:
    MarketplacePaymentRefund
): Promise<
  ProcessMarketplaceRefundResult[
    "customerRefund"
  ]
> {
  try {
    const result =
      await stripePaymentRefundProcessor
        .process({
          refundId:
            input.refundId,

          stripe:
            input.stripe,
        });

    /*
     * Stripe may return a pending refund.
     *
     * Write the final refund-completed ledger event only when Stripe reports
     * succeeded.
     */
    if (
      result.completed
    ) {
      await createLedgerEntry({
        orderId:
          refund.orderId,

        event:
          "refund_completed",

        eventKey:
          `refund_completed_${refund.id}`,

        amount:
          result.amount,

        description:
          "Customer Stripe refund completed.",

        metadata: {
          refundId:
            refund.id,

          stripeRefundId:
            result
              .stripeRefundId,

          stripeRefundStatus:
            result
              .stripeRefundStatus,

          scope:
            refund.scope,

          reason:
            refund.reason,

          storeReversalAmount:
            refund
              .allocation
              .storeReversalAmount,

          driverReversalAmount:
            refund
              .allocation
              .driverReversalAmount,

          platformRevenueReductionAmount:
            refund
              .allocation
              .platformRevenueReductionAmount,
        },
      });
    }

    return {
      processed:
        true,

      completed:
        result.completed,

      alreadyCreated:
        result
          .alreadyCreated,

      stripeRefundId:
        result
          .stripeRefundId,

      stripeRefundStatus:
        result
          .stripeRefundStatus,
    };
  } catch (
    error: unknown
  ) {
    throw new PaymentRefundOrchestrationError(
      "CUSTOMER_REFUND_FAILED",
      "The customer refund could not be completed.",
      getSafeErrorMessage(
        error
      )
    );
  }
}

/*
|--------------------------------------------------------------------------
| Orchestration
|--------------------------------------------------------------------------
*/

async function process(
  input:
    ProcessMarketplaceRefundInput
): Promise<
  ProcessMarketplaceRefundResult
> {
  const refundId =
    requireIdentifier(
      input.refundId,
      "Refund ID"
    );

  try {
    /*
    |--------------------------------------------------------------------------
    | Load Trusted Refund
    |--------------------------------------------------------------------------
    */

    const loadedRefund =
      await getRefund(
        refundId
      );

    if (!loadedRefund) {
      throw new PaymentRefundOrchestrationError(
        "REFUND_NOT_FOUND",
        "The marketplace refund was not found."
      );
    }

    const refund =
      validateRefund(
        loadedRefund
      );

    /*
    |--------------------------------------------------------------------------
    | Store Reversal
    |--------------------------------------------------------------------------
    */

    const storeReversal =
      await processReversal(
        input,
        refund,
        "store"
      );

    /*
    |--------------------------------------------------------------------------
    | Driver Reversal
    |--------------------------------------------------------------------------
    |
    | The driver reversal executes only after the store reversal completes.
    |
    | Sequential processing keeps the first implementation predictable and
    | leaves a clear partial-progress record when one participant fails.
    |
    */

    const driverReversal =
      await processReversal(
        input,
        refund,
        "driver"
      );

    /*
    |--------------------------------------------------------------------------
    | Customer Refund
    |--------------------------------------------------------------------------
    |
    | The Stripe customer refund executes only after all required connected-
    | account transfer reversals complete.
    |
    */

    const customerRefund =
      await processCustomerRefund(
        input,
        refund
      );

    return {
      refundId,

      orderId:
        refund.orderId,

      storeReversal,

      driverReversal,

      customerRefund,
    };
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      PaymentRefundOrchestrationError
    ) {
      throw error;
    }

    throw new PaymentRefundOrchestrationError(
      "REFUND_ORCHESTRATION_FAILED",
      "The marketplace refund workflow could not be processed.",
      getSafeErrorMessage(
        error
      )
    );
  }
}

/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isPaymentRefundOrchestrationError(
  error: unknown
): error is PaymentRefundOrchestrationError {
  return (
    error instanceof
    PaymentRefundOrchestrationError
  );
}

/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const paymentRefundOrchestrationService = {
  process,
};