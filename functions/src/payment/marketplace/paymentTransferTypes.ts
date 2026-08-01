/**
 * ================================================================
 * Marketplace Payment Transfer Types
 * ================================================================
 *
 * A marketplace transfer represents money LIA sends from its Stripe
 * platform account to a connected store or driver account.
 *
 * Important distinction:
 *
 * Settlement
 * ----------
 * Records how much each marketplace participant is entitled to receive.
 *
 * Transfer
 * --------
 * Tracks one payment obligation and its execution through Stripe.
 *
 * One delivered order normally creates:
 *
 * - One store transfer
 * - One driver transfer
 */

/*
|--------------------------------------------------------------------------
| Recipient Type
|--------------------------------------------------------------------------
*/

export type PaymentTransferRecipientType =
  | "store"
  | "driver";

/*
|--------------------------------------------------------------------------
| Transfer Status
|--------------------------------------------------------------------------
*/

export type PaymentTransferStatus =
  | "pending"
  | "eligible"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/*
|--------------------------------------------------------------------------
| Recipient
|--------------------------------------------------------------------------
*/

export interface PaymentTransferRecipient {
  /*
   * Marketplace participant receiving the transfer.
   */
  type:
    PaymentTransferRecipientType;

  /*
   * LIA store or driver document ID.
   */
  id: string;

  /*
   * Stripe connected account receiving the transfer.
   *
   * This value is copied into the immutable transfer obligation so
   * historical payment records remain auditable even if the profile
   * changes later.
   */
  stripeAccountId: string;
}

/*
|--------------------------------------------------------------------------
| Stripe Transfer Source
|--------------------------------------------------------------------------
|
| A customer payment is created on LIA's platform account.
|
| After delivery, both the store and driver transfers are associated
| with the original Stripe charge.
|
*/

export interface PaymentTransferSource {
  /*
   * Stripe PaymentIntent associated with the customer payment.
   *
   * Example:
   * pi_123
   */
  stripePaymentIntentId: string;

  /*
   * Stripe charge that funded this marketplace transaction.
   *
   * This is the value later supplied to Stripe as source_transaction.
   *
   * Example:
   * ch_123
   */
  stripeChargeId: string;

  /*
   * Shared order-level transfer group.
   *
   * Both the store and driver transfers use the same transfer group.
   *
   * Example:
   * lia_order_order123
   */
  transferGroup: string;
}

/*
|--------------------------------------------------------------------------
| Marketplace Transfer
|--------------------------------------------------------------------------
*/

export interface MarketplacePaymentTransfer {
  /*
   * Deterministic Firestore document ID.
   *
   * Examples:
   *
   * settlement123_store
   * settlement123_driver
   */
  id: string;

  /*
   * Settlement that created this financial obligation.
   */
  settlementId: string;

  /*
   * LIA order associated with the transfer.
   */
  orderId: string;

  /*
   * Recipient information.
   */
  recipient:
    PaymentTransferRecipient;

  /*
   * Customer-payment source associated with this transfer.
   */
  source:
    PaymentTransferSource;

  /*
   * Amount in the smallest currency unit.
   *
   * For USD:
   *
   * 100 = $1.00
   */
  amount: number;

  /*
   * LIA currently supports USD only.
   */
  currency: "usd";

  /*
   * Internal transfer lifecycle.
   */
  status:
    PaymentTransferStatus;

  /*
   * Stripe transfer ID.
   *
   * This remains absent until Stripe successfully creates the transfer.
   *
   * Example:
   * tr_123
   */
  stripeTransferId?: string;

  /*
   * Deterministic Stripe request idempotency key.
   *
   * This prevents network retries from creating duplicate Stripe
   * transfers.
   */
  stripeIdempotencyKey: string;

  /*
   * Number of Stripe processing attempts.
   */
  attemptCount: number;

  /*
   * Safe summary of the most recent failure.
   */
  lastError?: string;

  /*
   * Earliest time another automatic attempt may run.
   */
  nextRetryAt?: string;

  /*
   * Creation timestamp.
   */
  createdAt: string;

  /*
   * Most recent update timestamp.
   */
  updatedAt: string;

  /*
   * Successful completion timestamp.
   */
  completedAt?: string;
}

/*
|--------------------------------------------------------------------------
| Create Transfer Input
|--------------------------------------------------------------------------
*/

export interface CreateMarketplacePaymentTransferInput {
  settlementId: string;

  orderId: string;

  recipient:
    PaymentTransferRecipient;

  source:
    PaymentTransferSource;

  amount: number;

  currency: "usd";
}