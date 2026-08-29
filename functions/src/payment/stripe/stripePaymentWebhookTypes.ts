/*
|--------------------------------------------------------------------------
| Stripe Payment Webhook Types
|--------------------------------------------------------------------------
|
| Defines LIA's internal model for customer-payment webhook processing.
|
| This webhook is separate from:
|
| stripeConnectWebhook
|
| Connect webhook:
|   Synchronizes store connected-account onboarding and payout status.
|
| Payment webhook:
|   Synchronizes customer PaymentIntent status and activates paid orders.
|
| Stripe remains the source of truth for payment state.
*/


/*
|--------------------------------------------------------------------------
| Supported Events
|--------------------------------------------------------------------------
|
| LIA currently processes these PaymentIntent lifecycle events.
|
*/

export type SupportedStripePaymentEventType =
  | "payment_intent.processing"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed";


/*
|--------------------------------------------------------------------------
| Webhook Processing Status
|--------------------------------------------------------------------------
|
| Stripe may deliver the same event more than once.
|
| LIA records each Stripe event ID so inventory, notifications, and
| fulfillment activation cannot execute repeatedly.
|
*/

export type StripeWebhookProcessingStatus =
  | "processing"
  | "processed"
  | "failed";


/*
|--------------------------------------------------------------------------
| Stored Event Record
|--------------------------------------------------------------------------
|
| Stored at:
|
| stripeWebhookEvents/{stripeEventId}
|
| This collection is operational infrastructure for webhook
| idempotency and debugging.
|
*/

export interface StripePaymentWebhookEventRecord {
  /*
    Stripe event ID.

    Example:

    evt_123
  */
  id: string;

  /*
    Supported Stripe event type.
  */
  type:
    SupportedStripePaymentEventType;

  /*
    Stripe PaymentIntent referenced by this event.
  */
  paymentIntentId: string;

  /*
    LIA Firestore order ID from PaymentIntent metadata.
  */
  orderId: string;

  /*
    Current webhook processing state.
  */
  status:
    StripeWebhookProcessingStatus;

  /*
    Stripe test/live mode.

    This allows LIA to detect environment mistakes.
  */
  livemode: boolean;

  /*
    Number of times LIA has received this Stripe event.
  */
  deliveryCount: number;

  /*
    ISO timestamp when LIA first received the event.
  */
  firstReceivedAt: string;

  /*
    ISO timestamp when LIA most recently received the event.
  */
  lastReceivedAt: string;

  /*
    ISO timestamp when processing completed successfully.
  */
  processedAt?: string;

  /*
    Safe internal failure description.

    This must not contain card details or other sensitive payment data.
  */
  failureReason?: string;
}


/*
|--------------------------------------------------------------------------
| Event Claim Result
|--------------------------------------------------------------------------
|
| Before processing an event, the webhook claims its Stripe event ID.
|
| process:
|   This delivery owns processing and may continue.
|
| already_processed:
|   This event completed previously. Return HTTP 200 without repeating
|   inventory or order changes.
|
| already_processing:
|   Another concurrent webhook request currently owns this event.
|
*/

export type StripeWebhookEventClaimResult =
  | {
      type: "process";

      eventId: string;
    }
  | {
      type: "already_processed";

      eventId: string;
    }
  | {
      type: "already_processing";

      eventId: string;
    };


/*
|--------------------------------------------------------------------------
| PaymentIntent Metadata
|--------------------------------------------------------------------------
|
| These values were written when LIA created the PaymentIntent.
|
| They connect Stripe's payment back to trusted LIA resources.
|
*/

export interface LiaPaymentIntentMetadata {
  orderId: string;

  orderNumber: string;

  customerUid: string;

  stripeCustomerId: string;

  storeId: string;

  storeStripeAccountId: string;

  paymentArchitecture:
    "separate_charges_and_transfers";

  paymentVersion:
    "v2_stripe_tax";
}


/*
|--------------------------------------------------------------------------
| Validated Payment Event
|--------------------------------------------------------------------------
|
| The webhook creates this only after:
|
| - Stripe signature verification
| - Supported event validation
| - PaymentIntent object validation
| - Required LIA metadata validation
|
*/

export interface ValidatedStripePaymentEvent {
  eventId: string;

  eventType:
    SupportedStripePaymentEventType;

  livemode: boolean;

  paymentIntentId: string;

  /*
    Stripe Charge created by the PaymentIntent.

    This may be null for processing or failed PaymentIntents because
    Stripe does not guarantee that a successful Charge exists yet.

    A succeeded payment event must contain a valid Charge ID before
    LIA activates the order and records its future transfer source.
  */
  stripeChargeId: string | null;

  paymentIntentStatus: string;

  amount: number;

  amountReceived: number;

  currency: string;

  customerId: string;

  metadata:
    LiaPaymentIntentMetadata;

  /*
    Stripe's latest safe customer-facing failure message when available.
  */
  failureMessage?: string;

  /*
    Stripe event creation time in Unix seconds.
  */
  stripeCreatedAt: number;
}


/*
|--------------------------------------------------------------------------
| Order Activation Result
|--------------------------------------------------------------------------
|
| Returned after a successful payment transaction activates the order.
|
| Notification work happens after the Firestore transaction commits.
|
*/

export interface PaidOrderActivationResult {
  orderId: string;

  orderNumber: string;

  storeId: string;

  storeOwnerUid: string;

  customerUid: string;

  /*
    True only when this webhook changed the order from unpaid to paid.
    
    False means another delivery already activated it.
  */
  newlyActivated: boolean;

  lowStockAlerts: Array<{
    productId: string;

    productName: string;

    remainingStock: number;
  }>;
}
