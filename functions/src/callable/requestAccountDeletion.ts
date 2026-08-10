import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  FieldValue,
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
import {restoreAccountDeletionAccess} from "../accountDeletion/accountDeletionAccessService";

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

const MAXIMUM_AUTH_AGE_SECONDS = 5 * 60;

function requireRecentAuthentication(authTime: unknown): void {
  if (typeof authTime !== "number" ||
    Math.floor(Date.now() / 1000) - authTime > MAXIMUM_AUTH_AGE_SECONDS) {
    throw new HttpsError(
      "failed-precondition",
      "Sign in again before managing account deletion."
    );
  }
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
    requireRecentAuthentication(request.auth.token.auth_time);

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
      if (error instanceof HttpsError) {
        throw error;
      }

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

export const cancelAccountDeletion = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  requireRecentAuthentication(request.auth.token.auth_time);
  const uid = request.auth.uid;
  const requestId = typeof request.data?.requestId === "string" ?
    request.data.requestId.trim() : "";
  if (!requestId || requestId.includes("/") || requestId.includes("\\")) {
    throw new HttpsError("invalid-argument", "A valid deletion request is required.");
  }

  const db = getFirestore("default");
  const reference = db.collection("accountDeletionRequests").doc(requestId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    if (!snapshot.exists || !data || data.ownerId !== uid) {
      throw new HttpsError("not-found", "Deletion request not found.");
    }
    if (!["pending_review", "more_information_required", "approved", "scheduled"]
      .includes(data.status)) {
      throw new HttpsError(
        "failed-precondition",
        "This deletion request can no longer be cancelled."
      );
    }
    transaction.update(reference, {
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: uid,
      scheduledDeletionAt: null,
      "workflow.nextRetryAt": null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection("users").doc(uid), {
      accountDeletionState: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  await restoreAccountDeletionAccess(uid);
  return {success: true};
});
