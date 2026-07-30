/*
|--------------------------------------------------------------------------
| Delete Driver Account Callable
|--------------------------------------------------------------------------
|
| Authenticated Firebase callable entry point for the driver account
| deletion workflow.
|
| Security rules:
|
| - The caller must be authenticated.
| - The authenticated Firebase UID is used as the driver document ID.
| - The client cannot submit another driver's ID.
| - The Shipday API key is attached as a Firebase secret.
|
| Current deletion phase:
|
| - Verify the caller owns the driver account
| - Delete the connected Shipday carrier
| - Save deletion progress in Firestore
|
| Later phases will add:
|
| - Active-delivery validation
| - Earnings and payout validation
| - Storage cleanup
| - Firestore deletion or anonymization
| - Firebase Authentication deletion
|
*/

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  DriverAccountDeletionServiceError,
  driverAccountDeletionService,
} from "../services/driver/driverAccountDeletionService";

/*
|--------------------------------------------------------------------------
| Firebase Secrets
|--------------------------------------------------------------------------
|
| The carrier service reads:
|
| process.env.SHIPDAY_API_KEY
|
| Binding the secret here makes it available to the callable function at
| runtime without exposing it to the browser.
|
*/

const SHIPDAY_API_KEY =
  defineSecret("SHIPDAY_API_KEY");

/*
|--------------------------------------------------------------------------
| Error Mapping
|--------------------------------------------------------------------------
*/

function mapDeletionError(
  error: DriverAccountDeletionServiceError
): HttpsError {
  switch (error.code) {
    case "invalid-argument":
      return new HttpsError(
        "invalid-argument",
        error.message
      );

    case "driver-not-found":
      return new HttpsError(
        "not-found",
        error.message
      );

    case "permission-denied":
      return new HttpsError(
        "permission-denied",
        error.message
      );

    case "deletion-already-processing":
      return new HttpsError(
        "already-exists",
        error.message
      );

    case "missing-carrier-id":
      return new HttpsError(
        "failed-precondition",
        error.message
      );

    case "shipday-deletion-failed":
      return new HttpsError(
        "unavailable",
        error.message,
        {
          causeMessage:
            error.causeMessage,
        }
      );

      case "storage-deletion-failed":
        return new HttpsError(
          "internal",
          error.message,
          {
            causeMessage:
              error.causeMessage,
          }
        );

    case "invalid-driver-data":
      return new HttpsError(
        "data-loss",
        error.message
      );

    default:
      return new HttpsError(
        "internal",
        "The driver account deletion request failed."
      );
  }
}

/*
|--------------------------------------------------------------------------
| Callable Function
|--------------------------------------------------------------------------
*/

export const deleteDriverAccount =
  onCall(
    {
      region: "us-central1",

      secrets: [
        SHIPDAY_API_KEY,
      ],

      /*
       * Account deletion is sensitive. App Check enforcement can be enabled
       * after App Check is configured for every supported LIA client.
       */
      enforceAppCheck: false,
    },

    async (request) => {
      /*
       * Firebase verifies the ID token before populating request.auth.
       */
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "You must be signed in to delete your driver account."
        );
      }

      const authenticatedUid =
        request.auth.uid;

      try {
        /*
         * Driver document IDs currently match Firebase Authentication UIDs.
         *
         * We intentionally do not accept driverId from request.data because
         * that would allow a malicious client to attempt deletion against a
         * different driver account.
         */
        const result =
          await driverAccountDeletionService
            .deleteDriverAccount({
              driverId:
                authenticatedUid,

              authenticatedUid,
            });

        return {
          success: true,

          deletionStatus:
            "storage_deleted",

          driverId:
            result.driverId,

          carrierDeleted:
            result.carrierDeleted,

          alreadyDisconnected:
            result.alreadyDisconnected,

          storageDeleted:
            result.storageDeleted,

          deletedStorageFileCount:
            result.deletedStorageFileCount,

          message:
            result.alreadyDisconnected
              ? "The driver was already disconnected from Shipday, and the stored images were deleted successfully."
              : "The Shipday carrier and stored driver images were deleted successfully.",
        };
      } catch (error: unknown) {
        if (
          error instanceof
          DriverAccountDeletionServiceError
        ) {
          throw mapDeletionError(error);
        }

        console.error(
          "Unexpected driver account deletion error.",
          {
            authenticatedUid,
            error,
          }
        );

        throw new HttpsError(
          "internal",
          "The driver account deletion request failed unexpectedly."
        );
      }
    }
  );