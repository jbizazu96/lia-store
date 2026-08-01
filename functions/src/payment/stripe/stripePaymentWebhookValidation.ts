/*
|--------------------------------------------------------------------------
| Stripe Payment Webhook Validation
|--------------------------------------------------------------------------
|
| Converts one signature-verified Stripe event into LIA's trusted
| payment-webhook model.
|
| Responsibilities:
|
| - Accept only supported PaymentIntent event types
| - Confirm the event contains a PaymentIntent
| - Validate required LIA metadata
| - Validate the Stripe Customer
| - Validate integer payment amounts
| - Return a normalized event for the payment services
|
| This file does NOT:
|
| - Verify the Stripe signature
| - Read or write Firestore
| - Deduct inventory
| - Notify the store
|
*/

import Stripe from "stripe";

import type {
  LiaPaymentIntentMetadata,
  SupportedStripePaymentEventType,
  ValidatedStripePaymentEvent,
} from "./stripePaymentWebhookTypes";


/*
|--------------------------------------------------------------------------
| Supported Event Types
|--------------------------------------------------------------------------
*/

const SUPPORTED_EVENT_TYPES =
  new Set<SupportedStripePaymentEventType>([
    "payment_intent.processing",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
  ]);


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type StripePaymentWebhookValidationErrorCode =
  | "UNSUPPORTED_EVENT"
  | "INVALID_EVENT_ID"
  | "INVALID_EVENT_OBJECT"
  | "INVALID_PAYMENT_INTENT"
  | "INVALID_PAYMENT_AMOUNT"
  | "INVALID_PAYMENT_CURRENCY"
  | "INVALID_STRIPE_CUSTOMER"
  | "INVALID_STRIPE_CHARGE"
  | "INVALID_LIA_METADATA";


export class StripePaymentWebhookValidationError extends Error {
  readonly code:
    StripePaymentWebhookValidationErrorCode;

  constructor(
    code:
      StripePaymentWebhookValidationErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "StripePaymentWebhookValidationError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function requireString(
  value: unknown,
  code:
    StripePaymentWebhookValidationErrorCode,
  message: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new StripePaymentWebhookValidationError(
      code,
      message
    );
  }

  return value.trim();
}


function requirePositiveCentAmount(
  value: unknown,
  message: string
): number {
  if (
    !Number.isSafeInteger(
      value
    ) ||
    Number(value) <= 0
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_PAYMENT_AMOUNT",
      message
    );
  }

  return Number(value);
}


function isSupportedEventType(
  value: string
): value is
  SupportedStripePaymentEventType {
  return SUPPORTED_EVENT_TYPES.has(
    value as
      SupportedStripePaymentEventType
  );
}


/*
|--------------------------------------------------------------------------
| Metadata Validation
|--------------------------------------------------------------------------
*/

function validateMetadata(
  paymentIntent:
    Stripe.PaymentIntent
): LiaPaymentIntentMetadata {
  const metadata =
    paymentIntent.metadata;

  const orderId =
    requireString(
      metadata.liaOrderId,
      "INVALID_LIA_METADATA",
      "The PaymentIntent is missing the LIA order ID."
    );

  const orderNumber =
    requireString(
      metadata.liaOrderNumber,
      "INVALID_LIA_METADATA",
      "The PaymentIntent is missing the LIA order number."
    );

  const customerUid =
    requireString(
      metadata.liaCustomerUid,
      "INVALID_LIA_METADATA",
      "The PaymentIntent is missing the LIA customer ID."
    );

  const stripeCustomerId =
    requireString(
      metadata.liaStripeCustomerId,
      "INVALID_LIA_METADATA",
      "The PaymentIntent is missing the Stripe Customer ID."
    );

  const storeId =
    requireString(
      metadata.liaStoreId,
      "INVALID_LIA_METADATA",
      "The PaymentIntent is missing the LIA store ID."
    );

  const storeStripeAccountId =
    requireString(
      metadata
        .liaStoreStripeAccountId,
      "INVALID_LIA_METADATA",
      "The PaymentIntent is missing the store Stripe account ID."
    );

  if (
    metadata
      .liaPaymentArchitecture !==
      "separate_charges_and_transfers"
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_LIA_METADATA",
      "The PaymentIntent uses an unsupported payment architecture."
    );
  }

  if (
    metadata.liaPaymentVersion !==
      "v1"
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_LIA_METADATA",
      "The PaymentIntent uses an unsupported LIA payment version."
    );
  }

  if (
    !stripeCustomerId.startsWith(
      "cus_"
    )
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_LIA_METADATA",
      "The PaymentIntent Stripe Customer ID is invalid."
    );
  }

  return {
    orderId,

    orderNumber,

    customerUid,

    stripeCustomerId,

    storeId,

    storeStripeAccountId,

    paymentArchitecture:
      "separate_charges_and_transfers",

    paymentVersion:
      "v1",
  };
}


/*
|--------------------------------------------------------------------------
| PaymentIntent Extraction
|--------------------------------------------------------------------------
*/

function getPaymentIntent(
  event:
    Stripe.Event
): Stripe.PaymentIntent {
  const object =
    event.data.object;

  if (
    !object ||
    object.object !==
      "payment_intent"
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_EVENT_OBJECT",
      "The Stripe event does not contain a PaymentIntent."
    );
  }

  return object as
    Stripe.PaymentIntent;
}

