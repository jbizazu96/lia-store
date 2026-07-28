/*
|--------------------------------------------------------------------------
| Browser Stripe Client
|--------------------------------------------------------------------------
|
| Initializes Stripe.js for customer-facing payment components.
|
| This file is safe for Client Components because it uses only Stripe's
| publishable key.
|
| Never import the server Stripe client from:
|
| src/lib/stripe/stripe.ts
|
| into a Client Component. That server file uses the secret Stripe key.
*/

import {
  loadStripe,
} from "@stripe/stripe-js";


/*
  Stripe publishable key exposed to the browser.

  Publishable keys normally begin with:

  pk_test_  for Stripe test or sandbox environments
  pk_live_  for production

  This key is designed to be public and cannot perform privileged Stripe
  operations such as creating charges, refunds, transfers, or connected
  accounts.
*/
const stripePublishableKey =
  process.env
    .NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;


/*
  Fail clearly when Stripe payment UI is used without the required
  browser configuration.
*/
if (!stripePublishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY environment variable. " +
      "Add the Stripe publishable key to .env.local."
  );
}


/*
  Initialize Stripe.js once at module scope.

  Keeping this outside React components prevents a new Stripe instance
  from being created during every render.
*/
export const stripePromise =
  loadStripe(
    stripePublishableKey
  );