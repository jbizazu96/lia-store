/*
  Stripe Connect Firestore persistence service.

  This service stores LIA's synchronized Stripe Connect state on the
  corresponding store document.

  Architecture:

  Stripe account
        ↓
  Stripe account mapper
        ↓
  StripeConnectAccount
        ↓
  This persistence service
        ↓
  stores/{storeId}

  Important:

  Stripe remains the source of truth for connected-account status.

  Firestore stores the latest synchronized summary so LIA can:

  - Render the store payment settings page
  - Decide whether a store is ready to receive transfers
  - Identify accounts that require additional onboarding
  - Match Stripe webhooks to Firestore stores
*/

import "server-only";

import {
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";

import {getFirebaseAdminFirestore} from "@/lib/firebaseAdmin";
import type {StripeConnectAccount} from "@/types/stripeConnect";


/*
  Predictable persistence error codes.

  These allow future API routes and webhook handlers to distinguish
  expected data problems from unexpected server failures.
*/
export type StripeConnectPersistenceErrorCode =
  | "STORE_NOT_FOUND"
  | "STORE_OWNER_MISMATCH"
  | "STRIPE_ACCOUNT_CONFLICT"
  | "INVALID_OWNER_TYPE";


/*
  Custom error for Stripe Connect persistence failures.

  We avoid exposing raw Firestore errors or sensitive internal data
  directly to the browser.
*/
export class StripeConnectPersistenceError extends Error {
  readonly code: StripeConnectPersistenceErrorCode;

  constructor(
    code: StripeConnectPersistenceErrorCode,
    message: string
  ) {
    super(message);

    this.name = "StripeConnectPersistenceError";
    this.code = code;
  }
}


/*
  Validate that a Stripe Connect record belongs to a store.

  The shared Stripe domain types also support future driver accounts,
  but this persistence service writes only to store documents.
*/
function requireStoreOwnerType(
  account: StripeConnectAccount
): void {
  if (account.ownerType !== "store") {
    throw new StripeConnectPersistenceError(
      "INVALID_OWNER_TYPE",
      "This persistence operation supports store Stripe accounts only."
    );
  }
}

/* Convert the Stripe domain model's ISO value into a native Firestore timestamp. */
function timestampFromIso(value: string, fieldName: string): Timestamp {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new StripeConnectPersistenceError(
      "INVALID_OWNER_TYPE",
      `Stripe returned an invalid ${fieldName} timestamp.`
    );
  }

  return Timestamp.fromDate(date);
}


/*
  Verify the store exists and belongs to the expected Firebase user.

  This authorization check is repeated inside the transaction.

  Why repeat it?

  The earlier authorization service checks ownership before calling
  Stripe. However, the store document could theoretically change
  between account creation and Firestore persistence.

  Rechecking inside the transaction protects the final write.
*/
function validateStoreInsideTransaction(
  transaction: Transaction,
  storeReference: FirebaseFirestore.DocumentReference,
  expectedOwnerId: string,
  stripeAccountId: string
): Promise<void> {
  return transaction.get(storeReference).then((storeSnapshot) => {
    if (!storeSnapshot.exists) {
      throw new StripeConnectPersistenceError(
        "STORE_NOT_FOUND",
        "The store no longer exists."
      );
    }

    const storeData = storeSnapshot.data();

    const currentOwnerId =
      typeof storeData?.ownerId === "string"
        ? storeData.ownerId.trim()
        : "";

    if (currentOwnerId !== expectedOwnerId) {
      throw new StripeConnectPersistenceError(
        "STORE_OWNER_MISMATCH",
        "The authenticated user no longer owns this store."
      );
    }

    /*
      Never silently replace one connected account with another.

      Allowed states:

      1. The store does not have a Stripe account yet.
      2. The existing account ID matches the account being synchronized.

      Disallowed state:

      The store already references a different Stripe account ID.
    */
    const existingStripeAccountId =
      typeof storeData?.stripeAccountId === "string"
        ? storeData.stripeAccountId.trim()
        : "";

    const hasConflictingStripeAccount =
      existingStripeAccountId.length > 0 &&
      existingStripeAccountId !== stripeAccountId;

    if (hasConflictingStripeAccount) {
      throw new StripeConnectPersistenceError(
        "STRIPE_ACCOUNT_CONFLICT",
        "This store is already connected to a different Stripe account."
      );
    }
  });
}


