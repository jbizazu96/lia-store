/*
|--------------------------------------------------------------------------
| Marketplace Refund Allocation Service
|--------------------------------------------------------------------------
|
| Calculates how a customer refund affects:
|
| - The customer
| - The store
| - The driver
| - LIA's retained revenue
|
| This service is pure business logic.
|
| It does not:
|
| - Read Firestore
| - Write Firestore
| - Call Stripe
| - Reverse transfers
| - Issue customer refunds
|
| All monetary values are integer cents.
|
*/

import type {
  MarketplaceRefundAllocation,
  MarketplaceRefundScope,
} from "./paymentRefundTypes";

import {
  calculatePaymentAllocation,
} from "./paymentAllocationService";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface PaymentRefundAllocationInput {
  scope:
    MarketplaceRefundScope;

  originalPayment: {
    merchandiseAmount: number;

    taxAmount: number;

    deliveryFeeAmount: number;

    serviceFeeAmount: number;

    driverTipAmount: number;

    totalAmount: number;
  };

  /*
   * Immutable values captured with the original order/settlement. Refunds
   * must never use the marketplace policy that happens to be active today.
   */
  allocationPolicy: {
    storeCommissionBasisPoints: number;
    driverCommissionBasisPoints: number;
    freeDeliveryMinimumCents: number;
    freeDeliveryDriverIncentiveWithoutTipCents: number;
    freeDeliveryDriverIncentiveWithTipCents: number;
  };

  /*
   * Required for partial refunds.
   *
   * Omitted component amounts default to zero.
   */
  requestedAmounts?: {
    merchandiseAmount?: number;

    taxAmount?: number;

    deliveryFeeAmount?: number;

    serviceFeeAmount?: number;

    driverTipAmount?: number;
  };
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export type PaymentRefundAllocationErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_TOTAL"
  | "MISSING_PARTIAL_AMOUNTS"
  | "REFUND_EXCEEDS_ORIGINAL"
  | "EMPTY_PARTIAL_REFUND"
  | "ALLOCATION_MISMATCH";

export class PaymentRefundAllocationError extends Error {
  readonly code:
    PaymentRefundAllocationErrorCode;

  constructor(
    code:
      PaymentRefundAllocationErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PaymentRefundAllocationError";

    this.code =
      code;
  }
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function requireNonNegativeInteger(
  value: unknown,
  fieldName: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new PaymentRefundAllocationError(
      "INVALID_AMOUNT",
      `${fieldName} must be a non-negative integer amount.`
    );
  }

  return value;
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
    throw new PaymentRefundAllocationError(
      "INVALID_TOTAL",
      `${fieldName} must be a positive integer amount.`
    );
  }

  return value;
}

function getOptionalRefundAmount(
  value: unknown,
  fieldName: string
): number {
  if (
    value === undefined
  ) {
    return 0;
  }

  return requireNonNegativeInteger(
    value,
    fieldName
  );
}

function assertDoesNotExceed(
  requestedAmount: number,
  originalAmount: number,
  fieldName: string
): void {
  if (
    requestedAmount >
    originalAmount
  ) {
    throw new PaymentRefundAllocationError(
      "REFUND_EXCEEDS_ORIGINAL",
      `${fieldName} exceeds the original paid amount.`
    );
  }
}

/*
|--------------------------------------------------------------------------
| Original Payment Validation
|--------------------------------------------------------------------------
*/

function validateOriginalPayment(
  input:
    PaymentRefundAllocationInput["originalPayment"]
): PaymentRefundAllocationInput["originalPayment"] {
  const originalPayment = {
    merchandiseAmount:
      requireNonNegativeInteger(
        input.merchandiseAmount,
        "Original merchandise amount"
      ),

    taxAmount:
      requireNonNegativeInteger(
        input.taxAmount,
        "Original tax amount"
      ),

    deliveryFeeAmount:
      requireNonNegativeInteger(
        input.deliveryFeeAmount,
        "Original delivery-fee amount"
      ),

    serviceFeeAmount:
      requireNonNegativeInteger(
        input.serviceFeeAmount,
        "Original service-fee amount"
      ),

    driverTipAmount:
      requireNonNegativeInteger(
        input.driverTipAmount,
        "Original driver-tip amount"
      ),

    totalAmount:
      requirePositiveInteger(
        input.totalAmount,
        "Original total amount"
      ),
  };

  const calculatedTotal =
    originalPayment
      .merchandiseAmount +
    originalPayment
      .taxAmount +
    originalPayment
      .deliveryFeeAmount +
    originalPayment
      .serviceFeeAmount +
    originalPayment
      .driverTipAmount;

  if (
    calculatedTotal !==
    originalPayment.totalAmount
  ) {
    throw new PaymentRefundAllocationError(
      "INVALID_TOTAL",
      "The original payment components do not equal the original total."
    );
  }

  return originalPayment;
}

/*
|--------------------------------------------------------------------------
| Refund Component Resolution
|--------------------------------------------------------------------------
*/