/*
|--------------------------------------------------------------------------
| Stripe Charge Extraction
|--------------------------------------------------------------------------
|
| latest_charge may be:
|
| - A Stripe Charge ID
| - An expanded Charge object
| - null before a successful charge exists
|
*/

function getStripeChargeId(
  paymentIntent:
    Stripe.PaymentIntent,
  eventType:
    SupportedStripePaymentEventType
): string | null {
  const latestCharge =
    paymentIntent.latest_charge;

  const chargeId =
    typeof latestCharge ===
      "string"
      ? latestCharge.trim()
      : latestCharge?.id?.trim();

  /*
   * Processing and failed events may not have created a successful
   * Charge yet.
   */
  if (!chargeId) {
    if (
      eventType ===
      "payment_intent.succeeded"
    ) {
      throw new StripePaymentWebhookValidationError(
        "INVALID_STRIPE_CHARGE",
        "The successful PaymentIntent is missing its Stripe Charge."
      );
    }

    return null;
  }

  if (
    !chargeId.startsWith(
      "ch_"
    )
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_STRIPE_CHARGE",
      "The PaymentIntent Stripe Charge ID is invalid."
    );
  }

  return chargeId;
}

/*
|--------------------------------------------------------------------------
| Failure Message
|--------------------------------------------------------------------------
*/

function getFailureMessage(
  paymentIntent:
    Stripe.PaymentIntent
): string | undefined {
  const message =
    paymentIntent
      .last_payment_error
      ?.message
      ?.trim();

  if (!message) {
    return undefined;
  }

  /*
    Keep only a short Stripe-provided customer-facing message.

    Never store or log card numbers, bank details, or payment-method
    payloads.
  */
  return message.slice(
    0,
    500
  );
}


/*
|--------------------------------------------------------------------------
| Validate Event
|--------------------------------------------------------------------------
*/

export function validateStripePaymentEvent(
  event:
    Stripe.Event
): ValidatedStripePaymentEvent {
  const eventId =
    requireString(
      event.id,
      "INVALID_EVENT_ID",
      "The Stripe event ID is invalid."
    );

  if (
    !eventId.startsWith(
      "evt_"
    )
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_EVENT_ID",
      "The Stripe event ID is invalid."
    );
  }

  if (
    !isSupportedEventType(
      event.type
    )
  ) {
    throw new StripePaymentWebhookValidationError(
      "UNSUPPORTED_EVENT",
      `Unsupported Stripe payment event: ${event.type}`
    );
  }

  const paymentIntent =
    getPaymentIntent(
      event
    );

  const paymentIntentId =
    requireString(
      paymentIntent.id,
      "INVALID_PAYMENT_INTENT",
      "The Stripe PaymentIntent ID is invalid."
    );

  const stripeChargeId =
    getStripeChargeId(
      paymentIntent,
      event.type
    );

  if (
    !paymentIntentId.startsWith(
      "pi_"
    )
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_PAYMENT_INTENT",
      "The Stripe PaymentIntent ID is invalid."
    );
  }

  const amount =
    requirePositiveCentAmount(
      paymentIntent.amount,
      "The Stripe PaymentIntent amount is invalid."
    );

  /*
    amount_received may be zero for processing or failed payments.

    It must be a safe non-negative integer.
  */
  if (
    !Number.isSafeInteger(
      paymentIntent.amount_received
    ) ||
    paymentIntent.amount_received < 0
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_PAYMENT_AMOUNT",
      "The Stripe received amount is invalid."
    );
  }

  const currency =
    requireString(
      paymentIntent.currency,
      "INVALID_PAYMENT_CURRENCY",
      "The Stripe payment currency is invalid."
    ).toLowerCase();

  if (
    currency !== "usd"
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_PAYMENT_CURRENCY",
      "LIA currently accepts only USD payments."
    );
  }

  const customerId =
    typeof paymentIntent.customer ===
      "string"
      ? paymentIntent.customer
      : paymentIntent.customer?.id;

  const normalizedCustomerId =
    requireString(
      customerId,
      "INVALID_STRIPE_CUSTOMER",
      "The PaymentIntent is missing its Stripe Customer."
    );

  if (
    !normalizedCustomerId
      .startsWith(
        "cus_"
      )
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_STRIPE_CUSTOMER",
      "The PaymentIntent Stripe Customer is invalid."
    );
  }

  const metadata =
    validateMetadata(
      paymentIntent
    );

  if (
    normalizedCustomerId !==
      metadata.stripeCustomerId
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_STRIPE_CUSTOMER",
      "The PaymentIntent Customer does not match its LIA metadata."
    );
  }

  if (
    !Number.isSafeInteger(
      event.created
    ) ||
    event.created <= 0
  ) {
    throw new StripePaymentWebhookValidationError(
      "INVALID_EVENT_OBJECT",
      "The Stripe event creation time is invalid."
    );
  }

  return {
    eventId,

    eventType:
      event.type,

    livemode:
      event.livemode,

    paymentIntentId,

    stripeChargeId,

    paymentIntentStatus:
      paymentIntent.status,

    amount,

    amountReceived:
      paymentIntent
        .amount_received,

    currency,

    customerId:
      normalizedCustomerId,

    metadata,

    failureMessage:
      getFailureMessage(
        paymentIntent
      ),

    stripeCreatedAt:
      event.created,
  };
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isStripePaymentWebhookValidationError(
  error: unknown
): error is StripePaymentWebhookValidationError {
  return (
    error instanceof
    StripePaymentWebhookValidationError
  );
}