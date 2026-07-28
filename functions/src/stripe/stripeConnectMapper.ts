/*
  Stripe Accounts v2 mapper for Firebase Functions.

  This mapper must remain behaviorally aligned with:

  src/mappers/stripeConnectMapper.ts

  Why duplicate the mapping?

  The Next.js application and Firebase Functions are separate
  TypeScript projects with separate build boundaries.

  The Stripe webhook must independently convert the latest Accounts v2
  Account object into LIA's stable Firestore payment state.

  Accounts v2 recipient configuration is used because stores receive
  transfers from the LIA platform rather than charging customers
  directly.
*/

import type Stripe from "stripe";

import {
  StripeAccountRequirements,
  StripeConnectAccount,
  StripeOnboardingStatus,
  StripeRequirementError,
} from "./stripeConnectTypes";


/*
  Short aliases for the Stripe Accounts v2 types used by this mapper.
*/
type StripeV2Account = Stripe.V2.Core.Account;

type RequirementEntry = NonNullable<
  NonNullable<StripeV2Account["requirements"]>["entries"]
>[number];


/*
  Create a safe label for one Stripe requirement.

  Stripe requirement entries can reference a resource or include one
  or more requested-reason codes.

  We prefer the reason codes because they generally give more useful
  diagnostic information.
*/
function requirementLabel(
  entry: RequirementEntry
): string {
  const reasons = entry.requested_reasons
    .map((reason) => reason.code)
    .filter(Boolean);

  if (reasons.length > 0) {
    return reasons.join(", ");
  }

  return (
    entry.reference?.resource ??
    "Stripe verification requirement"
  );
}


/*
  Convert an ISO timestamp into a Unix timestamp.

  Invalid or missing timestamps become null.
*/
function toUnixTimestamp(
  value: string | undefined
): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp)
    ? null
    : Math.floor(timestamp / 1000);
}


/*
  Retrieve the Accounts v2 recipient transfer capability status.

  Possible values currently include:

  - active
  - pending
  - restricted
  - unsupported

  null means the recipient transfer capability was not included or has
  not been configured.
*/
function getTransferStatus(
  account: StripeV2Account
):
  | "active"
  | "pending"
  | "restricted"
  | "unsupported"
  | null {
  return (
    account.configuration
      ?.recipient
      ?.capabilities
      ?.stripe_balance
      ?.stripe_transfers
      ?.status ?? null
  );
}


/*
  Convert Stripe requirement-entry errors into LIA's safe internal
  error model.
*/
function mapRequirementErrors(
  entries: RequirementEntry[]
): StripeRequirementError[] {
  return entries.flatMap((entry) =>
    (entry.errors ?? []).map((error) => ({
      requirement: requirementLabel(entry),
      code: error.code,
      reason: error.description,
    }))
  );
}


/*
  Convert Accounts v2 requirement entries into LIA's stable internal
  requirement model.
*/
export function mapStripeAccountRequirements(
  account: StripeV2Account
): StripeAccountRequirements {
  const entries =
    account.requirements?.entries ?? [];

  /*
    Return the labels for requirements whose minimum deadline has the
    requested status.
  */
  const entriesWithStatus = (
    status:
      | "currently_due"
      | "eventually_due"
      | "past_due"
  ): string[] =>
    entries
      .filter(
        (entry) =>
          entry.minimum_deadline?.status === status
      )
      .map(requirementLabel);

  const transferStatus =
    getTransferStatus(account);

  return {
    currentlyDue:
      entriesWithStatus("currently_due"),

    eventuallyDue:
      entriesWithStatus("eventually_due"),

    pastDue:
      entriesWithStatus("past_due"),

    /*
      awaiting_action_from === "stripe" means the connected account has
      already provided information and Stripe is reviewing it.
    */
    pendingVerification: entries
      .filter(
        (entry) =>
          entry.awaiting_action_from === "stripe"
      )
      .map(requirementLabel),

    errors: mapRequirementErrors(entries),

    currentDeadline: toUnixTimestamp(
      account.requirements
        ?.summary
        ?.minimum_deadline
        ?.time
    ),

    /*
      Preserve a diagnostic reason when the recipient capability cannot
      currently receive transfers.
    */
    disabledReason:
      transferStatus === "restricted" ||
      transferStatus === "unsupported"
        ? `recipient.stripe_transfers.${transferStatus}`
        : null,
  };
}


/*
  Interpret the Accounts v2 account as one LIA onboarding status.

  Priority is important:

  1. Restricted capability
  2. Fully complete
  3. Account owner action required
  4. Stripe verification pending
  5. Initial onboarding in progress
*/
export function getStripeOnboardingStatus(
  account: StripeV2Account
): StripeOnboardingStatus {
  const requirements =
    mapStripeAccountRequirements(account);

  const transferStatus =
    getTransferStatus(account);

  /*
    The store cannot receive transfers in these states.
  */
  if (
    transferStatus === "restricted" ||
    transferStatus === "unsupported"
  ) {
    return "restricted";
  }

  /*
    LIA considers the store ready when:

    - Recipient transfers are active
    - No currently due requirements remain
    - No past-due requirements remain
    - No verification errors remain
  */
  if (
    transferStatus === "active" &&
    requirements.currentlyDue.length === 0 &&
    requirements.pastDue.length === 0 &&
    requirements.errors.length === 0
  ) {
    return "complete";
  }

  /*
    These conditions require the connected account owner to return to
    Stripe and supply or correct information.
  */
  if (
    requirements.pastDue.length > 0 ||
    requirements.errors.length > 0 ||
    requirements.currentlyDue.length > 0
  ) {
    return "action_required";
  }

  /*
    Stripe is reviewing submitted information, or the capability is
    waiting to become active.
  */
  if (
    requirements.pendingVerification.length > 0 ||
    transferStatus === "pending"
  ) {
    return "pending_verification";
  }

  return "in_progress";
}


/*
  Convert the latest Stripe Accounts v2 Account resource into the
  Functions-side Stripe Connect model.

  The webhook supplies the Firestore store ID after validating Stripe
  metadata and the current store record.
*/
export function mapStripeAccount(
  account: StripeV2Account,
  storeId: string
): StripeConnectAccount {
  const onboardingStatus =
    getStripeOnboardingStatus(account);

  const transfersEnabled =
    getTransferStatus(account) === "active";

  return {
    storeId,
    accountId: account.id,
    onboardingStatus,

    /*
      Stores receive platform transfers and do not directly create
      customer charges in the current LIA architecture.
    */
    chargesEnabled: false,

    transfersEnabled,

    /*
      This intentionally matches the current Next.js Accounts v2
      mapper so both environments display identical readiness.
    */
    payoutsEnabled: transfersEnabled,

    detailsSubmitted:
      onboardingStatus !== "in_progress",

    requirements:
      mapStripeAccountRequirements(account),

    updatedAt: new Date().toISOString(),
  };
}