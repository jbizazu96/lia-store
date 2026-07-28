/*
  Client-side Stripe Connect API service.

  This service is used by React Client Components to communicate with
  LIA's protected Stripe API routes.

  Responsibilities:

  - Obtain the current Firebase user's ID token
  - Add the token to the Authorization header
  - Send typed requests to the Stripe Connect API routes
  - Parse successful responses
  - Convert failed responses into predictable client errors

  Important architecture rule:

  Client component
        ↓
  This client service
        ↓
  Next.js API route
        ↓
  Server-side Stripe Connect services
        ↓
  Stripe API

  This file never imports the Stripe Node SDK or the Stripe secret key.
*/

import {getAuth} from "firebase/auth";

import type {
  StripeConnectAccountSummary,
  StripeOnboardingLinkResult,
} from "@/types/stripeConnect";


/*
  Error response shape returned by our Stripe API routes.
*/
interface StripeConnectApiErrorResponse {
  error?: string;
  code?: string;
}


/*
  Successful response returned by:

  POST /api/stripe/connect/account
*/
export interface CreateStripeAccountResponse {
  account: StripeConnectAccountSummary;

  /*
    True when a new Stripe account was created.

    False means the route reused an account that was already connected
    to the store.
  */
  created: boolean;
}


/*
  Successful response returned by:

  POST /api/stripe/connect/onboarding-link
*/
export interface CreateStripeOnboardingLinkResponse {
  onboarding: StripeOnboardingLinkResult;
}

/*
  Successful response returned by:

  POST /api/stripe/connect/status
*/
export interface StripeAccountStatusResponse {
  /*
    null means the store has not created a Stripe connected account.
  */
  account: StripeConnectAccountSummary | null;

  connected: boolean;
}


/*
  Predictable client error generated when an API request fails.

  UI components can use:

  error.code
  error.status
  error.message

  without needing to understand the raw Response object.
*/
export class StripeConnectClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    message: string,
    code: string,
    status: number
  ) {
    super(message);

    this.name = "StripeConnectClientError";
    this.code = code;
    this.status = status;
  }
}


/*
  Get a fresh Firebase ID token for the currently signed-in user.

  The token proves the user's identity to the Next.js backend.

  The backend still performs the real security checks using Firebase
  Admin and store ownership validation.
*/
async function getFirebaseIdToken(): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new StripeConnectClientError(
      "You must sign in before managing Stripe.",
      "USER_NOT_AUTHENTICATED",
      401
    );
  }

  /*
    getIdToken() automatically refreshes an expired token when needed.

    We do not force a refresh on every request because Firebase already
    manages token expiration and refresh behavior.
  */
  return user.getIdToken();
}


/*
  Parse an unsuccessful API response.

  The route usually returns:

  {
    error: "Safe message",
    code: "ERROR_CODE"
  }

  We still provide fallbacks in case an infrastructure failure returns
  an unexpected body.
*/
async function createApiError(
  response: Response
): Promise<StripeConnectClientError> {
  let errorResponse: StripeConnectApiErrorResponse = {};

  try {
    errorResponse =
      (await response.json()) as StripeConnectApiErrorResponse;
  } catch {
    /*
      Ignore JSON parsing failure and use safe fallback values below.
    */
  }

  return new StripeConnectClientError(
    errorResponse.error ??
      "The Stripe request could not be completed.",
    errorResponse.code ??
      "STRIPE_CONNECT_REQUEST_FAILED",
    response.status
  );
}


/*
  Send one authenticated POST request to a Stripe Connect endpoint.

  TResponse represents the expected successful response type.
*/
async function postStripeConnectRequest<TResponse>(
  url: string,
  storeId: string,
  payload: Record<string, unknown> = {}
): Promise<TResponse> {
  const normalizedStoreId = storeId.trim();

  if (!normalizedStoreId) {
    throw new StripeConnectClientError(
      "A valid store ID is required.",
      "INVALID_STORE_ID",
      400
    );
  }

  const idToken = await getFirebaseIdToken();

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      /*
        The server verifies this Firebase ID token using Firebase Admin.
      */
      Authorization: `Bearer ${idToken}`,
    },

    body: JSON.stringify({
      storeId: normalizedStoreId,
      ...payload,
    }),

    /*
      Stripe account status must always come from the server rather
      than a browser cache.
    */
    cache: "no-store",
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<TResponse>;
}


/*
  Create a connected account or retrieve the one already assigned to
  the store.

  Endpoint:

  POST /api/stripe/connect/account
*/
async function createOrRetrieveAccount(
  storeId: string
): Promise<CreateStripeAccountResponse> {
  return postStripeConnectRequest<CreateStripeAccountResponse>(
    "/api/stripe/connect/account",
    storeId
  );
}


/*
  Create a temporary Stripe-hosted onboarding link.

  The connected account must already exist.

  Endpoint:

  POST /api/stripe/connect/onboarding-link
*/
async function createOnboardingLink(
  storeId: string
): Promise<CreateStripeOnboardingLinkResponse> {
  return postStripeConnectRequest<CreateStripeOnboardingLinkResponse>(
    "/api/stripe/connect/onboarding-link",
    storeId
  );
}


/*
  Retrieve the latest account state from Stripe and synchronize it to
  Firestore.

  Endpoint:

  POST /api/stripe/connect/status
*/
async function getAccountStatus(
  storeId: string
): Promise<StripeAccountStatusResponse> {
  return postStripeConnectRequest<StripeAccountStatusResponse>(
    "/api/stripe/connect/status",
    storeId
  );
}


/*
  Type guard for React components.

  Example:

  catch (error) {
    if (isStripeConnectClientError(error)) {
      setError(error.message);
    }
  }
*/
export function isStripeConnectClientError(
  error: unknown
): error is StripeConnectClientError {
  return error instanceof StripeConnectClientError;
}


/*
  Stable client service interface.

  React components should use this object rather than calling fetch()
  directly for Stripe Connect operations.
*/
export const stripeConnectClientService = {
  createOrRetrieveAccount,
  createOnboardingLink,
  getAccountStatus,
};
