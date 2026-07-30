/*
|--------------------------------------------------------------------------
| Driver Authentication Deletion Service
|--------------------------------------------------------------------------
|
| Deletes the Firebase Authentication user belonging to a driver account.
|
| This service must run only from trusted server-side workflow code.
|
| Before deleting the Firebase Authentication account, it verifies that:
|
| - The account deletion request exists
| - The request belongs to the driver
| - The request has ownerType === "driver"
| - The request is currently processing
| - The workflow has reached deleting_authentication
|
| The operation is retry-safe:
|
| If the Firebase Authentication user was already deleted by a previous
| attempt, the service returns successfully instead of failing.
|
*/

import {
  getAuth,
} from "firebase-admin/auth";

import {
  DocumentReference,
  getFirestore,
} from "firebase-admin/firestore";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface DeleteDriverAuthInput {
  requestId: string;
  driverId: string;
}

export interface DeleteDriverAuthResult {
  requestId: string;
  driverId: string;
  authenticationUserDeleted: boolean;
  alreadyDeleted: boolean;
}

/*
|--------------------------------------------------------------------------
| Service Error
|--------------------------------------------------------------------------
*/

export class DriverAuthDeletionServiceError extends Error {
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
      "DriverAuthDeletionServiceError";

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
    throw new DriverAuthDeletionServiceError(
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
    throw new DriverAuthDeletionServiceError(
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
    throw new DriverAuthDeletionServiceError(
      "The account deletion request was not found.",
      {
        code: "request-not-found",
      }
    );
  }

  const request =
    requestSnapshot.data();

  if (!request) {
    throw new DriverAuthDeletionServiceError(
      "The account deletion request is empty.",
      {
        code: "invalid-request",
      }
    );
  }

  if (request.ownerType !== "driver") {
    throw new DriverAuthDeletionServiceError(
      "The deletion request does not belong to a driver account.",
      {
        code: "invalid-owner-type",
      }
    );
  }

  if (request.ownerId !== driverId) {
    throw new DriverAuthDeletionServiceError(
      "The deletion request does not belong to this driver.",
      {
        code: "request-owner-mismatch",
      }
    );
  }

  if (request.status !== "processing") {
    throw new DriverAuthDeletionServiceError(
      "The deletion request is not currently processing.",
      {
        code: "invalid-request-status",
      }
    );
  }

  if (
    request.workflow?.currentStep !==
    "deleting_authentication"
  ) {
    throw new DriverAuthDeletionServiceError(
      "The deletion workflow has not reached the authentication deletion step.",
      {
        code: "deletion-not-ready",
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Driver Authentication Deletion Service
|--------------------------------------------------------------------------
*/

export const driverAuthDeletionService = {
  async deleteDriverAuthentication(
    input: DeleteDriverAuthInput
  ): Promise<DeleteDriverAuthResult> {
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

    try {
      await validateDeletionRequest(
        requestReference,
        driverId
      );

      const auth =
        getAuth();

      try {
        await auth.deleteUser(
          driverId
        );
      } catch (error: unknown) {
        /*
         * If the user was already deleted, treat the operation as successful.
         *
         * This allows the deletion engine to retry safely.
         */
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code ===
            "auth/user-not-found"
        ) {
          return {
            requestId,
            driverId,
            authenticationUserDeleted:
              false,
            alreadyDeleted:
              true,
          };
        }

        throw error;
      }

      return {
        requestId,
        driverId,
        authenticationUserDeleted:
          true,
        alreadyDeleted:
          false,
      };
    } catch (error: unknown) {
      if (
        error instanceof
        DriverAuthDeletionServiceError
      ) {
        throw error;
      }

      const causeMessage =
        error instanceof Error
          ? error.message
          : "Unknown authentication deletion error.";

      throw new DriverAuthDeletionServiceError(
        "The driver's Firebase Authentication account could not be deleted.",
        {
          code:
            "authentication-deletion-failed",

          causeMessage,
        }
      );
    }
  },
};