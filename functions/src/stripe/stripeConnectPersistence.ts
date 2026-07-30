/*
  Stripe Connect Firestore persistence for Firebase Functions.

  This service synchronizes the latest Stripe Accounts v2 status onto
  stores/{storeId} after a verified webhook event.

  Architecture:

  Stripe thin event
        ↓
  Retrieve latest Accounts v2 account
        ↓
  Functions-side Stripe mapper
        ↓
  This persistence service
        ↓
  stores/{storeId}

  Stripe remains the source of truth for connected-account status.
  Firestore stores the latest safe operational summary used by LIA.
*/

import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type Transaction,
} from "firebase-admin/firestore";
import {
  getApps,
  initializeApp,
} from "firebase-admin/app";

import type {
  StripeConnectAccount,
} from "./stripeConnectTypes";


/*
  This project explicitly uses the Firestore database whose ID is
  "default", matching functions/src/index.ts.
*/
/*
  Firebase CLI imports every exported module to discover Functions before
  index.ts executes its body. Initialize defensively here because this module
  creates the Firestore client during import evaluation.
*/
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore("default");


/*
  Predictable persistence failures.

  The webhook can log these values without exposing sensitive Stripe
  or Firestore internals.
*/
export type StripeWebhookPersistenceErrorCode =
  | "INVALID_STORE_ID"
  | "STORE_NOT_FOUND"
  | "INVALID_DRIVER_ID"
  | "DRIVER_NOT_FOUND"
  | "STRIPE_ACCOUNT_MISMATCH"
  | "STRIPE_API_VERSION_MISMATCH";


/*
  Custom error used for expected synchronization problems.
*/
export class StripeWebhookPersistenceError extends Error {
  readonly code: StripeWebhookPersistenceErrorCode;

  constructor(
    code: StripeWebhookPersistenceErrorCode,
    message: string
  ) {
    super(message);

    this.name = "StripeWebhookPersistenceError";
    this.code = code;
  }
}


/*
  Safely read a normalized optional string from Firestore.
*/
function getOptionalString(
  data: DocumentData,
  fieldName: string
): string | undefined {
  const value = data[fieldName];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0
    ? normalized
    : undefined;
}

/* The mapper uses ISO strings internally; Firestore persists native timestamps. */
function timestampFromIso(value: string, fieldName: string): Timestamp {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new StripeWebhookPersistenceError(
      "STRIPE_API_VERSION_MISMATCH",
      `Stripe returned an invalid ${fieldName} timestamp.`
    );
  }

  return Timestamp.fromDate(date);
}


/*
  Validate the store before applying webhook status updates.

  The webhook is trusted only after signature verification, but we
  still protect the Firestore record from mismatched metadata or an
  unexpected account relationship.
*/
async function validateStore(
  transaction: Transaction,
  storeReference: FirebaseFirestore.DocumentReference,
  stripeAccount: StripeConnectAccount
): Promise<void> {
  const snapshot =
    await transaction.get(storeReference);

  if (!snapshot.exists) {
    throw new StripeWebhookPersistenceError(
      "STORE_NOT_FOUND",
      "The Stripe account references a store that does not exist."
    );
  }

  const storeData = snapshot.data();

  if (!storeData) {
    throw new StripeWebhookPersistenceError(
      "STORE_NOT_FOUND",
      "The Stripe-connected store record could not be read."
    );
  }

  /*
    A webhook must never replace or update a store using a different
    connected account ID.
  */
  const existingStripeAccountId =
    getOptionalString(
      storeData,
      "stripeAccountId"
    );

  if (
    !existingStripeAccountId ||
    existingStripeAccountId !== stripeAccount.accountId
  ) {
    throw new StripeWebhookPersistenceError(
      "STRIPE_ACCOUNT_MISMATCH",
      "The store does not reference the Stripe account from this event."
    );
  }

  /*
    The current webhook handles Accounts v2 records only.

    Reject legacy or unknown account records instead of silently
    applying the v2 mapper to them.
  */
  const apiVersion =
    getOptionalString(
      storeData,
      "stripeConnectApiVersion"
    );

  if (apiVersion !== "v2") {
    throw new StripeWebhookPersistenceError(
      "STRIPE_API_VERSION_MISMATCH",
      "The store is not configured as a Stripe Accounts v2 record."
    );
  }
}


