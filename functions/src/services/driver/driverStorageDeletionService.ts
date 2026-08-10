/*
|--------------------------------------------------------------------------
| Driver Storage Deletion Service
|--------------------------------------------------------------------------
|
| Deletes every Firebase Storage object owned by a driver.
|
| Current driver image layout:
|
| drivers/{driverId}/images/originals/{field}/{imageId}.{extension}
| drivers/{driverId}/images/optimized/{field}/{imageId}.webp
|
| Instead of deleting individual files from Firestore metadata, this service
| deletes everything beneath the driver's owner prefix:
|
| drivers/{driverId}/
|
| This protects us from leaving orphaned images when:
|
| - A Firestore path field is missing
| - An image replacement did not finish
| - An old image is no longer referenced
| - A previous upload failed midway
|
| This service must only run in trusted server-side code.
|
*/

import {
  getStorage,
} from "firebase-admin/storage";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface DeleteDriverStorageResult {
  driverId: string;
  prefix: string;
  deletedFileCount: number;
}

/*
|--------------------------------------------------------------------------
| Service Error
|--------------------------------------------------------------------------
*/

export class DriverStorageDeletionServiceError extends Error {
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
      "DriverStorageDeletionServiceError";

    this.code = options.code;

    this.causeMessage =
      options.causeMessage ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

function requireDriverId(
  value: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new DriverStorageDeletionServiceError(
      "Driver ID is required.",
      {
        code: "invalid-driver-id",
      }
    );
  }

  /*
   * Firebase Authentication UIDs do not contain path separators.
   *
   * Rejecting them here prevents a malformed value from changing the
   * intended Storage prefix.
   */
  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new DriverStorageDeletionServiceError(
      "Driver ID contains invalid characters.",
      {
        code: "invalid-driver-id",
      }
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Driver Storage Deletion Service
|--------------------------------------------------------------------------
*/

export const driverStorageDeletionService = {
  /*
   * Delete every image stored beneath the driver's image prefix.
   *
   * The operation is naturally idempotent:
   *
   * - If files exist, they are deleted.
   * - If no files exist, the service succeeds with deletedFileCount = 0.
   */
  async deleteDriverImages(
    driverIdInput: string
  ): Promise<DeleteDriverStorageResult> {
    const driverId =
      requireDriverId(driverIdInput);

    const prefix =
      `drivers/${driverId}/`;

    const bucket =
      getStorage().bucket();

    try {
      /*
       * Retrieve all matching objects first so we can report how many files
       * were present before deletion.
       */
      const [files] =
        await bucket.getFiles({
          prefix,
        });

      if (files.length === 0) {
        return {
          driverId,
          prefix,
          deletedFileCount: 0,
        };
      }

      /*
       * force: true prevents the cleanup operation from failing when one of
       * the matching objects disappears between listing and deletion.
       */
      await bucket.deleteFiles({
        prefix,
        force: true,
      });

      return {
        driverId,
        prefix,
        deletedFileCount:
          files.length,
      };
    } catch (error: unknown) {
      const causeMessage =
        error instanceof Error
          ? error.message
          : "Unknown Firebase Storage deletion error.";

      throw new DriverStorageDeletionServiceError(
        "The driver's Firebase Storage images could not be deleted.",
        {
          code:
            "driver-storage-deletion-failed",

          causeMessage,
        }
      );
    }
  },
};
