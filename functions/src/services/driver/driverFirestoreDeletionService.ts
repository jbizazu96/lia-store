/*
|--------------------------------------------------------------------------
| Driver Firestore Deletion Service
|--------------------------------------------------------------------------
|
| Deletes Firestore data owned by a driver account.
|
| Current driver account documents:
|
| drivers/{driverId}
| users/{driverId}
|
| Firestore does not automatically delete subcollections when a document is
| deleted. For that reason, this service uses recursiveDelete() instead of
| calling documentReference.delete().
|
| This service may run only from trusted server-side workflow code.
|
| A driver cannot call this service directly.
|
| The service verifies that an account deletion request:
|
| - Exists
| - Belongs to the driver
| - Has ownerType === "driver"
| - Is currently processing
| - Has reached the deleting_firestore workflow step
|
*/

import {
  DocumentReference,
  getFirestore,
} from "firebase-admin/firestore";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface DeleteDriverFirestoreInput {
  requestId: string;
  driverId: string;
}

export interface DeleteDriverFirestoreResult {
  requestId: string;
  driverId: string;
  driverDocumentDeleted: boolean;
  userDocumentDeleted: boolean;
}

/*
|--------------------------------------------------------------------------
| Service Error
|--------------------------------------------------------------------------
*/

export class DriverFirestoreDeletionServiceError extends Error {
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
      "DriverFirestoreDeletionServiceError";

    this.code =
      options.code;

    this.causeMessage =
      options.causeMessage ?? null;
  }
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
  const normalized =
    value.trim();

  if (!normalized) {
    throw new DriverFirestoreDeletionServiceError(
      `${fieldName} is required.`,
      {
        code: "invalid-argument",
      }
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new DriverFirestoreDeletionServiceError(
      `${fieldName} contains invalid characters.`,
      {
        code: "invalid-argument",
      }
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Deletion Request Validation
|--------------------------------------------------------------------------
*/

async function validateDeletionRequest(
  requestReference: DocumentReference,
  driverId: string
): Promise<void> {
  const requestSnapshot =
    await requestReference.get();

  if (!requestSnapshot.exists) {
    throw new DriverFirestoreDeletionServiceError(
      "The account deletion request was not found.",
      {
        code: "request-not-found",
      }
    );
  }

  const request =
    requestSnapshot.data();

  if (!request) {
    throw new DriverFirestoreDeletionServiceError(
      "The account deletion request is empty.",
      {
        code: "invalid-request",
      }
    );
  }

  if (request.ownerType !== "driver") {
    throw new DriverFirestoreDeletionServiceError(
      "The deletion request does not belong to a driver account.",
      {
        code: "invalid-owner-type",
      }
    );
  }

  if (request.ownerId !== driverId) {
    throw new DriverFirestoreDeletionServiceError(
      "The deletion request does not belong to this driver.",
      {
        code: "request-owner-mismatch",
      }
    );
  }

  if (request.status !== "processing") {
    throw new DriverFirestoreDeletionServiceError(
      "The deletion request is not currently processing.",
      {
        code: "invalid-request-status",
      }
    );
  }

  if (
    request.workflow?.currentStep !==
    "deleting_firestore"
  ) {
    throw new DriverFirestoreDeletionServiceError(
      "The deletion workflow has not reached the Firestore deletion step.",
      {
        code: "deletion-not-ready",
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Driver Document Validation
|--------------------------------------------------------------------------
*/

async function validateDriverDocument(
  driverReference: DocumentReference,
  driverId: string
): Promise<void> {
  const driverSnapshot =
    await driverReference.get();

  /*
   * A missing driver document is allowed.
   *
   * This makes the operation retry-safe. A previous attempt may have deleted
   * the driver document before another later operation failed.
   */
  if (!driverSnapshot.exists) {
    return;
  }

  const driver =
    driverSnapshot.data();

  const ownerUid =
    typeof driver?.ownerUid === "string"
      ? driver.ownerUid.trim()
      : "";

  /*
   * Some driver documents may not contain ownerUid if their document ID is
   * already the Firebase Authentication UID.
   *
   * When ownerUid exists, it must match the driver ID.
   */
  if (
    ownerUid &&
    ownerUid !== driverId
  ) {
    throw new DriverFirestoreDeletionServiceError(
      "The driver document ownership information does not match.",
      {
        code: "driver-owner-mismatch",
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Driver Firestore Deletion Service
|--------------------------------------------------------------------------
*/

export const driverFirestoreDeletionService = {
  async deleteDriverDocuments(
    input: DeleteDriverFirestoreInput
  ): Promise<DeleteDriverFirestoreResult> {
    const requestId =
      requireIdentifier(
        input.requestId,
        "Deletion request ID"
      );

    const driverId =
      requireIdentifier(
        input.driverId,
        "Driver ID"
      );

    const db =
      getFirestore("default");

    const requestReference =
      db
        .collection(
          "accountDeletionRequests"
        )
        .doc(requestId);

    const driverReference =
      db
        .collection("drivers")
        .doc(driverId);

    const userReference =
      db
        .collection("users")
        .doc(driverId);

    try {
      /*
       * Validate the workflow request before deleting account data.
       */
      await validateDeletionRequest(
        requestReference,
        driverId
      );

      /*
       * Validate the driver document when it still exists.
       */
      await validateDriverDocument(
        driverReference,
        driverId
      );

      const [
        driverSnapshot,
        userSnapshot,
      ] =
        await Promise.all([
          driverReference.get(),
          userReference.get(),
        ]);

      /*
       * recursiveDelete removes the document and all nested
       * subcollections beneath it.
       *
       * Existence checks make retries safe.
       */
      if (driverSnapshot.exists) {
        await db.recursiveDelete(
          driverReference
        );
      }

      if (userSnapshot.exists) {
        await db.recursiveDelete(
          userReference
        );
      }

      return {
        requestId,
        driverId,

        driverDocumentDeleted:
          driverSnapshot.exists,

        userDocumentDeleted:
          userSnapshot.exists,
      };
    } catch (error: unknown) {
      if (
        error instanceof
        DriverFirestoreDeletionServiceError
      ) {
        throw error;
      }

      const causeMessage =
        error instanceof Error
          ? error.message
          : "Unknown Firestore deletion error.";

      throw new DriverFirestoreDeletionServiceError(
        "The driver's Firestore data could not be deleted.",
        {
          code:
            "firestore-deletion-failed",

          causeMessage,
        }
      );
    }
  },
};