function resolveRefundComponents(
  input:
    PaymentRefundAllocationInput,
  originalPayment:
    PaymentRefundAllocationInput[
      "originalPayment"
    ]
): {
  merchandiseAmount: number;

  taxAmount: number;

  deliveryFeeAmount: number;

  serviceFeeAmount: number;

  driverTipAmount: number;
} {
  if (
    input.scope ===
    "full"
  ) {
    return {
      merchandiseAmount:
        originalPayment
          .merchandiseAmount,

      taxAmount:
        originalPayment
          .taxAmount,

      deliveryFeeAmount:
        originalPayment
          .deliveryFeeAmount,

      serviceFeeAmount:
        originalPayment
          .serviceFeeAmount,

      driverTipAmount:
        originalPayment
          .driverTipAmount,
    };
  }

  if (
    !input.requestedAmounts
  ) {
    throw new PaymentRefundAllocationError(
      "MISSING_PARTIAL_AMOUNTS",
      "Partial refunds require requested component amounts."
    );
  }

  const requested = {
    merchandiseAmount:
      getOptionalRefundAmount(
        input.requestedAmounts
          .merchandiseAmount,
        "Refund merchandise amount"
      ),

    taxAmount:
      getOptionalRefundAmount(
        input.requestedAmounts
          .taxAmount,
        "Refund tax amount"
      ),

    deliveryFeeAmount:
      getOptionalRefundAmount(
        input.requestedAmounts
          .deliveryFeeAmount,
        "Refund delivery-fee amount"
      ),

    serviceFeeAmount:
      getOptionalRefundAmount(
        input.requestedAmounts
          .serviceFeeAmount,
        "Refund service-fee amount"
      ),

    driverTipAmount:
      getOptionalRefundAmount(
        input.requestedAmounts
          .driverTipAmount,
        "Refund driver-tip amount"
      ),
  };

  assertDoesNotExceed(
    requested.merchandiseAmount,
    originalPayment
      .merchandiseAmount,
    "Refund merchandise amount"
  );

  assertDoesNotExceed(
    requested.taxAmount,
    originalPayment
      .taxAmount,
    "Refund tax amount"
  );

  assertDoesNotExceed(
    requested.deliveryFeeAmount,
    originalPayment
      .deliveryFeeAmount,
    "Refund delivery-fee amount"
  );

  assertDoesNotExceed(
    requested.serviceFeeAmount,
    originalPayment
      .serviceFeeAmount,
    "Refund service-fee amount"
  );

  assertDoesNotExceed(
    requested.driverTipAmount,
    originalPayment
      .driverTipAmount,
    "Refund driver-tip amount"
  );

  const totalRequested =
    requested.merchandiseAmount +
    requested.taxAmount +
    requested.deliveryFeeAmount +
    requested.serviceFeeAmount +
    requested.driverTipAmount;

  if (
    totalRequested <= 0
  ) {
    throw new PaymentRefundAllocationError(
      "EMPTY_PARTIAL_REFUND",
      "A partial refund must return at least one cent."
    );
  }

  return requested;
}

/*
|--------------------------------------------------------------------------
| Calculate Refund Allocation
|--------------------------------------------------------------------------
*/

export function calculatePaymentRefundAllocation(
  input:
    PaymentRefundAllocationInput
): MarketplaceRefundAllocation {
  const originalPayment =
    validateOriginalPayment(
      input.originalPayment
    );

  const refundComponents =
    resolveRefundComponents(
      input,
      originalPayment
    );

  /*
   * Reuse the same marketplace commission rules used by the original
   * customer payment.
   *
   * This guarantees that refunds reverse the same financial percentages
   * used when the order allocation was created.
   */
  const refundedAllocation =
    calculatePaymentAllocation({
      ...input.allocationPolicy,
      merchandiseSubtotal:
        refundComponents
          .merchandiseAmount,

      salesTax:
        refundComponents
          .taxAmount,

      deliveryFee:
        refundComponents
          .deliveryFeeAmount,

      driverTip:
        refundComponents
          .driverTipAmount,

      serviceFee:
        refundComponents
          .serviceFeeAmount,
    });

  const totalAmount =
    refundComponents
      .merchandiseAmount +
    refundComponents
      .taxAmount +
    refundComponents
      .deliveryFeeAmount +
    refundComponents
      .serviceFeeAmount +
    refundComponents
      .driverTipAmount;

  const storeReversalAmount =
    refundedAllocation
      .store
      .transferAmount;

  const driverReversalAmount =
    refundedAllocation
      .driver
      .transferAmount;

  const platformRevenueReductionAmount =
    refundedAllocation
      .platform
      .totalRevenue;

  /*
   * Every refunded cent must reduce exactly one original destination:
   *
   * - Store earnings
   * - Driver earnings
   * - LIA revenue
   */
  const allocatedRefundTotal =
    storeReversalAmount +
    driverReversalAmount +
    platformRevenueReductionAmount;

  if (
    allocatedRefundTotal !==
    totalAmount
  ) {
    throw new PaymentRefundAllocationError(
      "ALLOCATION_MISMATCH",
      "The refund allocation does not account for the complete refund amount."
    );
  }

  return {
    merchandiseAmount:
      refundComponents
        .merchandiseAmount,

    taxAmount:
      refundComponents
        .taxAmount,

    deliveryFeeAmount:
      refundComponents
        .deliveryFeeAmount,

    serviceFeeAmount:
      refundComponents
        .serviceFeeAmount,

    driverTipAmount:
      refundComponents
        .driverTipAmount,

    totalAmount,

    storeReversalAmount,

    driverReversalAmount,

    platformRevenueReductionAmount,
  };
}

/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isPaymentRefundAllocationError(
  error: unknown
): error is PaymentRefundAllocationError {
  return (
    error instanceof
    PaymentRefundAllocationError
  );
}
