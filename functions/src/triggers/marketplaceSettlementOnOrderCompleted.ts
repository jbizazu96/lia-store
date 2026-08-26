/*
|--------------------------------------------------------------------------
| Marketplace Settlement On Order Completed
|--------------------------------------------------------------------------
|
| Creates marketplace settlement obligations when a successfully paid
| order reaches its completed delivery state.
|
| This trigger is intentionally separate from orderStatusChanged.ts.
|
| Why:
|
| - Notification failures must not control financial processing.
| - Settlement failures must not prevent order notifications.
| - Firestore may retry triggers, so the settlement workflow must remain
|   independently idempotent.
|
| This trigger does not call Stripe directly.
|
| It delegates to:
|
| marketplaceSettlementActivationService
|
| which creates the internal settlement and transfer obligations.
|
| The scheduled marketplace transfer processor executes Stripe transfers
| separately.
|
*/

import {
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

import {
  marketplaceSettlementActivationService,
} from "../payment/marketplace/marketplaceSettlementActivationService";

/*
|--------------------------------------------------------------------------
| Trigger
|--------------------------------------------------------------------------
*/

export const marketplaceSettlementOnOrderCompleted =
  onDocumentUpdated(
    {
      document:
        "orders/{orderId}",

      region:
        "us-central1",

      database:
        "default",

      /*
       * Financial processing should not run with multiple overlapping
       * instances for the same function during the initial rollout.
       *
       * Firestore transactions and deterministic IDs still provide the
       * real idempotency boundaries.
       */
      maxInstances:
        10,

      timeoutSeconds:
        120,

      memory:
        "512MiB",
    },

    async (
      event
    ) => {
      const before =
        event.data
          ?.before
          .data();

      const after =
        event.data
          ?.after
          .data();

      if (
        !before ||
        !after
      ) {
        console.log(
          "Marketplace settlement trigger received incomplete order data."
        );

        return;
      }

      const orderId =
        event.params.orderId;

      /*
      |--------------------------------------------------------------------------
      | Completed Transition
      |--------------------------------------------------------------------------
      |
      | Process only the transition into LIA's successful terminal order state.
      |
      | An unrelated update to an already completed order must not invoke the
      | settlement service again.
      |
      */

      const enteredCompletedState =
        before.status !==
          "completed" &&
        after.status ===
          "completed";

      if (
        !enteredCompletedState
      ) {
        return;
      }

      console.log(
        "Completed order entered marketplace settlement workflow.",
        {
          orderId,

          previousStatus:
            before.status,

          currentStatus:
            after.status,

          shipdayStatus:
            after.shipday
              ?.status,
        }
      );

      const pickupCompleted =
        after.fulfillmentType === "pickup" &&
        Boolean(after.pickup?.pickedUpAt) &&
        typeof after.pickup?.handedOffBy === "string";

      const deliveryCompleted =
        after.fulfillmentType !== "pickup" &&
        after.shipday?.status === "delivered";

      if (!pickupCompleted && !deliveryCompleted) {
        console.error(
          "Completed order cannot be settled because fulfillment is not confirmed.",
          {
            orderId,
            fulfillmentType: after.fulfillmentType ?? "delivery",
            shipdayStatus: after.shipday?.status ?? null,
            pickupCompleted,
          }
        );
        throw new Error(
          "Trusted fulfillment confirmation is required before marketplace settlement."
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Activate Settlement
      |--------------------------------------------------------------------------
      */

      const result =
        await marketplaceSettlementActivationService
          .activate({
            orderId,
          });

      console.log(
        "Marketplace settlement activated successfully.",
        {
          orderId:
            result.orderId,

          settlementId:
            result.settlementId,

          settlementCreated:
            result
              .settlementCreated,

          storeTransferId:
            result
              .storeTransferId,

          storeTransferCreated:
            result
              .storeTransferCreated,

          driverTransferId:
            result
              .driverTransferId,

          driverTransferCreated:
            result
              .driverTransferCreated,

          storeAmount:
            result
              .allocation
              .store
              .transferAmount,

          driverAmount:
            result
              .allocation
              .driver
              .transferAmount,

          platformRevenue:
            result
              .allocation
              .platform
              .totalRevenue,
        }
      );
    }
  );
