/*
  Maps Stripe Accounts v2 data to LIA's stable payment view model.

  Stripe's recipient configuration is the source of truth for whether a
  store can receive LIA transfers. Requirement entries replace the older v1
  currently_due/past_due arrays.
*/

import type Stripe from "stripe";

import type {
  StripeAccountRequirements,
  StripeConnectedAccountOwnerType,
  StripeConnectAccount,
  StripeConnectAccountSummary,
  StripeOnboardingStatus,
  StripeRequirementError,
} from "@/types/stripeConnect";

type StripeV2Account = Stripe.V2.Core.Account;
type RequirementEntry = NonNullable<
  NonNullable<StripeV2Account["requirements"]>["entries"]
>[number];

function requirementLabel(entry: RequirementEntry): string {
  const reasons = entry.requested_reasons
    .map((reason) => reason.code)
    .filter(Boolean);

  if (reasons.length > 0) {
    return reasons.join(", ");
  }

  return entry.reference?.resource ?? "Stripe verification requirement";
}

function toUnixTimestamp(value: string | undefined): number | null {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
}

function getTransferStatus(
  account: StripeV2Account
): "active" | "pending" | "restricted" | "unsupported" | null {
  return account.configuration?.recipient?.capabilities?.stripe_balance
    ?.stripe_transfers?.status ?? null;
}

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

export function mapStripeAccountRequirements(
  account: StripeV2Account
): StripeAccountRequirements {
  const entries = account.requirements?.entries ?? [];

  const entriesWithStatus = (
    status: "currently_due" | "eventually_due" | "past_due"
  ) => entries
    .filter((entry) => entry.minimum_deadline?.status === status)
    .map(requirementLabel);

  return {
    currentlyDue: entriesWithStatus("currently_due"),
    eventuallyDue: entriesWithStatus("eventually_due"),
    pastDue: entriesWithStatus("past_due"),
    pendingVerification: entries
      .filter((entry) => entry.awaiting_action_from === "stripe")
      .map(requirementLabel),
    errors: mapRequirementErrors(entries),
    currentDeadline: toUnixTimestamp(
      account.requirements?.summary?.minimum_deadline?.time
    ),
    disabledReason: (() => {
      const status = getTransferStatus(account);
      return status === "restricted" || status === "unsupported"
        ? `recipient.stripe_transfers.${status}`
        : null;
    })(),
  };
}

export function getStripeOnboardingStatus(
  account: StripeV2Account
): StripeOnboardingStatus {
  const requirements = mapStripeAccountRequirements(account);
  const transferStatus = getTransferStatus(account);

  if (
    transferStatus === "restricted" ||
    transferStatus === "unsupported"
  ) {
    return "restricted";
  }

  if (
    transferStatus === "active" &&
    requirements.currentlyDue.length === 0 &&
    requirements.pastDue.length === 0 &&
    requirements.errors.length === 0
  ) {
    return "complete";
  }

  if (
    requirements.pastDue.length > 0 ||
    requirements.errors.length > 0 ||
    requirements.currentlyDue.length > 0
  ) {
    return "action_required";
  }

  if (
    requirements.pendingVerification.length > 0 ||
    transferStatus === "pending"
  ) {
    return "pending_verification";
  }

  return "in_progress";
}

export function mapStripeAccount(
  account: StripeV2Account,
  ownerType: StripeConnectedAccountOwnerType,
  ownerId: string,
  connectedAt: string
): StripeConnectAccount {
  const onboardingStatus = getStripeOnboardingStatus(account);
  const transfersEnabled = getTransferStatus(account) === "active";

  return {
    ownerType,
    ownerId,
    accountId: account.id,
    onboardingStatus,
    /* Stores receive platform transfers; they do not use direct charges. */
    chargesEnabled: false,
    transfersEnabled,
    /* Stripe hosts bank-account and payout setup during recipient onboarding. */
    payoutsEnabled: transfersEnabled,
    detailsSubmitted: onboardingStatus !== "in_progress",
    requirements: mapStripeAccountRequirements(account),
    connectedAt,
    updatedAt: new Date().toISOString(),
  };
}

export function mapStripeAccountSummary(
  account: StripeV2Account,
  ownerType: StripeConnectedAccountOwnerType,
  ownerId: string
): StripeConnectAccountSummary {
  const mapped = mapStripeAccount(
    account,
    ownerType,
    ownerId,
    new Date().toISOString()
  );

  return {
    ownerType: mapped.ownerType,
    ownerId: mapped.ownerId,
    accountId: mapped.accountId,
    onboardingStatus: mapped.onboardingStatus,
    chargesEnabled: mapped.chargesEnabled,
    transfersEnabled: mapped.transfersEnabled,
    payoutsEnabled: mapped.payoutsEnabled,
    detailsSubmitted: mapped.detailsSubmitted,
    requiresAction:
      mapped.onboardingStatus === "action_required" ||
      mapped.onboardingStatus === "restricted",
    isReady: mapped.onboardingStatus === "complete",
  };
}
