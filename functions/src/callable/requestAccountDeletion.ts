import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  accountDeletionRequestService,
  AccountDeletionRequestServiceError,
} from "../accountDeletion/accountDeletionRequestService";

import {
  AccountDeletionOwnerType,
  AccountDeletionReasonCode,
} from "../accountDeletion/accountDeletionRequestTypes";

/*
|--------------------------------------------------------------------------
| Request Payload
|--------------------------------------------------------------------------
*/

interface RequestAccountDeletionData {
  ownerType: AccountDeletionOwnerType;

  reasonCode: AccountDeletionReasonCode;

  reasonDetails?: string | null;
}

/*
|--------------------------------------------------------------------------
| Callable
|--------------------------------------------------------------------------
|
| This callable DOES NOT delete an account.
|
| It only creates an account deletion request that will later
| be reviewed by an administrator.
|
*/

export const requestAccountDeletion = onCall(
  async (request) => {
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required."
      );
    }

    const uid = request.auth.uid;

    const data =
      request.data as RequestAccountDeletionData;

    try {
      /*
       * Never trust a browser-supplied owner type. It determines which
       * account-deletion engine will run after administrative approval.
       */
      const user = await getFirestore("default")
        .collection("users")
        .doc(uid)
        .get();

      const accountType =
        user.data()?.accountType;

      const expectedOwnerType =
        accountType === "store_owner"
          ? "store"
          : accountType === "driver"
            ? "driver"
            : accountType === "customer"
              ? "customer"
              : null;

      if (!expectedOwnerType || data.ownerType !== expectedOwnerType) {
        throw new HttpsError(
          "permission-denied",
          "You cannot request deletion for another account type."
        );
      }

      const result =
        await accountDeletionRequestService.createRequest({
          ownerType: data.ownerType,
          ownerId: uid,
          requestedBy: uid,
          reasonCode: data.reasonCode,
          reasonDetails: data.reasonDetails,
        });

      return {
        success: true,

        requestId: result.requestId,

        status: result.status,

        alreadyPending:
          result.alreadyPending,
      };
    } catch (error) {
      if (
        error instanceof
        AccountDeletionRequestServiceError
      ) {
        throw new HttpsError(
          "failed-precondition",
          error.message,
          {
            code: error.code,
            cause:
              error.causeMessage,
          }
        );
      }

      throw new HttpsError(
        "internal",
        "Unable to create the account deletion request."
      );
    }
  }
);
