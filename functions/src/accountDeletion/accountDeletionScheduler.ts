/*
|--------------------------------------------------------------------------
| Account Deletion Scheduler
|--------------------------------------------------------------------------
|
| Runs periodically and processes approved account deletion requests whose
| scheduled deletion time has arrived.
|
| Responsibilities:
|
| • Find eligible deletion requests
| • Call the deletion engine
| • Continue processing remaining requests if one fails
|
| The scheduler never performs destructive operations directly.
| All deletion work is delegated to the Account Deletion Engine.
|
*/

import Stripe from "stripe";

import {
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";

import {
  accountDeletionEngine,
} from "./accountDeletionEngine";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface RunAccountDeletionSchedulerInput {
  stripe: Stripe;
}

/*
|--------------------------------------------------------------------------
| Scheduler
|--------------------------------------------------------------------------
*/

export const accountDeletionScheduler = {
  async run(
    input: RunAccountDeletionSchedulerInput
  ): Promise<void> {

    const db =
      getFirestore("default");

    const now =
      Timestamp.now();

    const snapshot =
      await db
        .collection("accountDeletionRequests")
        .where("status", "==", "approved")
        .where(
          "scheduledDeletionAt",
          "<=",
          now
        )
        .get();

    if (snapshot.empty) {
      console.log(
        "Account deletion scheduler: no pending requests."
      );
      return;
    }

    console.log(
      `Account deletion scheduler: processing ${snapshot.size} request(s).`
    );

    for (const document of snapshot.docs) {

      try {

        await accountDeletionEngine.process({
          requestId: document.id,
          stripe: input.stripe,
        });

        console.log(
          `Deletion completed: ${document.id}`
        );

      } catch (error) {

        console.error(
          `Deletion failed: ${document.id}`,
          error
        );

      }

    }

  },
};