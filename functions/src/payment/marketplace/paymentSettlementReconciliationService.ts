/*
|--------------------------------------------------------------------------
| Payment Settlement Reconciliation Service
|--------------------------------------------------------------------------
|
| Repairs marketplace settlements whose store and driver transfers have
| completed, but whose settlement-completion accounting did not finish.
|
| This may happen when:
|
| - Stripe successfully transferred funds
| - The transfer document was marked completed
| - A later Firestore or ledger operation temporarily failed
|
| Important:
|
| This service never calls Stripe.
| It never creates another transfer.
| It only reconciles LIA's internal financial state.
|
*/

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  paymentSettlementCompletionService,
} from "./paymentSettlementCompletionService";

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const SETTLEMENT_BATCH_SIZE =
  25;

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface PaymentSettlementReconciliationResult {
  settlementsFound: number;

  processed: number;

  completed: number;

  waitingForTransfers: number;

  failed: number;
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown marketplace settlement reconciliation error.";
}

/*
|--------------------------------------------------------------------------
| Reconciliation
|--------------------------------------------------------------------------
*/

export const paymentSettlementReconciliationService = {
  async reconcile(): Promise<
    PaymentSettlementReconciliationResult
  > {
    const snapshot =
      await getFirestore("default")
        .collection(
          "paymentSettlements"
        )
        .where(
          "status",
          "in",
          [
            "eligible",
            "processing",
            "failed",
          ]
        )
        .orderBy(
          "createdAt",
          "asc"
        )
        .limit(
          SETTLEMENT_BATCH_SIZE
        )
        .get();

    const result:
      PaymentSettlementReconciliationResult = {
        settlementsFound:
          snapshot.size,

        processed:
          0,

        completed:
          0,

        waitingForTransfers:
          0,

        failed:
          0,
      };

    if (
      snapshot.empty
    ) {
      console.log(
        "Settlement reconciliation found no incomplete settlements."
      );

      return result;
    }

    console.log(
      "Settlement reconciliation starting.",
      {
        settlementsFound:
          snapshot.size,
      }
    );

    for (
      const document of
      snapshot.docs
    ) {
      result.processed +=
        1;

      try {
        const completion =
          await paymentSettlementCompletionService
            .complete({
              settlementId:
                document.id,
            });

        if (
          completion.completed
        ) {
          result.completed +=
            1;

          console.log(
            "Marketplace settlement reconciled successfully.",
            {
              settlementId:
                completion
                  .settlementId,

              orderId:
                completion
                  .orderId,

              alreadyCompleted:
                completion
                  .alreadyCompleted,
            }
          );
        } else {
          result.waitingForTransfers +=
            1;

          console.log(
            "Marketplace settlement is still waiting for participant transfers.",
            {
              settlementId:
                completion
                  .settlementId,

              orderId:
                completion
                  .orderId,

              storeTransferCompleted:
                completion
                  .storeTransferCompleted,

              driverTransferCompleted:
                completion
                  .driverTransferCompleted,
            }
          );
        }
      } catch (
        error: unknown
      ) {
        result.failed +=
          1;

        console.error(
          "Marketplace settlement reconciliation failed.",
          {
            settlementId:
              document.id,

            error:
              getSafeErrorMessage(
                error
              ),
          }
        );

        /*
         * Continue processing the remaining settlements.
         *
         * One malformed or temporarily unavailable settlement must not
         * block unrelated financial records.
         */
      }
    }

    console.log(
      "Settlement reconciliation completed.",
      result
    );

    return result;
  },
};