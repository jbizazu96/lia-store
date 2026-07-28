/*
|--------------------------------------------------------------------------
| Stripe Customer Session Service
|--------------------------------------------------------------------------
|
| Creates a short-lived Stripe Customer Session for the Payment Element.
|
| The Customer Session allows Stripe.js to securely access the current
| customer's saved payment methods without exposing privileged Stripe
| credentials to the browser.
|
| Enabled Payment Element features:
|
| - Display saved payment methods
| - Offer consent to save a new payment method
| - Save the selected method for future off-session use
| - Allow the customer to remove saved payment methods
|
| Important:
|
| The Customer Session must belong to the same Stripe Customer attached
| to the PaymentIntent.
*/

import Stripe from "stripe";


/*
  Input required to create one Customer Session.
*/
export interface CreateStripeCustomerSessionInput {
  /*
    Stripe Customer ID created or retrieved for the authenticated
    Firebase customer.
  */
  customerId: string;
}


/*
  Safe result returned to the checkout orchestrator.
*/
export interface StripeCustomerSessionResult {
  /*
    This short-lived client secret is passed to Stripe Elements.

    It is different from the PaymentIntent client secret.

    Stripe Customer Sessions do not expose a normal resource ID in the
    returned CustomerSession object, so the client secret is the only
    value LIA needs from this service.
  */
  clientSecret: string;
}


/*
  Predictable service errors.
*/
export type StripeCustomerSessionErrorCode =
  | "INVALID_CUSTOMER_ID"
  | "CUSTOMER_SESSION_CLIENT_SECRET_MISSING";


/*
  Expected application-level Customer Session error.
*/
export class StripeCustomerSessionError extends Error {
  readonly code:
    StripeCustomerSessionErrorCode;

  constructor(
    code:
      StripeCustomerSessionErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "StripeCustomerSessionError";

    this.code =
      code;
  }
}


/*
  Create a Customer Session configured for the web Payment Element.
*/
async function createCustomerSession(
  stripe: Stripe,
  input: CreateStripeCustomerSessionInput
): Promise<StripeCustomerSessionResult> {
  const customerId =
    input.customerId.trim();

  if (!customerId) {
    throw new StripeCustomerSessionError(
      "INVALID_CUSTOMER_ID",
      "A valid Stripe customer ID is required."
    );
  }

  const customerSession =
    await stripe.customerSessions.create({
      customer:
        customerId,

      components: {
        payment_element: {
          enabled:
            true,

          features: {
            /*
              Display previously saved payment methods during checkout.
            */
            payment_method_redisplay:
              "enabled",

            /*
              Display a checkbox that lets the customer consent to
              saving a new payment method.
            */
            payment_method_save:
              "enabled",

            /*
              Saved methods may later be reused for customer-approved
              purchases and future off-session payment capabilities.
            */
            payment_method_save_usage:
              "off_session",

            /*
              Allow customers to detach a saved payment method directly
              from the Payment Element.

              LIA does not currently have recurring subscriptions that
              depend on these payment methods.
            */
            payment_method_remove:
              "enabled",

            /*
              Stripe supports showing up to ten saved methods.

              Five is enough for the LIA MVP without overcrowding the
              checkout interface.
            */
            payment_method_redisplay_limit:
              5,
          },
        },
      },
    });

  if (!customerSession.client_secret) {
    throw new StripeCustomerSessionError(
      "CUSTOMER_SESSION_CLIENT_SECRET_MISSING",
      "Stripe did not return a Customer Session client secret."
    );
  }

  return {

    clientSecret:
      customerSession.client_secret,
  };
}


/*
  Type guard used by the checkout payment orchestrator.
*/
export function isStripeCustomerSessionError(
  error: unknown
): error is StripeCustomerSessionError {
  return (
    error instanceof
    StripeCustomerSessionError
  );
}


/*
  Stable service interface.
*/
export const stripeCustomerSessionService = {
  createCustomerSession,
};