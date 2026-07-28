/*
  Server-side store authorization service.

  This service loads a store through Firebase Admin and confirms that
  the authenticated Firebase user owns that store.

  Important:

  Firebase Admin bypasses normal Firestore security rules.

  Therefore, server routes must never assume that a storeId supplied
  by the browser belongs to the signed-in user.

  Correct flow:

  1. Verify the Firebase ID token.
  2. Obtain the trusted Firebase UID.
  3. Load the requested store using Firebase Admin.
  4. Compare stores/{storeId}.ownerId with the trusted UID.
  5. Continue only when ownership matches.
*/

import "server-only";

import type {DocumentData} from "firebase-admin/firestore";

import {getFirebaseAdminFirestore} from "@/lib/firebaseAdmin";


/*
  Error codes returned by store authorization operations.

  API routes will later translate these into appropriate HTTP statuses:

  STORE_NOT_FOUND  → 404
  STORE_FORBIDDEN  → 403
  STORE_INVALID    → 500
*/
export type StoreAuthorizationErrorCode =
  | "STORE_NOT_FOUND"
  | "STORE_FORBIDDEN"
  | "STORE_INVALID";


/*
  Predictable authorization error.

  We use our own error instead of returning raw Firestore errors to
  the browser.

  Internal database errors should be logged on the server, while the
  browser receives only a safe message.
*/
export class StoreAuthorizationError extends Error {
  readonly code: StoreAuthorizationErrorCode;

  constructor(
    code: StoreAuthorizationErrorCode,
    message: string
  ) {
    super(message);

    this.name = "StoreAuthorizationError";
    this.code = code;
  }
}


/*
  Minimal trusted store information required by Stripe Connect.

  This is intentionally smaller than the complete Store domain type.

  The Stripe backend currently needs only:

  - Store ID
  - Owner UID
  - Store name
  - Email
  - Phone
  - Existing Stripe account ID

  Keeping the server authorization result focused prevents unrelated
  store fields from leaking into payment logic.
*/
export interface AuthorizedStripeStore {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  businessStructure?: string;
  stripeAccountType?: string;

  /*
    Existing Stripe connected account ID.

    undefined means the store has not connected Stripe yet.
  */
  stripeAccountId?: string;

  /* Stripe API generation associated with stripeAccountId. */
  stripeConnectApiVersion?: string;

  /*
    Original ISO timestamp for when the store first connected Stripe.

    This value must remain stable during later account-status
    synchronizations.
  */
  stripeConnectedAt?: string;
}


/*
  Safely read a required string from an untyped Firestore document.

  Firebase Admin returns DocumentData, so runtime validation remains
  necessary even though the rest of our application uses TypeScript.
*/
function getRequiredString(
  data: DocumentData,
  fieldName: string,
  storeId: string
): string {
  const value = data[fieldName];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StoreAuthorizationError(
      "STORE_INVALID",
      `Store ${storeId} has an invalid ${fieldName} field.`
    );
  }

  return value.trim();
}


/*
  Safely read an optional string from Firestore.

  Empty strings are treated as missing values.
*/
function getOptionalString(
  data: DocumentData,
  fieldName: string
): string | undefined {
  const value = data[fieldName];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0
    ? normalizedValue
    : undefined;
}


/*
  Load one store and verify ownership.

  Parameters:

  storeId:
    The store document ID supplied by the API request.

  authenticatedUserId:
    The trusted UID returned by Firebase Admin verifyIdToken().

  Never pass a UID directly from the browser as authenticatedUserId.
*/
async function requireOwnedStore(
  storeId: string,
  authenticatedUserId: string
): Promise<AuthorizedStripeStore> {
  /*
    Reject empty identifiers before making a Firestore request.
  */
  const normalizedStoreId = storeId.trim();
  const normalizedUserId = authenticatedUserId.trim();

  if (!normalizedStoreId) {
    throw new StoreAuthorizationError(
      "STORE_NOT_FOUND",
      "A valid store ID is required."
    );
  }

  if (!normalizedUserId) {
    throw new StoreAuthorizationError(
      "STORE_FORBIDDEN",
      "A valid authenticated user is required."
    );
  }

  const firestore = getFirebaseAdminFirestore();

  const storeSnapshot = await firestore
    .collection("stores")
    .doc(normalizedStoreId)
    .get();

  /*
    Do not continue when the requested store does not exist.
  */
  if (!storeSnapshot.exists) {
    throw new StoreAuthorizationError(
      "STORE_NOT_FOUND",
      "The requested store was not found."
    );
  }

  const storeData = storeSnapshot.data();

  if (!storeData) {
    throw new StoreAuthorizationError(
      "STORE_INVALID",
      "The store record could not be read."
    );
  }

  const ownerId = getRequiredString(
    storeData,
    "ownerId",
    normalizedStoreId
  );

  /*
    This is the critical authorization check.

    The UID comes from the verified Firebase token—not from the request
    body—so the browser cannot impersonate another store owner by
    submitting a different owner ID.
  */
  if (ownerId !== normalizedUserId) {
    throw new StoreAuthorizationError(
      "STORE_FORBIDDEN",
      "You do not have permission to manage this store."
    );
  }

  return {
      id: storeSnapshot.id,
      ownerId,
      name: getRequiredString(
        storeData,
        "name",
        normalizedStoreId
      ),
      email: getRequiredString(
        storeData,
        "email",
        normalizedStoreId
      ),
      phone: getOptionalString(storeData, "phone"),
      country: getOptionalString(storeData, "country"),
      businessStructure: getOptionalString(
        storeData,
        "businessStructure"
      ),
      stripeAccountType: getOptionalString(
        storeData,
        "stripeAccountType"
      ),

      /*
        Stripe account information is read from trusted Firestore data,
        never from the browser request.
      */
      stripeAccountId: getOptionalString(
        storeData,
        "stripeAccountId"
      ),

      stripeConnectApiVersion: getOptionalString(
        storeData,
        "stripeConnectApiVersion"
      ),

      /*
        Preserve the original connection timestamp during later Stripe
        account refreshes.
      */
      stripeConnectedAt: getOptionalString(
        storeData,
        "stripeConnectedAt"
      ),
    };
}


/*
  Type guard for API route error handling.

  Example:

  if (isStoreAuthorizationError(error)) {
    // Return 403, 404, or 500 depending on error.code.
  }
*/
export function isStoreAuthorizationError(
  error: unknown
): error is StoreAuthorizationError {
  return error instanceof StoreAuthorizationError;
}


/*
  Export one stable service interface.

  Future operations may include:

  - Updating the Stripe account ID
  - Saving synchronized Stripe status
  - Reading payout settings
*/
export const serverStoreAuthorizationService = {
  requireOwnedStore,
};
