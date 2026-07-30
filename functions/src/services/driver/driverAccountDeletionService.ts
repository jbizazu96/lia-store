/*
|--------------------------------------------------------------------------
| Driver Account Deletion Service
|--------------------------------------------------------------------------
|
| Coordinates server-side deletion steps for an LIA driver account.
|
| This first version is responsible for:
|
| - Loading and validating the driver document
| - Confirming that the authenticated user owns the driver account
| - Preventing duplicate deletion requests
| - Deleting the driver's Shipday carrier
| - Recording deletion progress in Firestore
|
| Later steps will add:
|
| - Active-delivery protection
| - Earnings and payout checks
| - Firebase Storage cleanup
| - Driver document anonymization or deletion
| - Firebase Authentication deletion
|
| This service must only be called from trusted server-side code.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  shipdayCarrierService,
  ShipdayCarrierServiceError,
} from "../shipday/carrierService";

import {
  DriverStorageDeletionServiceError,
  driverStorageDeletionService,
} from "./driverStorageDeletionService";

import Stripe from "stripe";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

interface DriverShipdayData {
  carrierId: number | null;
  connectionStatus: string | null;
}

interface DriverDeletionData {
  status: string | null;
}

interface DriverAccountData {
  ownerUid: string | null;
  shipday: DriverShipdayData;
  accountDeletion: DriverDeletionData;
}

export interface DeleteDriverShipdayCarrierResult {
  driverId: string;
  carrierId: number | null;
  carrierDeleted: boolean;
  alreadyDisconnected: boolean;
  storageDeleted: boolean;
  deletedStorageFileCount: number;
}

/*
|--------------------------------------------------------------------------
| Service Error
|--------------------------------------------------------------------------
*/

export class DriverAccountDeletionServiceError extends Error {
  readonly code: string;
  readonly causeMessage: string | null;

