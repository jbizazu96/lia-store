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
| Current driver workflow:
|
| 1. Validate the approved or retryable deletion request
| 2. Load the driver deletion context once
| 3. Mark the request as processing
| 4. Execute each workflow step
| 5. Record the exact failed step if an operation throws
| 6. Mark the request as completed when every step succeeds
|
*/

import Stripe from "stripe";

import {
  DocumentReference,
  FieldValue,
  getFirestore,
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
}

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
  await updateWorkflowStep(
    context,
    currentStep
  );

  await action();
}

async function markWorkflowFailed(
  context: WorkflowExecutionContext,
  error: unknown
): Promise<void> {
  const errorMessage =
    getSafeErrorMessage(error);

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

      updatedAt:
        FieldValue.serverTimestamp(),
    });
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
      };

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

      let driverContext:
        DriverDeletionContext;

      if (ownerType === "driver") {
        driverContext =
          await createDriverDeletionContext(
            requestId,
            ownerId
          );
      } else {
        throw new AccountDeletionEngineError(
          `Account deletion is not implemented for owner type: ${ownerType}.`,
          "unsupported-owner-type"
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Mark Request as Processing
      |--------------------------------------------------------------------------
      */

      await requestReference.update({
        status:
          "processing",

        "workflow.currentStep":
          "validating_account",

        "workflow.startedAt":
          FieldValue.serverTimestamp(),

        "workflow.attemptCount":
          FieldValue.increment(1),

        "workflow.failedAt":
          null,

        "workflow.failedStep":
          null,

        "workflow.lastError":
          null,

        "workflow.nextRetryAt":
          null,

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      /*
      |--------------------------------------------------------------------------
      | Active Order Validation
      |--------------------------------------------------------------------------
      |
      | The business-rule implementation will be connected later.
      |
      */

      await executeWorkflowStep(
        workflowContext,
        "checking_active_orders",
        async () => {
          /*
           * Placeholder for active-order validation.
           */
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Outstanding Payout Validation
      |--------------------------------------------------------------------------
      |
      | The business-rule implementation will be connected later.
      |
      */

      await executeWorkflowStep(
        workflowContext,
        "checking_outstanding_payouts",
        async () => {
          /*
           * Placeholder for outstanding-payout validation.
           */
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
          if (
            driverContext.carrierId
          ) {
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
          await driverStorageDeletionService.deleteDriverImages(
            driverContext.driverId
          );
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
          if (
            driverContext.stripeAccountId
          ) {
            await stripeAccountLifecycleService.closeAccount(
              input.stripe,
              driverContext.stripeAccountId
            );
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
          await driverFirestoreDeletionService.deleteDriverDocuments({
            requestId:
              driverContext.requestId,

            driverId:
              driverContext.driverId,
          });
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
          await driverAuthDeletionService.deleteDriverAuthentication({
            requestId:
              driverContext.requestId,

            driverId:
              driverContext.driverId,
          });
        }
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
      await markWorkflowFailed(
        workflowContext,
        error
      );

      throw error;
    }
  },
};
