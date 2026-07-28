/*
  Central server-only Stripe client.

  Every backend Stripe operation in LIA Store will use this single
  reusable instance.

  Future examples include:

  - Creating connected accounts
  - Creating Stripe-hosted onboarding links
  - Retrieving connected-account status
  - Processing customer payments
  - Transferring funds to stores
  - Transferring funds to drivers
  - Issuing refunds
  - Handling Stripe webhooks

  Important:
  Never import this module into a Client Component.
*/

import "server-only";

import Stripe from "stripe";


/*
  Read the secret key from the server environment.

  The secret key must never use the NEXT_PUBLIC_ prefix because
  NEXT_PUBLIC_ variables can be included in browser JavaScript.
*/
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;


/*
  Throw a clear configuration error if Stripe is used before the
  required environment variable has been configured.

  This is safer than allowing requests to fail later with a vague
  Stripe authentication error.
*/
if (!stripeSecretKey) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY environment variable. " +
      "Add your Stripe test secret key to .env.local."
  );
}


/*
  Create one Stripe SDK instance for the entire server application.

  We do not manually specify an API version here.

  The installed Stripe SDK will use the API version associated with
  that SDK release, keeping its runtime behavior aligned with its
  TypeScript definitions.
*/
export const stripe = new Stripe(stripeSecretKey, {
  /*
    Stripe can display this integration information when diagnosing
    API requests made by LIA Store.
  */
  appInfo: {
    name: "LIA Store",
    version: "1.0.0",
  },

  /*
    Retry requests that fail because of temporary network problems.

    We will still use explicit idempotency keys later for important
    write operations such as creating accounts and payments.
  */
  maxNetworkRetries: 2,

  /*
    Prevent API requests from waiting indefinitely.

    Stripe measures this timeout in milliseconds.
  */
  timeout: 30_000,
});