  constructor(
    message: string,
    options: {
      code: string;
      causeMessage?: string;
    }
  ) {
    super(message);

    this.name =
      "DriverAccountDeletionServiceError";

    this.code = options.code;

    this.causeMessage =
      options.causeMessage ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Normalization Helpers
|--------------------------------------------------------------------------
*/

function nullableString(
  value: unknown
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function nullablePositiveInteger(
  value: unknown
): number | null {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  )
    ? value
    : null;
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function mapDriverAccountData(
  value: unknown
): DriverAccountData {
  if (!isRecord(value)) {
    throw new DriverAccountDeletionServiceError(
      "The driver account contains invalid data.",
      {
        code: "invalid-driver-data",
      }
    );
  }

  const shipdayData =
    isRecord(value.shipday)
      ? value.shipday
      : {};

  const accountDeletionData =
    isRecord(value.accountDeletion)
      ? value.accountDeletion
      : {};

  return {
    ownerUid:
      nullableString(value.ownerUid),

    shipday: {
      carrierId:
        nullablePositiveInteger(
          shipdayData.carrierId
        ),

      connectionStatus:
        nullableString(
          shipdayData.connectionStatus
        ),
    },

    accountDeletion: {
      status:
        nullableString(
          accountDeletionData.status
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function requireIdentifier(
  value: string,
  fieldName: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new DriverAccountDeletionServiceError(
      `${fieldName} is required.`,
      {
        code: "invalid-argument",
      }
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Driver Account Deletion Service
|--------------------------------------------------------------------------
*/

export const driverAccountDeletionService = {
  /*
   * Delete the driver's connected Shipday carrier.
   *
   * This operation is intentionally idempotent:
   *
   * - If no carrier ID exists, the driver is treated as already
   *   disconnected.
   * - If Firestore already records the Shipday connection as deleted,
   *   Shipday is not called again.
   *
   * The driver document itself is not deleted by this method.
   */
  async deleteDriverAccount(
  input: {
      driverId: string;
      authenticatedUid: string;

      /*
      * External services are injected by the caller.
      *
      * Stripe is optional for now because we will integrate it in the
      * next lesson after the dependency injection is complete.
      */
      stripe?: Stripe;
    }
  ): Promise<DeleteDriverShipdayCarrierResult> {
    const driverId =
      requireIdentifier(
        input.driverId,
        "Driver ID"
      );

    const authenticatedUid =
      requireIdentifier(
        input.authenticatedUid,
        "Authenticated user ID"
      );

    const db =
      getFirestore("default");

    const driverReference =
      db.collection("drivers").doc(driverId);

    /*
     * Mark the account deletion workflow as started.
     *
     * The transaction protects against two deletion requests trying to
     * operate on the same driver account simultaneously.
     */
    const deletionClaim =
      await db.runTransaction(
        async (transaction) => {
          const snapshot =
            await transaction.get(
              driverReference
            );

          if (!snapshot.exists) {
            throw new DriverAccountDeletionServiceError(
              "The driver account was not found.",
              {
                code: "driver-not-found",
              }
            );
          }

          const driver =
            mapDriverAccountData(
              snapshot.data()
            );

          if (
            driver.ownerUid !==
            authenticatedUid
          ) {
            throw new DriverAccountDeletionServiceError(
              "You are not authorized to delete this driver account.",
              {
                code: "permission-denied",
              }
            );
          }

          if (
            driver.accountDeletion.status ===
            "processing"
          ) {
            throw new DriverAccountDeletionServiceError(
              "Driver account deletion is already being processed.",
              {
                code:
                  "deletion-already-processing",
              }
            );
          }

          const alreadyDisconnected =
            driver.shipday.carrierId ===
              null ||
            driver.shipday.connectionStatus ===
              "deleted";

          transaction.set(
            driverReference,
            {
              accountDeletion: {
                status:
                  alreadyDisconnected
                    ? "shipday_disconnected"
                    : "processing",

                requestedAt:
                  FieldValue.serverTimestamp(),

                requestedBy:
                  authenticatedUid,

                currentStep:
                  alreadyDisconnected
                    ? "shipday_complete"
                    : "deleting_shipday_carrier",

                error: null,
              },

              updatedAt:
                FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          return {
            carrierId:
              driver.shipday.carrierId,

            alreadyDisconnected,
          };
        }
      );

    /*
     * No Shipday carrier exists, or it was already removed during an
     * earlier attempt.
     */
    if (
  deletionClaim.alreadyDisconnected
) {
  try {
    await driverReference.set(
      {
        accountDeletion: {
          status:
            "deleting_storage",

          currentStep:
            "deleting_driver_images",

          error: null,
        },

        updatedAt:
          FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    const storageResult =
      await driverStorageDeletionService
        .deleteDriverImages(driverId);

    await driverReference.set(
      {
        accountDeletion: {
          status:
            "storage_deleted",

          currentStep:
            "storage_complete",

          storageCompletedAt:
            FieldValue.serverTimestamp(),

          deletedStorageFileCount:
            storageResult.deletedFileCount,

          error: null,
        },

        updatedAt:
          FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    return {
      driverId,

      carrierId:
        deletionClaim.carrierId,

      carrierDeleted: false,
      alreadyDisconnected: true,
      storageDeleted: true,

      deletedStorageFileCount:
        storageResult.deletedFileCount,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown driver Storage deletion error.";

    await driverReference.set(
      {
        accountDeletion: {
          status: "failed",

          currentStep:
            "deleting_driver_images",

          failedAt:
            FieldValue.serverTimestamp(),

          error:
            errorMessage,
        },

        updatedAt:
          FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    if (
      error instanceof
      DriverStorageDeletionServiceError
    ) {
      throw new DriverAccountDeletionServiceError(
        "The driver's stored images could not be deleted.",
        {
          code:
            "storage-deletion-failed",

          causeMessage:
            error.causeMessage ??
            error.message,
        }
      );
    }

    throw new DriverAccountDeletionServiceError(
      "The driver account deletion workflow failed while deleting stored images.",
      {
        code:
          "storage-deletion-failed",

        causeMessage:
          errorMessage,
      }
    );
  }
}

    const carrierId =
      deletionClaim.carrierId;

    if (carrierId === null) {
      /*
       * This guard should be unreachable because alreadyDisconnected
       * would be true when carrierId is null. It remains here to keep
       * the external API call fully type-safe.
       */
      throw new DriverAccountDeletionServiceError(
        "The driver does not have a valid Shipday carrier ID.",
        {
          code: "missing-carrier-id",
        }
      );
    }

    try {
      const deletionResult =
        await shipdayCarrierService.deleteCarrier(
          carrierId
        );

      await driverReference.set(
        {
          shipday: {
            carrierId: null,
            connectionStatus: "deleted",
            credentialsStatus: null,
            isActive: false,
            isOnShift: false,
            operationalStatus: "offline",
            latitude: null,
            longitude: null,
            syncError: null,

            disconnectedAt:
              FieldValue.serverTimestamp(),

            deletionResponse:
              deletionResult.response,
          },

          accountDeletion: {
            status:
              "deleting_storage",

            currentStep:
              "deleting_driver_images",

            shipdayCompletedAt:
              FieldValue.serverTimestamp(),

            error: null,
          },

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      const storageResult =
        await driverStorageDeletionService
          .deleteDriverImages(driverId);

      await driverReference.set(
        {
          accountDeletion: {
            status:
              "storage_deleted",

            currentStep:
              "storage_complete",

            storageCompletedAt:
              FieldValue.serverTimestamp(),

            deletedStorageFileCount:
              storageResult.deletedFileCount,

            error: null,
          },

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        driverId,
        carrierId,
        carrierDeleted: true,
        alreadyDisconnected: false,
        storageDeleted: true,

        deletedStorageFileCount:
          storageResult.deletedFileCount,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown Shipday carrier deletion error.";

      await driverReference.set(
        {
          accountDeletion: {
            status: "failed",
            currentStep:
              "deleting_shipday_carrier",

            failedAt:
              FieldValue.serverTimestamp(),

            error: errorMessage,
          },

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      if (
          error instanceof
            DriverStorageDeletionServiceError
        ) {
          throw new DriverAccountDeletionServiceError(
            "The Shipday carrier was deleted, but the driver's stored images could not be deleted.",
            {
              code:
                "storage-deletion-failed",

              causeMessage:
                error.causeMessage ??
                error.message,
            }
          );
        }

        if (
          error instanceof
            ShipdayCarrierServiceError
        ) {
          throw new DriverAccountDeletionServiceError(
            "Shipday could not delete the driver's carrier account.",
            {
              code:
                "shipday-deletion-failed",

              causeMessage:
                error.responseBody ??
                error.message,
            }
          );
        }

      throw new DriverAccountDeletionServiceError(
        "The driver account deletion workflow failed while disconnecting Shipday.",
        {
          code:
            "shipday-deletion-failed",

          causeMessage:
            errorMessage,
        }
      );
    }
  },
};