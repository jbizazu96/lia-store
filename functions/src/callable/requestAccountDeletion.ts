import { onCall, HttpsError } from "firebase-functions/v2/https";

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