/*
  Save the latest mapped Stripe account state.

  stripeAccountId and stripeConnectedAt are intentionally preserved.

  The original connection date represents when the account was first
  created and must not change each time Stripe sends a webhook.
*/
async function saveStoreStripeStatus(
  stripeAccount: StripeConnectAccount
): Promise<void> {
  const storeId =
    stripeAccount.ownerId.trim();

  if (stripeAccount.ownerType !== "store") {
    throw new StripeWebhookPersistenceError(
      "INVALID_STORE_ID",
      "The Stripe account is not owned by a store."
    );
  }

  if (!storeId) {
    throw new StripeWebhookPersistenceError(
      "INVALID_STORE_ID",
      "Stripe account metadata does not contain a valid LIA store ID."
    );
  }

  const storeReference =
    db.collection("stores").doc(storeId);

  await db.runTransaction(
    async (transaction) => {
      await validateStore(
        transaction,
        storeReference,
        stripeAccount
      );

      transaction.update(storeReference, {
        /*
          This remains an Accounts v2 connected account.
        */
        stripeConnectApiVersion: "v2",

        /*
          Latest LIA interpretation of the connected account.
        */
        stripeAccountStatus:
          stripeAccount.onboardingStatus,

        stripeChargesEnabled:
          stripeAccount.chargesEnabled,

        stripeTransfersEnabled:
          stripeAccount.transfersEnabled,

        stripePayoutsEnabled:
          stripeAccount.payoutsEnabled,

        stripeDetailsSubmitted:
          stripeAccount.detailsSubmitted,

        stripeRequiresAction:
          stripeAccount.onboardingStatus ===
            "action_required" ||
          stripeAccount.onboardingStatus ===
            "restricted",

        stripeIsReady:
          stripeAccount.onboardingStatus ===
            "complete",

        /*
          This changes every time the account is synchronized.
        */
        stripeUpdatedAt:
          timestampFromIso(stripeAccount.updatedAt, "update"),
      });
    }
  );
}

/*
  Save the latest Stripe state for a driver recipient account. Driver
  documents use the same Accounts v2 readiness fields, plus the compact
  stripeConnect object used by the driver onboarding flow.
*/
async function saveDriverStripeStatus(
  stripeAccount: StripeConnectAccount
): Promise<void> {
  if (stripeAccount.ownerType !== "driver") {
    throw new StripeWebhookPersistenceError(
      "INVALID_DRIVER_ID",
      "The Stripe account is not owned by a driver."
    );
  }

  const driverId = stripeAccount.ownerId.trim();

  if (!driverId) {
    throw new StripeWebhookPersistenceError(
      "INVALID_DRIVER_ID",
      "Stripe account metadata does not contain a valid LIA driver ID."
    );
  }

  const driverReference = db.collection("drivers").doc(driverId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(driverReference);
    const driver = snapshot.data();

    if (!snapshot.exists || !driver) {
      throw new StripeWebhookPersistenceError(
        "DRIVER_NOT_FOUND",
        "The Stripe account references a driver that does not exist."
      );
    }

    const existingAccountId = getOptionalString(driver, "stripeAccountId");

    if (!existingAccountId || existingAccountId !== stripeAccount.accountId) {
      throw new StripeWebhookPersistenceError(
        "STRIPE_ACCOUNT_MISMATCH",
        "The driver does not reference the Stripe account from this event."
      );
    }

    if (getOptionalString(driver, "stripeConnectApiVersion") !== "v2") {
      throw new StripeWebhookPersistenceError(
        "STRIPE_API_VERSION_MISMATCH",
        "The driver is not configured as a Stripe Accounts v2 record."
      );
    }

    transaction.update(driverReference, {
      stripeConnectApiVersion: "v2",
      stripeConnect: {
        status: stripeAccount.onboardingStatus,
        transfersEnabled: stripeAccount.transfersEnabled,
        payoutsEnabled: stripeAccount.payoutsEnabled,
      },
      stripeAccountStatus: stripeAccount.onboardingStatus,
      stripeChargesEnabled: stripeAccount.chargesEnabled,
      stripeTransfersEnabled: stripeAccount.transfersEnabled,
      stripePayoutsEnabled: stripeAccount.payoutsEnabled,
      stripeDetailsSubmitted: stripeAccount.detailsSubmitted,
      stripeRequiresAction: stripeAccount.onboardingStatus === "action_required" || stripeAccount.onboardingStatus === "restricted",
      stripeIsReady: stripeAccount.onboardingStatus === "complete",
      stripeUpdatedAt: timestampFromIso(stripeAccount.updatedAt, "update"),
    });
  });
}


/*
  Type guard for webhook error handling.
*/
export function isStripeWebhookPersistenceError(
  error: unknown
): error is StripeWebhookPersistenceError {
  return (
    error instanceof
    StripeWebhookPersistenceError
  );
}


/*
  Stable persistence service used by the future webhook handler.
*/
export const stripeConnectPersistence = {
  saveStoreStripeStatus,
  saveDriverStripeStatus,
};