/*
  Save a store account after confirming the expected Firebase owner.

  Parameters:

  account:
    The mapped Stripe Connect account.

    For a store account:
    - account.ownerType must be "store"
    - account.ownerId must be the Firestore store document ID

  expectedFirebaseOwnerId:
    The trusted Firebase UID obtained from verifyIdToken().
*/
async function saveAuthorizedStoreAccount(
  account: StripeConnectAccount,
  expectedFirebaseOwnerId: string
): Promise<void> {
  requireStoreOwnerType(account);

  const normalizedStoreId = account.ownerId.trim();
  const normalizedFirebaseOwnerId =
    expectedFirebaseOwnerId.trim();

  if (!normalizedStoreId) {
    throw new StripeConnectPersistenceError(
      "STORE_NOT_FOUND",
      "A valid store ID is required."
    );
  }

  if (!normalizedFirebaseOwnerId) {
    throw new StripeConnectPersistenceError(
      "STORE_OWNER_MISMATCH",
      "A valid store owner ID is required."
    );
  }

  const firestore = getFirebaseAdminFirestore();
  const storeReference = firestore
    .collection("stores")
    .doc(normalizedStoreId);

  await firestore.runTransaction(async (transaction) => {
    /*
      Read and validate before writing.

      Firestore transactions may retry when concurrent edits occur.
      This callback must therefore contain only Firestore operations
      and deterministic validation.

      We never call Stripe from inside this transaction.
    */
    await validateStoreInsideTransaction(
      transaction,
      storeReference,
      normalizedFirebaseOwnerId,
      account.accountId
    );

    /*
      Store a safe operational summary.

      Sensitive identity, tax, and banking information stays in Stripe.
    */
    transaction.update(storeReference, {
      stripeAccountId: account.accountId,

      /* This account was created and is queried through Accounts v2. */
      stripeConnectApiVersion: "v2",

      /*
        Existing PaymentSection currently reads stripeAccountStatus.

        We preserve that field name while expanding its possible values
        beyond the old active/pending/inactive model.
      */
      stripeAccountStatus: account.onboardingStatus,

      stripeChargesEnabled: account.chargesEnabled,
      stripeTransfersEnabled: account.transfersEnabled,
      stripePayoutsEnabled: account.payoutsEnabled,
      stripeDetailsSubmitted: account.detailsSubmitted,

      /*
        The settings UI can use these derived flags without needing to
        interpret every Stripe requirement.
      */
      stripeRequiresAction:
        account.onboardingStatus === "action_required" ||
        account.onboardingStatus === "restricted",

      stripeIsReady:
        account.onboardingStatus === "complete",

      /* Native timestamps keep Firestore sorting and querying predictable. */
      stripeConnectedAt: timestampFromIso(
        account.connectedAt,
        "connection"
      ),
      stripeUpdatedAt: timestampFromIso(
        account.updatedAt,
        "update"
      ),
    });
  });
}


/*
  Type guard for future API route and webhook error handling.
*/
export function isStripeConnectPersistenceError(
  error: unknown
): error is StripeConnectPersistenceError {
  return error instanceof StripeConnectPersistenceError;
}


/*
  Export the authorization-aware operation only.

  The unused internal saveStoreAccount function remains intentionally
  unexported to demonstrate why store ID and Firebase owner UID must
  remain separate concepts.
*/
export const stripeConnectPersistenceService = {
  saveAuthorizedStoreAccount,
};
