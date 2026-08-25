/**
 * ================================================================
 * Process Marketplace Transfers Scheduler
 * ================================================================
 *
 * Firebase scheduled entry point for marketplace store and driver
 * transfers.
 *
 * Responsibilities:
 *
 * - Bind the Stripe secret
 * - Create the server-side Stripe client
 * - Invoke the internal marketplace transfer scheduler
 *
 * This file owns infrastructure concerns.
 *
 * Marketplace business logic remains under:
 *
 * src/payment/marketplace/
 *
 * Stripe execution remains under:
 *
 * src/payment/stripe/
 */

import Stripe from "stripe";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  paymentTransferScheduler,
} from "../payment/marketplace/paymentTransferScheduler";
import {transfersOperationallyPaused} from "../callable/adminOperations";

/*
|--------------------------------------------------------------------------
| Secrets
|--------------------------------------------------------------------------
*/

const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );

/*
|--------------------------------------------------------------------------
| Scheduled Function
|--------------------------------------------------------------------------
*/

export const processMarketplaceTransfers =
  onSchedule(
    {
      schedule:
        "every 2 minutes",

      region:
        "us-central1",

      timeZone:
        "America/Chicago",

      memory:
        "512MiB",

      timeoutSeconds:
        540,

      secrets: [
        stripeSecretKey,
      ],
    },

    async () => {
      if (await transfersOperationallyPaused()) {
        console.warn("Marketplace transfer processing is paused by an audited administrator control.");
        return;
      }
      console.log(
        "Starting marketplace transfer processing..."
      );

      const stripe =
        new Stripe(
          stripeSecretKey.value(),
          {
            appInfo: {
              name:
                "LIA Store",

              version:
                "1.0.0",
            },

            maxNetworkRetries:
              2,

            timeout:
              30_000,
          }
        );

      const result =
        await paymentTransferScheduler.run({
          stripe,
        });

      console.log(
        "Marketplace transfer processing completed.",
        result
      );
    }
  );
