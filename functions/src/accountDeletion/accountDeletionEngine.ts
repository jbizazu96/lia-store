/*
|--------------------------------------------------------------------------
| Account Deletion Engine
|--------------------------------------------------------------------------
|
| Coordinates the complete account deletion workflow.
|
| The engine does not implement deletion logic itself. It delegates each
| destructive operation to a specialized service.
|
| Customer, driver, and store workflow:
|
| 1. Validate the approved or retryable deletion request
| 2. Load the role-specific deletion context once
| 3. Mark the request as processing
| 4. Execute each workflow step
| 5. Record the exact failed step if an operation throws
| 6. Mark the request as completed when every step succeeds
|
*/

import Stripe from "stripe";
import { randomUUID } from "crypto";
import {getAuth} from "firebase-admin/auth";
import {getStorage} from "firebase-admin/storage";

import {
  DocumentReference,
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";

import {
  stripeAccountLifecycleService,
} from "../stripe/stripeAccountLifecycleService";

import {
  driverAuthDeletionService,
} from "../services/driver/driverAuthDeletionService";

import {
  driverFirestoreDeletionService,
} from "../services/driver/driverFirestoreDeletionService";

import {
  driverStorageDeletionService,
} from "../services/driver/driverStorageDeletionService";

import {
  shipdayCarrierService,
} from "../services/shipday/carrierService";

import {
  AccountDeletionWorkflowStep,
} from "./accountDeletionRequestTypes";

import {
  accountDeletionValidationService,
} from "./accountDeletionValidationService";
import {
  customerAccountDeletionService,
  type CustomerDeletionContext,
} from "./customerAccountDeletionService";
import {
  storeAccountDeletionService,
  type StoreDeletionContext,
} from "./storeAccountDeletionService";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface ProcessAccountDeletionInput {
  requestId: string;
  stripe: Stripe;
}

/*
|--------------------------------------------------------------------------
| Internal Types
|--------------------------------------------------------------------------
*/

interface DeletionRequestData {
  ownerType: string;
  ownerId: string;
  status: string;
  workflow?: {
    attemptCount?: number;
    retryCount?: number;
    completedSteps?: unknown;
    deletionContext?: unknown;
  };
}

interface DriverDeletionData {
  shipday?: {
    carrierId?: number | string | null;
  };

  stripeAccountId?: string | null;
}

interface DriverDeletionContext {
  requestId: string;
  driverId: string;
  carrierId: number | null;
  stripeAccountId: string | null;
}

interface WorkflowExecutionContext {
  requestId: string;
  requestReference: DocumentReference;
  currentStep: AccountDeletionWorkflowStep;
  completedSteps: Set<AccountDeletionWorkflowStep>;
}

const LEASE_DURATION_MS = 10 * 60 * 1000;
const MAX_AUTOMATIC_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 5 * 60 * 1000;
const RESUMABLE_STEPS = new Set<AccountDeletionWorkflowStep>([
  "deleting_shipday_carrier",
  "closing_stripe_account",
]);

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export class AccountDeletionEngineError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);

    this.name =
      "AccountDeletionEngineError";
  }
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function requireString(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new AccountDeletionEngineError(
      `${fieldName} is missing or invalid.`,
      "invalid-request"
    );
  }

  return value.trim();
}

function optionalString(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

function optionalPositiveNumber(
  value: unknown
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const normalized =
      Number(value.trim());

    if (
      Number.isFinite(normalized) &&
      normalized > 0
    ) {
      return normalized;
    }
  }

  return null;
}

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown account deletion failure.";
}

/*
|--------------------------------------------------------------------------
| Workflow State Helpers
|--------------------------------------------------------------------------
*/

async function updateWorkflowStep(
  context: WorkflowExecutionContext,
  currentStep: AccountDeletionWorkflowStep
): Promise<void> {
  context.currentStep =
    currentStep;

  await context.requestReference.update({
    "workflow.currentStep":
      currentStep,

    updatedAt:
      FieldValue.serverTimestamp(),
  });
}

