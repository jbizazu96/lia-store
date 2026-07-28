/*
|--------------------------------------------------------------------------
| Stripe Payment Service
|--------------------------------------------------------------------------
|
| Creates and retrieves customer PaymentIntents on the LIA platform
| Stripe account.
|
| LIA uses separate charges and transfers:
|
| Customer
|     ↓
| Pays the LIA platform
|     ↓
| LIA later transfers store and driver earnings separately
|
| Important:
|
| This service receives trusted server-calculated amounts only.
|
| It must never receive or use totals calculated by the browser.
*/

import Stripe from "stripe";

import type {
  PaymentPricingResult,
} from "./paymentPricingCalculator";


/*
  Input required to create one platform PaymentIntent.
*/
export interface CreateOrderPaymentIntentInput {
  /*
    Firestore order document ID.

    This is created before the PaymentIntent so both systems can
    reference each other.
  */
  orderId: string;

  /*
    Human-readable LIA order number.

    Example:

    LIA-1785212345678
  */
  orderNumber: string;

  /*
    Authenticated Firebase customer UID.
  */
  customerUid: string;

  /*
    Customer email from the verified Firebase token or trusted user
    record.
  */
  customerEmail?: string;

  /*
    Trusted Firestore store document ID.
  */
  storeId: string;

  /*
    Stripe connected account that will eventually receive the store
    transfer.

    The PaymentIntent remains on the LIA platform account.
  */
  storeStripeAccountId: string;

  /*
    Trusted backend-calculated payment amounts.
  */
  pricing: PaymentPricingResult;
}


/*
  Safe PaymentIntent result needed by the callable function.
*/
export interface OrderPaymentIntentResult {
  paymentIntentId: string;

  clientSecret: string;

  status: Stripe.PaymentIntent.Status;
}


/*
  Predictable payment-service failure codes.
*/
export type StripePaymentServiceErrorCode =
  | "INVALID_ORDER_ID"
  | "INVALID_ORDER_NUMBER"
  | "INVALID_CUSTOMER_ID"
  | "INVALID_STORE_ID"
  | "INVALID_STORE_STRIPE_ACCOUNT"
  | "INVALID_PAYMENT_AMOUNT"
  | "PAYMENT_INTENT_CLIENT_SECRET_MISSING";


/*
  Expected application-level payment-service error.
*/
export class StripePaymentServiceError extends Error {
  readonly code: StripePaymentServiceErrorCode;

  constructor(
    code: StripePaymentServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name = "StripePaymentServiceError";
    this.code = code;
  }
}


/*
  Normalize and validate a required identifier.
*/
function requireIdentifier(
  value: string,
  code: StripePaymentServiceErrorCode,
  message: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new StripePaymentServiceError(
      code,
      message
    );
  }

  return normalized;
}


/*
  Create one PaymentIntent for one LIA order.

  The Stripe client is injected by the Firebase callable function.

  Why inject it?

  - Secret access stays at the function boundary
  - The service is easier to test
  - This file does not initialize Firebase secrets itself
*/
async function createOrderPaymentIntent(
  stripe: Stripe,
  input: CreateOrderPaymentIntentInput
): Promise<OrderPaymentIntentResult> {
  const orderId =
    requireIdentifier(
      input.orderId,
      "INVALID_ORDER_ID",
      "A valid order ID is required."
    );

  const orderNumber =
    requireIdentifier(
      input.orderNumber,
      "INVALID_ORDER_NUMBER",
      "A valid order number is required."
    );

  const customerUid =
    requireIdentifier(
      input.customerUid,
      "INVALID_CUSTOMER_ID",
      "A valid customer ID is required."
    );

  const storeId =
    requireIdentifier(
      input.storeId,
      "INVALID_STORE_ID",
      "A valid store ID is required."
    );

  const storeStripeAccountId =
    requireIdentifier(
      input.storeStripeAccountId,
      "INVALID_STORE_STRIPE_ACCOUNT",
      "The store Stripe account is invalid."
    );

  /*
    Stripe expects a positive integer amount in the currency's smallest
    unit.

    For USD:

    12774 = $127.74
  */
  if (
    !Number.isSafeInteger(
      input.pricing.totalAmount
    ) ||
    input.pricing.totalAmount <= 0
  ) {
    throw new StripePaymentServiceError(
      "INVALID_PAYMENT_AMOUNT",
      "The trusted payment amount is invalid."
    );
  }

  /*
    Stripe recommends one PaymentIntent per order or checkout session.

    The order-specific idempotency key protects against duplicate
    PaymentIntents when a callable request is retried after a timeout or
    temporary network failure.
  */
  const idempotencyKey =
    `lia-order-payment-${orderId}`;

  const paymentIntent =
    await stripe.paymentIntents.create(
      {
        amount:
          input.pricing.totalAmount,

        currency:
          input.pricing.currency,

        /*
          Stripe can dynamically show payment methods supported by the
          current account, currency, and customer context.

          The frontend will later render Stripe's Payment Element.
        */
        automatic_payment_methods: {
          enabled: true,
        },

        /*
          Displayed in Stripe Dashboard and useful during support,
          reconciliation, disputes, and refunds.
        */
        description:
          `LIA Store order ${orderNumber}`,

        /*
          Receipt delivery is handled by Stripe when a valid email is
          available.

          Empty or missing emails are omitted.
        */
        receipt_email:
          input.customerEmail?.trim() ||
          undefined,

        /*
          Metadata connects the Stripe payment back to LIA.

          Metadata must contain identifiers only—not sensitive customer,
          address, banking, or identity information.
        */
        metadata: {
          liaOrderId:
            orderId,

          liaOrderNumber:
            orderNumber,

          liaCustomerUid:
            customerUid,

          liaStoreId:
            storeId,

          liaStoreStripeAccountId:
            storeStripeAccountId,

          liaPaymentArchitecture:
            "separate_charges_and_transfers",

          liaPaymentVersion:
            "v1",
        },
      },

      /*
        Request-level options.

        This creates the PaymentIntent on LIA's platform Stripe account.
        We intentionally do not provide stripeAccount here.
      */
      {
        idempotencyKey,
      }
    );

  if (!paymentIntent.client_secret) {
    throw new StripePaymentServiceError(
      "PAYMENT_INTENT_CLIENT_SECRET_MISSING",
      "Stripe did not return a payment client secret."
    );
  }

  return {
    paymentIntentId:
      paymentIntent.id,

    clientSecret:
      paymentIntent.client_secret,

    status:
      paymentIntent.status,
  };
}


/*
  Type guard used by the future callable checkout function.
*/
export function isStripePaymentServiceError(
  error: unknown
): error is StripePaymentServiceError {
  return (
    error instanceof
    StripePaymentServiceError
  );
}


/*
  Stable payment-service interface.
*/
export const stripePaymentService = {
  createOrderPaymentIntent,
};