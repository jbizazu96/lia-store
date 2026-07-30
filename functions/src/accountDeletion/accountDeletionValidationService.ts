/*
|--------------------------------------------------------------------------
| Account Deletion Validation Service
|--------------------------------------------------------------------------
|
| This service validates whether an account deletion request is eligible
| to begin processing.
|
| Today it performs basic validation.
|
| Later it will also verify:
|
| • Active orders
| • Pending deliveries
| • Outstanding payouts
| • Platform holds
| • Other business rules
|
*/

import { getFirestore } from "firebase-admin/firestore";

export interface ValidateDeletionRequestInput {
  requestId: string;
}

export class AccountDeletionValidationError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);

    this.name =
      "AccountDeletionValidationError";
  }
}

export const accountDeletionValidationService = {
  async validate(
    input: ValidateDeletionRequestInput
  ): Promise<void> {
    const db =
      getFirestore("default");

    const requestSnapshot =
      await db
        .collection("accountDeletionRequests")
        .doc(input.requestId)
        .get();

    if (!requestSnapshot.exists) {
      throw new AccountDeletionValidationError(
        "Deletion request not found.",
        "not-found"
      );
    }

    const request =
      requestSnapshot.data();

    if (!request) {
      throw new AccountDeletionValidationError(
        "Deletion request is empty.",
        "invalid-request"
      );
    }

    if (
      request.status !== "approved" &&
      request.status !== "scheduled"
    ) {
      throw new AccountDeletionValidationError(
        "The deletion request is not ready for processing.",
        "invalid-status"
      );
    }

    /*
    --------------------------------------------------------------------------
    Future validations
    --------------------------------------------------------------------------

    Driver
        - Active deliveries
        - Assigned orders

    Store
        - Pending orders
        - Outstanding payouts

    Customer
        - Pending refunds

    --------------------------------------------------------------------------
    */
  },
};