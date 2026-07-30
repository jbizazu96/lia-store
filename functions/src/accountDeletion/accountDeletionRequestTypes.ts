/*
|--------------------------------------------------------------------------
| Account Deletion Request Types
|--------------------------------------------------------------------------
|
| Shared domain types for account deletion requests across LIA Store.
|
| These requests can eventually support:
|
| - Drivers
| - Stores
| - Customers
| - Employees
| - Administrators
|
| A user submitting a request does not delete the account.
|
| Permanent deletion can begin only after:
|
| 1. An administrator reviews the request
| 2. An administrator approves the request
| 3. The grace period expires
|
*/

/*
|--------------------------------------------------------------------------
| Account Owner Types
|--------------------------------------------------------------------------
*/

export type AccountDeletionOwnerType =
  | "driver"
  | "store"
  | "customer";

/*
|--------------------------------------------------------------------------
| Request Status
|--------------------------------------------------------------------------
|
| pending_review
|   The account owner submitted the request.
|
| more_information_required
|   An administrator needs additional information before deciding.
|
| approved
|   An administrator approved the request.
|
| rejected
|   An administrator rejected the request.
|
| scheduled
|   The request was approved and has a scheduled deletion date.
|
| processing
|   The destructive deletion workflow is currently running.
|
| failed
|   One of the deletion workflow steps failed.
|
| completed
|   The account deletion workflow finished successfully.
|
| cancelled
|   The request was cancelled before permanent deletion started.
|
*/

export type AccountDeletionRequestStatus =
  | "pending_review"
  | "more_information_required"
  | "approved"
  | "rejected"
  | "scheduled"
  | "processing"
  | "failed"
  | "completed"
  | "cancelled";

/*
|--------------------------------------------------------------------------
| Workflow Steps
|--------------------------------------------------------------------------
*/

export type AccountDeletionWorkflowStep =
  | "not_started"
  | "validating_account"
  | "checking_active_orders"
  | "checking_outstanding_payouts"
  | "deleting_shipday_carrier"
  | "deleting_storage"
  | "closing_stripe_account"
  | "deleting_firestore"
  | "deleting_authentication"
  | "completed";

/*
|--------------------------------------------------------------------------
| Request Reason
|--------------------------------------------------------------------------
*/

export type AccountDeletionReasonCode =
  | "no_longer_needed"
  | "privacy_concerns"
  | "created_by_mistake"
  | "switching_platforms"
  | "service_dissatisfaction"
  | "other";

/*
|--------------------------------------------------------------------------
| Administrative Decision
|--------------------------------------------------------------------------
*/

export interface AccountDeletionAdminDecision {
  adminId: string | null;

  decision:
    | "approved"
    | "rejected"
    | "more_information_required"
    | null;

  notes: string | null;

  decidedAt: Date | null;
}

/*
|--------------------------------------------------------------------------
| Workflow State
|--------------------------------------------------------------------------
*/

export interface AccountDeletionWorkflow {
  currentStep:
    AccountDeletionWorkflowStep;

  completedSteps:
    AccountDeletionWorkflowStep[];

  failedStep:
    AccountDeletionWorkflowStep | null;

  attemptCount: number;

  lastError: string | null;

  startedAt: Date | null;

  completedAt: Date | null;
}

/*
|--------------------------------------------------------------------------
| Account Deletion Request
|--------------------------------------------------------------------------
*/

export interface AccountDeletionRequest {
  id: string;

  ownerType:
    AccountDeletionOwnerType;

  ownerId: string;

  requestedBy: string;

  reasonCode:
    AccountDeletionReasonCode;

  reasonDetails: string | null;

  status:
    AccountDeletionRequestStatus;

  adminDecision:
    AccountDeletionAdminDecision;

  /*
   * The date after which the destructive deletion engine may run.
   *
   * This remains null until an administrator approves the request.
   */
  scheduledDeletionAt: Date | null;

  workflow:
    AccountDeletionWorkflow;

  requestedAt: Date;

  updatedAt: Date;
}

/*
|--------------------------------------------------------------------------
| Create Request Input
|--------------------------------------------------------------------------
*/

export interface CreateAccountDeletionRequestInput {
  ownerType:
    AccountDeletionOwnerType;

  ownerId: string;

  requestedBy: string;

  reasonCode:
    AccountDeletionReasonCode;

  reasonDetails?: string | null;
}

/*
|--------------------------------------------------------------------------
| Create Request Result
|--------------------------------------------------------------------------
*/

export interface CreateAccountDeletionRequestResult {
  requestId: string;

  ownerType:
    AccountDeletionOwnerType;

  ownerId: string;

  status:
    "pending_review";

  alreadyPending: boolean;
}