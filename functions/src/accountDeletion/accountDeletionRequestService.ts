/*
|--------------------------------------------------------------------------
| Account Deletion Request Service
|--------------------------------------------------------------------------
|
| Creates account deletion requests without deleting the account.
|
| This service is responsible for:
|
| - Validating request input
| - Preventing duplicate active requests
| - Creating accountDeletionRequests/{requestId}
| - Returning the existing request when one is already pending
|
| It does not:
|
| - Approve requests
| - Schedule deletion
| - Delete external accounts
| - Delete Firestore data
| - Delete Firebase Authentication users
|
*/

import {createHash} from "crypto";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  AccountDeletionOwnerType,
  AccountDeletionReasonCode,
  AccountDeletionRequestStatus,
  CreateAccountDeletionRequestInput,
  CreateAccountDeletionRequestResult,
} from "./accountDeletionRequestTypes";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const ACTIVE_REQUEST_STATUSES:
  AccountDeletionRequestStatus[] = [
    "pending_review",
    "more_information_required",
    "approved",
    "scheduled",
    "processing",
    "failed",
  ];

const VALID_OWNER_TYPES =
  new Set<AccountDeletionOwnerType>([
    "driver",
    "store",
    "customer",
  ]);

const VALID_REASON_CODES =
  new Set<AccountDeletionReasonCode>([
    "no_longer_needed",
    "privacy_concerns",
    "created_by_mistake",
    "switching_platforms",
    "service_dissatisfaction",
    "other",
  ]);

/*
|--------------------------------------------------------------------------
| Service Error
|--------------------------------------------------------------------------
*/

export class AccountDeletionRequestServiceError extends Error {
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
      "AccountDeletionRequestServiceError";

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
    throw new AccountDeletionRequestServiceError(
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
    throw new AccountDeletionRequestServiceError(
      `${fieldName} contains invalid characters.`,
      {
        code: "invalid-argument",
      }
    );
  }

  return normalized;
}

function validateOwnerType(
  value: AccountDeletionOwnerType
): AccountDeletionOwnerType {
  if (!VALID_OWNER_TYPES.has(value)) {
    throw new AccountDeletionRequestServiceError(
      "The account owner type is invalid.",
      {
        code: "invalid-owner-type",
      }
    );
  }

  return value;
}

function validateReasonCode(
  value: AccountDeletionReasonCode
): AccountDeletionReasonCode {
  if (!VALID_REASON_CODES.has(value)) {
    throw new AccountDeletionRequestServiceError(
      "The account deletion reason is invalid.",
      {
        code: "invalid-reason-code",
      }
    );
  }

  return value;
}

function normalizeReasonDetails(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > 1_000) {
    throw new AccountDeletionRequestServiceError(
      "The account deletion reason details are too long.",
      {
        code: "invalid-argument",
      }
    );
  }

  return normalized;
}

function requestLockId(ownerType: AccountDeletionOwnerType, ownerId: string): string {
  return `${ownerType}_${createHash("sha256").update(ownerId).digest("hex")}`;
}

/*
|--------------------------------------------------------------------------
| Request Service
|--------------------------------------------------------------------------
*/

