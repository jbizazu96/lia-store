/*
  Stripe Connect domain types for Firebase Functions.

  The Next.js application has similar types under:

  src/types/stripeConnect.ts

  Firebase Functions is a separate TypeScript project and should not
  import application files through paths outside functions/src.

  These backend types define only the values needed by the Stripe
  Accounts v2 webhook and Firestore synchronization.
*/


/*
  LIA's simplified interpretation of a Stripe connected account.

  Stripe Accounts v2 does not expose one simple account-status field.
  The Functions-side mapper will determine this value from:

  - Recipient transfer capability
  - Current requirements
  - Past-due requirements
  - Verification errors
  - Pending Stripe review
*/
export type StripeOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "pending_verification"
  | "action_required"
  | "complete"
  | "restricted";


/*
  Safe verification error stored in LIA's internal model.

  We do not store sensitive identity documents, tax values, or bank
  information in Firestore.
*/
export interface StripeRequirementError {
  /*
    Human-readable identification of the affected Stripe requirement.
  */
  requirement: string;

  /*
    Stripe's machine-readable error code.
  */
  code: string;

  /*
    Stripe's safe description of the verification problem.
  */
  reason: string;
}


/*
  Simplified Stripe requirement state.

  This mirrors the structure used by the Next.js Stripe account mapper,
  allowing both systems to interpret Accounts v2 consistently.
*/
export interface StripeAccountRequirements {
  /*
    Information currently required from the connected account.
  */
  currentlyDue: string[];

  /*
    Information Stripe expects to require in the future.
  */
  eventuallyDue: string[];

  /*
    Information that missed its Stripe deadline.
  */
  pastDue: string[];

  /*
    Information already submitted and awaiting Stripe review.
  */
  pendingVerification: string[];

  /*
    Verification problems returned by Stripe.
  */
  errors: StripeRequirementError[];

  /*
    Unix timestamp representing the earliest current deadline.

    null means Stripe has not supplied a valid deadline.
  */
  currentDeadline: number | null;

  /*
    LIA's diagnostic explanation when the recipient transfer capability
    is restricted or unsupported.
  */
  disabledReason: string | null;
}


/*
  Complete synchronized Stripe state used by the Functions backend.

  This is an internal application model—not the raw Stripe Account
  object.
*/
export interface StripeConnectAccount {
  /*
    Firestore store document ID.
  */
  storeId: string;

  /*
    Stripe Accounts v2 connected-account ID.

    Example:
    acct_123456789
  */
  accountId: string;

  /*
    LIA's interpreted onboarding and operational state.
  */
  onboardingStatus: StripeOnboardingStatus;

  /*
    Stores do not directly charge customers in LIA's separate-charges-
    and-transfers architecture.
  */
  chargesEnabled: boolean;

  /*
    True when the Accounts v2 recipient stripe_transfers capability is
    active.
  */
  transfersEnabled: boolean;

  /*
    For the current recipient MVP, payout readiness follows the active
    transfer-recipient configuration used by the Next.js mapper.
  */
  payoutsEnabled: boolean;

  /*
    Indicates that initial onboarding has progressed beyond the initial
    in-progress state.
  */
  detailsSubmitted: boolean;

  /*
    Current mapped Stripe requirement details.
  */
  requirements: StripeAccountRequirements;

  /*
    ISO timestamp for the latest webhook synchronization.
  */
  updatedAt: string;
}