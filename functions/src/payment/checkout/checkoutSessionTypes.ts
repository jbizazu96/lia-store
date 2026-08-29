/*
|--------------------------------------------------------------------------
| Checkout Session Types
|--------------------------------------------------------------------------
|
| Defines LIA's server-side checkout session model.
|
| A checkout session represents one customer attempt to pay for one
| specific cart and delivery configuration.
|
| It connects:
|
| - The authenticated customer
| - The trusted cart snapshot
| - The delivery destination
| - The trusted pricing
| - The Firestore order
| - The Stripe PaymentIntent
| - The expiration lifecycle
|
| Important:
|
| This is LIA's checkout-session model.
|
| It is separate from Stripe Customer Sessions.
|
| Stripe Customer Session:
|   Gives Stripe Elements temporary access to saved payment methods.
|
| LIA Checkout Session:
|   Prevents duplicate pending orders and manages checkout reuse,
|   expiration, and recovery.
*/


/*
|--------------------------------------------------------------------------
| Session Status
|--------------------------------------------------------------------------
*/

export type CheckoutSessionStatus =
  | "preparing"
  | "awaiting_payment"
  | "processing"
  | "confirmed"
  | "payment_failed"
  | "expired"
  | "cancelled";


/*
|--------------------------------------------------------------------------
| Fingerprint Input
|--------------------------------------------------------------------------
|
| These values determine whether an existing checkout can be safely
| reused.
|
| The fingerprint excludes display-only values and uses normalized,
| trusted checkout facts.
|
*/

export interface CheckoutSessionFingerprintInput {
  fulfillmentType: "delivery" | "pickup";
  /*
    Authenticated Firebase customer UID.
  */
  customerUid: string;

  /*
    Trusted Firestore store ID.
  */
  storeId: string;

  /*
    Trusted product selections sorted by product ID.
  */
  items: Array<{
    productId: string;
    quantity: number;

    size?: {
      value: number;
      unit: string;
    } | null;
  }>;

  /*
    Selected delivery destination.
  */
  deliveryAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;

    latitude: number;
    longitude: number;
  } | null;

  fulfillmentInstructions: string | null;

  fulfillmentTiming: "asap" | "scheduled";
  scheduledWindow: {start: string; end: string; timezone: string} | null;

  /*
    Customer-selected tip in cents.
  */
  tipAmount: number;

  /*
    Trusted backend-calculated total in cents.
  */
  totalAmount: number;

  /*
    Trusted pricing currency.
  */
  currency: "usd";
}


/*
|--------------------------------------------------------------------------
| Stored Checkout Session
|--------------------------------------------------------------------------
*/

export interface CheckoutSessionRecord {
  /*
    Firestore checkoutSessions document ID.
  */
  id: string;

  /*
    Stable SHA-256 fingerprint for this checkout configuration.
  */
  fingerprint: string;

  /*
    Authenticated Firebase customer UID.
  */
  customerUid: string;

  /*
    Trusted store ID.
  */
  storeId: string;

  /*
    Firestore order created for this session.
  */
  orderId: string;

  /*
    Human-readable LIA order number.
  */
  orderNumber: string;

  /*
    Stripe PaymentIntent associated with this checkout.
  */
  paymentIntentId?: string;

  /*
    Current checkout lifecycle state.
  */
  status: CheckoutSessionStatus;

  /*
    Trusted amount associated with this checkout session.
  */
  totalAmount: number;

  currency: "usd";

  /*
    ISO timestamp recorded when the session was created.
  */
  createdAt: string;

  /*
    ISO timestamp of the latest session update.
  */
  updatedAt: string;

  /*
    ISO timestamp after which this session must not be reused.
  */
  expiresAt: string;
}


/*
|--------------------------------------------------------------------------
| Reusable Session Result
|--------------------------------------------------------------------------
*/

export interface ReusableCheckoutSession {
  sessionId: string;

  fingerprint: string;

  orderId: string;

  orderNumber: string;

  paymentIntentId: string;

  status:
    | "awaiting_payment"
    | "processing";

  totalAmount: number;

  currency: "usd";

  expiresAt: string;
}


/*
|--------------------------------------------------------------------------
| Session Creation Result
|--------------------------------------------------------------------------
*/

export interface CreatedCheckoutSession {
  sessionId: string;

  fingerprint: string;

  expiresAt: string;
}


/*
|--------------------------------------------------------------------------
| Session Resolution
|--------------------------------------------------------------------------
|
| The session service will either:
|
| - Reuse an existing active checkout
| - Or authorize creation of a new checkout
|
*/

export type CheckoutSessionResolution =
  | {
      type: "reuse";

      session:
        ReusableCheckoutSession;
    }
  | {
      type: "create";

      session:
        CreatedCheckoutSession;
    };
