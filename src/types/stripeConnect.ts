/*
  Stripe Connect domain types.

  This file defines the Stripe Connect concepts used inside LIA Store.

  Important architecture rule:

  We do not use Stripe SDK objects directly throughout the application.

  Instead:

  Stripe API response
        ↓
  Stripe service mapper
        ↓
  LIA Stripe Connect domain types
        ↓
  Firestore, API responses, and UI

  This protects the rest of the application from Stripe API changes
  and keeps Stripe-specific logic inside the Stripe service layer.
*/


/*
  Identifies who owns a Stripe connected account.

  LIA currently connects store accounts.

  The "driver" value is included now so we do not have to redesign
  the Stripe foundation when driver payouts are added later.
*/
export type StripeConnectedAccountOwnerType = "store" | "driver";

/*
  Stripe Connect API generation used by an account persisted by LIA.

  Keeping this on the store document prevents an older Accounts v1 ID from
  being sent to Accounts v2 endpoints by mistake.
*/
export type StripeConnectApiVersion = "v2";


/*
  LIA's simplified interpretation of Stripe onboarding.

  These values are application statuses.

  They are not copied directly from Stripe because Stripe account
  readiness depends on several properties and requirements.
*/
export type StripeOnboardingStatus =
  /*
    LIA has not created a Stripe connected account yet.
  */
  | "not_started"

  /*
    A connected account exists, but onboarding is incomplete.
  */
  | "in_progress"

  /*
    The account owner submitted their information, but Stripe may
    still be reviewing or verifying the account.
  */
  | "pending_verification"

  /*
    Stripe requires additional information or corrections.
  */
  | "action_required"

  /*
    The account is fully ready for the capabilities LIA requires.
  */
  | "complete"

  /*
    Stripe has restricted or disabled important account capabilities.
  */
  | "restricted";


/*
  A simplified verification error returned by Stripe.

  We store only what the LIA application needs to explain the issue
  and decide whether the account requires attention.
*/
export interface StripeRequirementError {
  /*
    The Stripe field related to the verification problem.

    Examples:
    - representative.first_name
    - company.tax_id
    - external_account
  */
  requirement: string;

  /*
    Stripe's machine-readable error code.
  */
  code: string;

  /*
    Human-readable explanation returned by Stripe.
  */
  reason: string;
}


/*
  Requirements that may prevent a connected account from accepting
  payments or receiving payouts.
*/
export interface StripeAccountRequirements {
  /*
    Information Stripe currently requires.
  */
  currentlyDue: string[];

  /*
    Information Stripe expects to require in the future.
  */
  eventuallyDue: string[];

  /*
    Information that was not provided before its deadline.
  */
  pastDue: string[];

  /*
    Information currently awaiting verification.
  */
  pendingVerification: string[];

  /*
    Verification errors returned by Stripe.
  */
  errors: StripeRequirementError[];

  /*
    Unix timestamp for the current requirements deadline.

    null means Stripe has not supplied a deadline.
  */
  currentDeadline: number | null;

  /*
    Stripe's reason for disabling an account capability.

    Example:
    requirements.past_due

    null means no disabled reason was supplied.
  */
  disabledReason: string | null;
}


/*
  Stripe Connect information stored by LIA.

  We store account identifiers and operational status only.

  We must not store:
  - Bank account numbers
  - Identity document contents
  - Social Security numbers
  - Sensitive Stripe verification data

  Stripe-hosted onboarding handles sensitive financial and
  identity information.
*/
export interface StripeConnectAccount {
  /*
    Determines whether this account belongs to a store or driver.
  */
  ownerType: StripeConnectedAccountOwnerType;

  /*
    LIA Store document ID or LIA Driver document ID.
  */
  ownerId: string;

  /*
    Stripe connected account ID.

    Example:
    acct_123456789
  */
  accountId: string;

  /*
    LIA's interpreted onboarding status.
  */
  onboardingStatus: StripeOnboardingStatus;

/*
  Indicates whether Stripe allows the connected account to accept
  charges directly.

  LIA currently uses separate charges and transfers, so stores and
  drivers do not need direct-charge capability to receive earnings.

  We still store this value because it is useful for diagnostics and
  possible future payment models.
*/
chargesEnabled: boolean;

/*
  Indicates whether Stripe's transfers capability is active.

  This is essential for LIA's separate-charges-and-transfers model.

  When true, LIA can transfer funds from the platform balance to this
  connected account.
*/
transfersEnabled: boolean;

/*
  Indicates whether Stripe allows the connected account's balance
  to be paid out to its external bank account or debit card.
*/
payoutsEnabled: boolean;

  /*
    Indicates whether the account owner submitted the primary
    onboarding information requested by Stripe.

    This alone does not mean the account is operational.
  */
  detailsSubmitted: boolean;

  /*
    Requirements that may need action from the account owner.
  */
  requirements: StripeAccountRequirements;

  /*
    ISO timestamp for when LIA created the connected account.
  */
  connectedAt: string;

  /*
    ISO timestamp for the last successful Stripe synchronization.
  */
  updatedAt: string;
}


/*
  A safe account summary that our backend can return to the browser.

  We do not expose the entire Stripe Account object to client components.
*/
export interface StripeConnectAccountSummary {
  ownerType: StripeConnectedAccountOwnerType;
  ownerId: string;
  accountId: string;
  onboardingStatus: StripeOnboardingStatus;
  /*
  Whether the account can accept direct charges.

  This is informational for LIA's current payment model.
*/
chargesEnabled: boolean;

/*
  Whether LIA can transfer marketplace earnings to this account.
*/
transfersEnabled: boolean;

/*
  Whether Stripe can pay the account balance out to the account
  owner's external bank account or debit card.
*/
payoutsEnabled: boolean;

detailsSubmitted: boolean;

  /*
    True when the account owner needs to provide or correct information.
  */
  requiresAction: boolean;

  /*
    True only when all capabilities required by LIA are ready.
  */
  isReady: boolean;
}


/*
  Safe result returned after the backend creates a temporary
  Stripe-hosted onboarding link.
*/
export interface StripeOnboardingLinkResult {
  /*
    Connected account associated with the onboarding link.
  */
  accountId: string;

  /*
    Temporary Stripe-hosted onboarding URL.

    This should be opened immediately and should not be saved
    permanently in Firestore.
  */
  url: string;

  /*
    Unix timestamp indicating when the Account Link expires.
  */
  expiresAt: number;
}
