/*
|--------------------------------------------------------------------------
| Reconcile Marketplace Settlements
|--------------------------------------------------------------------------
|
| Firebase scheduled entry point for internal settlement reconciliation.
|
| This scheduler repairs LIA financial state when:
|
| - Store and driver Stripe transfers completed
| - Transfer documents were marked completed
| - Settlement completion or ledger recording failed afterward
|
| Important:
|
| This function does not call Stripe.
| It cannot create another transfer.
| It only reconciles LIA's internal marketplace records.
|
*/

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  paymentSettlementReconciliationService,
} from "../payment/marketplace/paymentSettlementReconciliationService";

/*
|--------------------------------------------------------------------------
| Scheduled Function
|--------------------------------------------------------------------------
*/

export const reconcileMarketplaceSettlements =
  onSchedule(
    {
      schedule:
        "every 5 minutes",

      region:
        "us-central1",

      timeZone:
        "America/Chicago",

      memory:
        "256MiB",

      timeoutSeconds:
        300,
    },

    async () => {
      console.log(
        "Starting marketplace settlement reconciliation..."
      );

      const result =
        await paymentSettlementReconciliationService
          .reconcile();

      console.log(
        "Marketplace settlement reconciliation finished.",
        result
      );
    }
  );