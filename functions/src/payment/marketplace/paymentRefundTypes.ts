/*
|--------------------------------------------------------------------------
| Marketplace Payment Refund Types
|--------------------------------------------------------------------------
|
| Defines LIA's internal refund domain.
|
| A refund represents money returned to the customer.
|
| A transfer reversal represents money recovered from a connected store
| or driver account after that participant was already paid.
|
| Marketplace decides:
|
| - How much the customer receives
| - Which participant allocations are affected
| - Whether transfer reversals are required
|
| Stripe executes:
|
| - Customer refunds
| - Store transfer reversals
| - Driver transfer reversals
|
*/

/*
|--------------------------------------------------------------------------
| Refund Status
|--------------------------------------------------------------------------
*/

export type MarketplaceRefundStatus =
  | "pending"
  | "eligible"
  | "processing"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

/*
|--------------------------------------------------------------------------
| Refund Reason
|--------------------------------------------------------------------------
*/

export type MarketplaceRefundReason =
  | "customer_cancelled"
  | "store_cancelled"
  | "delivery_failed"
  | "missing_items"
  | "incorrect_items"
  | "damaged_items"
  | "quality_issue"
  | "duplicate_charge"
  | "fraudulent_payment"
  | "admin_adjustment"
  | "other";

/*
|--------------------------------------------------------------------------
| Refund Scope
|--------------------------------------------------------------------------
|
| full:
|   Refunds the complete customer payment.
|
| partial:
|   Refunds only selected amounts.
|
*/

export type MarketplaceRefundScope =
  | "full"
  | "partial";

/*
|--------------------------------------------------------------------------
| Participant Reversal
|--------------------------------------------------------------------------
*/

export interface MarketplaceRefundReversal {
  /*
   * Marketplace participant whose prior transfer may need reversal.
   */
  recipientType:
    | "store"
    | "driver";

  /*
   * LIA store or driver document ID.
   */
  recipientId: string;

  /*
   * Original internal payment-transfer document ID.
   */
  transferId: string;

  /*
   * Original Stripe transfer ID.
   */
  stripeTransferId: string;

  /*
   * Amount LIA intends to reverse in cents.
   */
  amount: number;

  /*
   * Stripe transfer-reversal ID after successful execution.
   */
  stripeReversalId?: string;

  /*
   * Reversal execution status.
   */
  status:
    | "not_required"
    | "pending"
    | "processing"
    | "completed"
    | "failed";

  /*
   * Safe summary of the most recent reversal failure.
   */
  lastError?: string;

  /*
   * Number of reversal attempts.
   */
  attemptCount: number;
}

/*
|--------------------------------------------------------------------------
| Refund Allocation
|--------------------------------------------------------------------------
|
| Describes which original payment components are being returned.
|
| All amounts use cents.
|
*/

export interface MarketplaceRefundAllocation {
  merchandiseAmount: number;

  taxAmount: number;

  deliveryFeeAmount: number;

  serviceFeeAmount: number;

  driverTipAmount: number;

  /*
   * Total amount returned to the customer.
   */
  totalAmount: number;

  /*
   * Amount reducing the store's original earnings.
   */
  storeReversalAmount: number;

  /*
   * Amount reducing the driver's original earnings.
   */
  driverReversalAmount: number;

  /*
   * Amount absorbed from LIA's retained revenue.
   */
  platformRevenueReductionAmount: number;
}

/*
|--------------------------------------------------------------------------
| Marketplace Refund
|--------------------------------------------------------------------------
*/

export interface MarketplacePaymentRefund {
  /*
   * Firestore refund document ID.
   */
  id: string;

  /*
   * Original LIA order.
   */
  orderId: string;

  /*
   * Customer claim that authorized this refund, when applicable.
   */
  sourceClaimId?: string;

  /*
   * Original marketplace settlement, when one exists.
   *
   * An order cancelled before delivery may not yet have a settlement.
   */
  settlementId?: string;

  /*
   * Stripe PaymentIntent associated with the customer payment.
   */
  stripePaymentIntentId: string;

  /*
   * Stripe Charge associated with the customer payment.
   */
  stripeChargeId: string;

  /*
   * Stripe Refund ID after customer refund execution.
   */
  stripeRefundId?: string;

  /*
   * Stripe automatically creates the Tax reversal because the original
   * PaymentIntent is linked to a Stripe Tax calculation. LIA reconciles the
   * asynchronous association and stores the committed transaction IDs.
   */
  taxReversal?: {
    provider: "stripe_tax_payment_intent";
    automatic: true;
    status: "pending" | "committed" | "failed" | "not_applicable";
    calculationId?: string;
    originalTransactionId?: string;
    reversalTransactionId?: string;
    checkedAt?: string;
    error?: string;
  };

  /*
   * Full or partial refund.
   */
  scope:
    MarketplaceRefundScope;

  /*
   * Business reason for the refund.
   */
  reason:
    MarketplaceRefundReason;

  /*
   * Human-readable internal explanation.
   *
   * This must not contain sensitive card or identity information.
   */
  note?: string;

  /*
   * Immutable financial allocation for this refund.
   */
  allocation:
    MarketplaceRefundAllocation;

  /*
   * Store and driver transfer reversals.
   */
  reversals:
    MarketplaceRefundReversal[];

  /*
   * Refund lifecycle.
   */
  status:
    MarketplaceRefundStatus;

  /*
   * Deterministic Stripe refund idempotency key.
   */
  stripeIdempotencyKey: string;

  /*
   * Number of refund-processing attempts.
   */
  attemptCount: number;

  /*
   * Most recent safe failure summary.
   */
  lastError?: string;

  /*
   * Earliest time another retry may execute.
   */
  nextRetryAt?: string;

  /*
   * Firebase UID or trusted admin identity that requested the refund.
   */
  requestedBy: string;

  /*
   * ISO timestamps.
   */
  createdAt: string;

  updatedAt: string;

  completedAt?: string;
}

/*
|--------------------------------------------------------------------------
| Create Refund Input
|--------------------------------------------------------------------------
|
| This input must be created only by trusted server-side code.
|
| The browser must never calculate refund amounts.
|
*/

export interface CreateMarketplacePaymentRefundInput {
  orderId: string;

  scope:
    MarketplaceRefundScope;

  reason:
    MarketplaceRefundReason;

  note?: string;

  /*
   * Required only for partial refunds.
   *
   * The future refund-allocation service will validate these requested
   * component amounts against the original trusted order.
   */
  requestedAmounts?: {
    merchandiseAmount?: number;

    taxAmount?: number;

    deliveryFeeAmount?: number;

    serviceFeeAmount?: number;

    driverTipAmount?: number;
  };

  requestedBy: string;
}