async function executeWorkflowStep(
  context: WorkflowExecutionContext,
  currentStep: AccountDeletionWorkflowStep,
  action: () => Promise<void>
): Promise<void> {
  if (
    RESUMABLE_STEPS.has(currentStep) &&
    context.completedSteps.has(currentStep)
  ) {
    return;
  }

  await updateWorkflowStep(
    context,
    currentStep
  );

  await action();

  context.completedSteps.add(currentStep);
  await context.requestReference.update({
    "workflow.completedSteps": FieldValue.arrayUnion(currentStep),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function markWorkflowFailed(
  context: WorkflowExecutionContext,
  error: unknown
): Promise<void> {
  const errorMessage =
    getSafeErrorMessage(error);
  const request = await context.requestReference.get();
  const retryCount = request.data()?.workflow?.retryCount ?? 1;
  const retryDelay = Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, retryCount - 1)),
    6 * 60 * 60 * 1000
  );
  const nextRetryAt = retryCount < MAX_AUTOMATIC_ATTEMPTS ?
    Timestamp.fromMillis(Date.now() + retryDelay) : null;

  try {
    await context.requestReference.update({
      status:
        "failed",

      "workflow.currentStep":
        context.currentStep,

      "workflow.failedStep":
        context.currentStep,

      "workflow.lastError":
        errorMessage,

      "workflow.failedAt":
        FieldValue.serverTimestamp(),

      "workflow.nextRetryAt": nextRetryAt,

      "workflow.leaseExpiresAt": null,

      "workflow.leaseToken": null,

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    const ownerId = request.data()?.ownerId;
    if (typeof ownerId === "string" && ownerId) {
      const userReference = getFirestore("default").collection("users").doc(ownerId);
      const user = await userReference.get();
      if (user.exists) {
        await userReference.update({
          accountDeletionState: "deletion_pending",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  } catch (
    failureStateError: unknown
  ) {
    console.error(
      "Unable to record account deletion failure state:",
      {
        requestId:
          context.requestId,

        failedStep:
          context.currentStep,

        originalError:
          errorMessage,

        failureStateError,
      }
    );
  }
}

async function markWorkflowCompleted(
  context: WorkflowExecutionContext
): Promise<void> {
  context.currentStep =
    "completed";

  await context.requestReference.update({
    status:
      "completed",

    "workflow.currentStep":
      "completed",

    "workflow.completedAt":
      FieldValue.serverTimestamp(),

    "workflow.failedAt":
      null,

    "workflow.failedStep":
      null,

    "workflow.lastError":
      null,

    "workflow.nextRetryAt":
      null,

    "workflow.leaseExpiresAt": null,

    "workflow.leaseToken": null,

    updatedAt:
      FieldValue.serverTimestamp(),
  });
}

/*
|--------------------------------------------------------------------------
| Driver Context
|--------------------------------------------------------------------------
|
| Loads the driver document once before destructive operations begin.
|
| Values needed later are copied into memory because the Firestore deletion
| step removes drivers/{driverId}.
|
*/

async function createDriverDeletionContext(
  requestId: string,
  driverId: string
): Promise<DriverDeletionContext> {
  const db =
    getFirestore("default");

  const driverSnapshot =
    await db
      .collection("drivers")
      .doc(driverId)
      .get();

  if (!driverSnapshot.exists) {
    throw new AccountDeletionEngineError(
      "The driver account was not found.",
      "driver-not-found"
    );
  }

  const driver =
    driverSnapshot.data() as
      DriverDeletionData | undefined;

  if (!driver) {
    throw new AccountDeletionEngineError(
      "The driver account data is empty.",
      "invalid-driver"
    );
  }

  return {
    requestId,
    driverId,

    carrierId:
      optionalPositiveNumber(
        driver.shipday?.carrierId
      ),

    stripeAccountId:
      optionalString(
        driver.stripeAccountId
      ),
  };
}

function completedSteps(value: unknown): Set<AccountDeletionWorkflowStep> {
  return new Set(Array.isArray(value) ? value.filter((step): step is AccountDeletionWorkflowStep =>
    typeof step === "string") : []);
}

function storedContext(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> : null;
}

async function authenticationUserExists(uid: string): Promise<boolean> {
  try {
    await getAuth().getUser(uid);
    return true;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error &&
      error.code === "auth/user-not-found") return false;
    throw error;
  }
}

async function storagePrefixHasFiles(prefix: string): Promise<boolean> {
  const [files] = await getStorage().bucket().getFiles({prefix, maxResults: 1});
  return files.length > 0;
}

async function verifyDeletionCompleted(input: {
  ownerId: string;
  driverContext: DriverDeletionContext | null;
  customerContext: CustomerDeletionContext | null;
  storeContext: StoreDeletionContext | null;
}): Promise<void> {
  const db = getFirestore("default");
  const checks: Array<Promise<boolean>> = [
    authenticationUserExists(input.ownerId),
    db.collection("users").doc(input.ownerId).get().then((value) => value.exists),
  ];

  if (input.customerContext) {
    checks.push(
      storagePrefixHasFiles(`users/${input.ownerId}/`),
      db.collection("carts").doc(input.ownerId).get().then((value) => value.exists),
      db.collection("addresses").doc(input.ownerId).get().then((value) => value.exists),
      db.collection("notificationDevices").where("uid", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
      db.collection("checkoutSessions").where("customerUid", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
    );
  }

  if (input.driverContext) {
    checks.push(
      storagePrefixHasFiles(`drivers/${input.ownerId}/`),
      db.collection("drivers").doc(input.ownerId).get().then((value) => value.exists),
      db.collection("driverWorkspaceStatuses").doc(input.ownerId)
        .get().then((value) => value.exists),
      db.collection("driverImageUploads").where("driverId", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
      db.collection("notificationDevices").where("uid", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
      db.collection("orders").where("delivery.driverId", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
      db.collection("paymentSettlements").where("driverId", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
      db.collection("paymentTransfers").where("recipient.id", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
    );
  }

  if (input.storeContext) {
    checks.push(
      db.collection("storeWorkspaceStatuses").doc(input.ownerId)
        .get().then((value) => value.exists),
      db.collection("notificationDevices").where("uid", "==", input.ownerId)
        .limit(1).get().then((value) => !value.empty),
    );
    for (const store of input.storeContext.stores) {
      checks.push(
        storagePrefixHasFiles(`stores/${store.id}/`),
        db.collection("stores").doc(store.id).get().then((value) => value.exists),
        db.collection("storePublicProfiles").doc(store.id)
          .get().then((value) => value.exists),
        db.collection("products").where("storeId", "==", store.id)
          .limit(1).get().then((value) => !value.empty),
        db.collection("productPublicProfiles").where("storeId", "==", store.id)
          .limit(1).get().then((value) => !value.empty),
      );
    }
  }

  if ((await Promise.all(checks)).some(Boolean)) {
    throw new AccountDeletionEngineError(
      "Account deletion verification found data that was not removed.",
      "deletion-verification-failed"
    );
  }
}

async function claimRequest(requestReference: DocumentReference): Promise<void> {
  const db = getFirestore("default");
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(requestReference);
    const request = snapshot.data();
    if (!snapshot.exists || !request) {
      throw new AccountDeletionEngineError("Deletion request not found.", "not-found");
    }

    const userReference = db.collection("users").doc(request.ownerId);
    const userSnapshot = await transaction.get(userReference);

    const status = request.status;
    const now = Date.now();
    const scheduledDeletionAt = request.scheduledDeletionAt;
    const nextRetryAt = request.workflow?.nextRetryAt;
    const leaseExpiresAt = request.workflow?.leaseExpiresAt;
    const approvedAndDue = (status === "approved" || status === "scheduled") &&
      scheduledDeletionAt instanceof Timestamp &&
      scheduledDeletionAt.toMillis() <= now;
    const failedAndDue = status === "failed" &&
      nextRetryAt instanceof Timestamp && nextRetryAt.toMillis() <= now;
    const expiredLease = status === "processing" &&
      (!(leaseExpiresAt instanceof Timestamp) ||
        leaseExpiresAt.toMillis() <= now);
    if (!approvedAndDue && !failedAndDue && !expiredLease) {
      throw new AccountDeletionEngineError(
        "The deletion request is already being processed or is not retryable.",
        "request-not-claimable"
      );
    }

    transaction.update(requestReference, {
      status: "processing",
      "workflow.currentStep": "validating_account",
      "workflow.startedAt": FieldValue.serverTimestamp(),
      "workflow.attemptCount": FieldValue.increment(1),
      "workflow.retryCount": FieldValue.increment(1),
      "workflow.failedAt": null,
      "workflow.failedStep": null,
      "workflow.lastError": null,
      "workflow.nextRetryAt": null,
      "workflow.leaseToken": randomUUID(),
      "workflow.leaseExpiresAt": Timestamp.fromMillis(now + LEASE_DURATION_MS),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (userSnapshot.exists) {
      transaction.update(userReference, {
        accountDeletionState: "deletion_processing",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

/*
|--------------------------------------------------------------------------
| Engine
|--------------------------------------------------------------------------
*/

export const accountDeletionEngine = {
  async process(
    input: ProcessAccountDeletionInput
  ): Promise<void> {
    const requestId =
      requireString(
        input.requestId,
        "Deletion request ID"
      );

    const db =
      getFirestore("default");

    const requestReference =
      db
        .collection(
          "accountDeletionRequests"
        )
        .doc(requestId);

    const workflowContext:
      WorkflowExecutionContext = {
        requestId,

        requestReference,

        currentStep:
          "validating_account",

        completedSteps: new Set(),
      };

    let claimed = false;

    try {
      const requestSnapshot =
        await requestReference.get();

      if (!requestSnapshot.exists) {
        throw new AccountDeletionEngineError(
          "Deletion request not found.",
          "not-found"
        );
      }

      const request =
        requestSnapshot.data() as
          DeletionRequestData | undefined;

      if (!request) {
        throw new AccountDeletionEngineError(
          "Deletion request is empty.",
          "invalid-request"
        );
      }

      const ownerType =
        requireString(
          request.ownerType,
          "Deletion request owner type"
        );

      const ownerId =
        requireString(
          request.ownerId,
          "Deletion request owner ID"
        );

      workflowContext.completedSteps = completedSteps(
        request.workflow?.completedSteps
      );

      await claimRequest(requestReference);
      claimed = true;

      /*
      |--------------------------------------------------------------------------
      | Validate Before Processing
      |--------------------------------------------------------------------------
      |
      | Validation happens before status changes to processing.
      |
      | This allows the validation service to evaluate approved, scheduled,
      | or future retryable request states without seeing an in-progress state.
      |
      */

      await accountDeletionValidationService.validate({
        requestId,
      });

      /*
      |--------------------------------------------------------------------------
      | Create Deletion Context
      |--------------------------------------------------------------------------
      */

      const savedContext = storedContext(
        request.workflow?.deletionContext
      );
      let driverContext:
        DriverDeletionContext | null = null;
      let customerContext:
        CustomerDeletionContext | null = null;
      let storeContext:
        StoreDeletionContext | null = null;

      if (ownerType === "driver") {
        driverContext = savedContext?.ownerType === "driver" ? {
          requestId,
          driverId: ownerId,
          carrierId: optionalPositiveNumber(savedContext.carrierId),
          stripeAccountId: optionalString(savedContext.stripeAccountId),
        } : await createDriverDeletionContext(requestId, ownerId);
      } else if (ownerType === "customer") {
        customerContext = savedContext?.ownerType === "customer" ? {
          customerId: ownerId,
          anonymousId: requireString(savedContext.anonymousId, "Anonymous customer ID"),
          stripeCustomerId: optionalString(savedContext.stripeCustomerId),
        } : await customerAccountDeletionService.loadContext(ownerId);
      } else if (ownerType === "store") {
        storeContext = savedContext?.ownerType === "store" &&
          Array.isArray(savedContext.stores) ? {
            ownerId,
            anonymousOwnerId: requireString(
              savedContext.anonymousOwnerId,
              "Anonymous store-owner ID"
            ),
            stores: savedContext.stores.map((value) => {
              const store = storedContext(value);
              if (!store) {
                throw new AccountDeletionEngineError(
                  "Stored deletion context contains an invalid store.",
                  "invalid-deletion-context"
                );
              }
              return {
                id: requireString(store.id, "Stored store ID"),
                stripeAccountId: optionalString(store.stripeAccountId),
              };
            }),
          } : await storeAccountDeletionService.loadContext(ownerId);
      } else {
        throw new AccountDeletionEngineError(
          `Account deletion is not implemented for owner type: ${ownerType}.`,
          "unsupported-owner-type"
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Persist Resumable Context
      |--------------------------------------------------------------------------
      */

      if (!savedContext) {
        await requestReference.update({
          "workflow.deletionContext": driverContext ? {
            ownerType: "driver",
            carrierId: driverContext.carrierId,
            stripeAccountId: driverContext.stripeAccountId,
          } : customerContext ? {
            ownerType: "customer",
            anonymousId: customerContext.anonymousId,
            stripeCustomerId: customerContext.stripeCustomerId,
          } : {
            ownerType: "store",
            anonymousOwnerId: storeContext!.anonymousOwnerId,
            stores: storeContext!.stores,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Active Order Validation
      |--------------------------------------------------------------------------
      */

      await executeWorkflowStep(
        workflowContext,
        "checking_active_orders",
        async () => {
          if (driverContext) {
            await accountDeletionValidationService
              .validateDriverOperations(driverContext.driverId);
          }
          if (customerContext) {
            await customerAccountDeletionService
              .validateEligibility(customerContext);
          }
          if (storeContext) {
            await storeAccountDeletionService
              .validateOperations(storeContext);
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Outstanding Payout Validation
      |--------------------------------------------------------------------------
      */

      await executeWorkflowStep(
        workflowContext,
        "checking_outstanding_payouts",
        async () => {
          if (workflowContext.completedSteps.has("closing_stripe_account")) {
            return;
          }
          if (driverContext) {
            await accountDeletionValidationService.validateDriverFinancials({
              driverId: driverContext.driverId,
              stripeAccountId: driverContext.stripeAccountId,
              stripe: input.stripe,
            });
          }
          if (storeContext) {
            await storeAccountDeletionService.validateFinancials(
              storeContext,
              input.stripe
            );
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Shipday Carrier Deletion
      |--------------------------------------------------------------------------
      */

      await executeWorkflowStep(
        workflowContext,
        "deleting_shipday_carrier",
        async () => {
          if (driverContext?.carrierId) {
            await shipdayCarrierService.deleteCarrier(
              driverContext.carrierId
            );
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Firebase Storage Deletion
      |--------------------------------------------------------------------------
      */

      await executeWorkflowStep(
        workflowContext,
        "deleting_storage",
        async () => {
          if (driverContext) {
            await driverStorageDeletionService.deleteDriverImages(
              driverContext.driverId
            );
          }
          if (customerContext) {
            await customerAccountDeletionService.deleteStorage(customerContext);
          }
          if (storeContext) {
            await storeAccountDeletionService.deleteStorage(storeContext);
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Stripe Account Closure
      |--------------------------------------------------------------------------
      */

      await executeWorkflowStep(
        workflowContext,
        "closing_stripe_account",
        async () => {
          if (driverContext?.stripeAccountId) {
            await stripeAccountLifecycleService.closeAccount(
              input.stripe,
              driverContext.stripeAccountId
            );
          }
          if (customerContext) {
            await customerAccountDeletionService.deleteStripeCustomer(
              input.stripe,
              customerContext
            );
          }
          if (storeContext) {
            for (const store of storeContext.stores) {
              if (store.stripeAccountId) {
                await stripeAccountLifecycleService.closeAccount(
                  input.stripe,
                  store.stripeAccountId
                );
              }
            }
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Firestore Deletion
      |--------------------------------------------------------------------------
      */

      await executeWorkflowStep(
        workflowContext,
        "deleting_firestore",
        async () => {
          if (driverContext) {
            await driverFirestoreDeletionService.deleteDriverDocuments({
              requestId: driverContext.requestId,
              driverId: driverContext.driverId,
            });
          }
          if (customerContext) {
            await customerAccountDeletionService.deleteFirestore(customerContext);
          }
          if (storeContext) {
            await storeAccountDeletionService.deleteFirestore(storeContext);
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Firebase Authentication Deletion
      |--------------------------------------------------------------------------
      |
      | This runs after Firestore deletion.
      |
      | The Auth deletion service validates against the surviving
      | accountDeletionRequests document rather than the deleted driver document.
      |
      */

      await executeWorkflowStep(
        workflowContext,
        "deleting_authentication",
        async () => {
          if (driverContext) {
            await driverAuthDeletionService.deleteDriverAuthentication({
              requestId: driverContext.requestId,
              driverId: driverContext.driverId,
            });
          }
          if (customerContext) {
            await customerAccountDeletionService.deleteAuthentication(customerContext);
          }
          if (storeContext) {
            await storeAccountDeletionService.deleteAuthentication(storeContext);
          }
        }
      );

      await executeWorkflowStep(
        workflowContext,
        "verifying_deletion",
        async () => verifyDeletionCompleted({
          ownerId,
          driverContext,
          customerContext,
          storeContext,
        })
      );

      /*
      |--------------------------------------------------------------------------
      | Complete Workflow
      |--------------------------------------------------------------------------
      */

      await markWorkflowCompleted(
        workflowContext
      );
    } catch (
      error: unknown
    ) {
      if (claimed) {
        await markWorkflowFailed(
          workflowContext,
          error
        );
      }

      throw error;
    }
  },
};