export const accountDeletionRequestService = {
  async createRequest(
    input: CreateAccountDeletionRequestInput
  ): Promise<CreateAccountDeletionRequestResult> {
    const ownerType =
      validateOwnerType(
        input.ownerType
      );

    const ownerId =
      requireIdentifier(
        input.ownerId,
        "Owner ID"
      );

    const requestedBy =
      requireIdentifier(
        input.requestedBy,
        "Requested by"
      );

    const reasonCode =
      validateReasonCode(
        input.reasonCode
      );

    const reasonDetails =
      normalizeReasonDetails(
        input.reasonDetails
      );

    if (ownerId !== requestedBy) {
      throw new AccountDeletionRequestServiceError(
        "You cannot submit a deletion request for another account.",
        {
          code: "permission-denied",
        }
      );
    }

    const db =
      getFirestore("default");

    const requestsCollection =
      db.collection(
        "accountDeletionRequests"
      );

    try {
      /*
       * Query for active requests belonging to the same account.
       *
       * If one exists, return it instead of creating a duplicate.
       */
      const existingRequestQuery = requestsCollection
          .where(
            "ownerType",
            "==",
            ownerType
          )
          .where(
            "ownerId",
            "==",
            ownerId
          )
          .where(
            "status",
            "in",
            ACTIVE_REQUEST_STATUSES
          )
          .limit(1);
      const lockReference = db.collection("accountDeletionRequestLocks")
        .doc(requestLockId(ownerType, ownerId));
      const newRequestReference = requestsCollection.doc();
      let result: CreateAccountDeletionRequestResult | null = null;

      await db.runTransaction(async (transaction) => {
        await transaction.get(lockReference);
        const existingRequestSnapshot = await transaction.get(existingRequestQuery);
        const userReference = db.collection("users").doc(ownerId);
        const userSnapshot = await transaction.get(userReference);
        if (!userSnapshot.exists) {
          throw new AccountDeletionRequestServiceError(
            "The account profile was not found.",
            {code: "account-not-found"}
          );
        }
        const ownedStores = ownerType === "store" ?
          await transaction.get(db.collection("stores").where("ownerId", "==", ownerId)) :
          null;

        const lockAccount = (requestId: string) => {
          transaction.update(userReference, {
            accountDeletionState: "deletion_pending",
            accountDeletionRequestId: requestId,
            updatedAt: FieldValue.serverTimestamp(),
          });
          ownedStores?.docs.forEach((store) => {
            transaction.update(store.ref, {
              isActive: false,
              isApproved: false,
              status: "pending_review",
              accountDeletionRequestId: requestId,
              accountDeletionDisabledAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          });
        };

        if (!existingRequestSnapshot.empty) {
          const existingDocument = existingRequestSnapshot.docs[0];
          const existingStatus = existingDocument.data().status as
            AccountDeletionRequestStatus;
          transaction.set(lockReference, {
            ownerType,
            ownerId,
            requestId: existingDocument.id,
            updatedAt: FieldValue.serverTimestamp(),
          });
          lockAccount(existingDocument.id);
          result = {
            requestId: existingDocument.id,
            ownerType,
            ownerId,
            status: existingStatus,
            alreadyPending: true,
          };
          return;
        }

        transaction.set(newRequestReference, {
          ownerType,
          ownerId,
          requestedBy,
          reasonCode,
          reasonDetails,
          status: "pending_review",
          adminDecision: {
            adminId: null,
            decision: null,
            notes: null,
            decidedAt: null,
          },
          scheduledDeletionAt: null,
          workflow: {
            currentStep: "not_started",
            completedSteps: [],
            failedStep: null,
            attemptCount: 0,
            retryCount: 0,
            lastError: null,
            startedAt: null,
            completedAt: null,
            failedAt: null,
            nextRetryAt: null,
            leaseExpiresAt: null,
            leaseToken: null,
            deletionContext: null,
          },
          requestedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(lockReference, {
          ownerType,
          ownerId,
          requestId: newRequestReference.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
        lockAccount(newRequestReference.id);
        result = {
          requestId: newRequestReference.id,
          ownerType,
          ownerId,
          status: "pending_review",
          alreadyPending: false,
        };
      });

      if (!result) {
        throw new AccountDeletionRequestServiceError(
          "The account deletion request transaction returned no result.",
          {code: "request-creation-failed"}
        );
      }
      return result;
    } catch (error: unknown) {
      if (
        error instanceof
        AccountDeletionRequestServiceError
      ) {
        throw error;
      }

      const causeMessage =
        error instanceof Error
          ? error.message
          : "Unknown account deletion request error.";

      throw new AccountDeletionRequestServiceError(
        "The account deletion request could not be created.",
        {
          code:
            "request-creation-failed",

          causeMessage,
        }
      );
    }
  },
};
