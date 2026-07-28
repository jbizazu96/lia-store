/*
  Stripe connected-account status API route.

  POST /api/stripe/connect/status

  Responsibilities:

  - Authenticate the Firebase user
  - Validate the requested store ID
  - Confirm that the user owns the store
  - Require an existing Stripe connected account
  - Retrieve the latest account state directly from Stripe
  - Map the Stripe account into LIA's domain model
  - Synchronize the latest status to Firestore
  - Return a browser-safe summary

  This endpoint will be used:

  - When the payment settings page loads
  - After Stripe redirects the store owner back to LIA
  - After the store owner continues or updates onboarding
  - When the user manually refreshes the payment status
*/

import {NextResponse} from "next/server";
import Stripe from "stripe";

import {
  isFirebaseAuthenticationError,
  requireFirebaseUser,
} from "@/lib/auth/requireFirebaseUser";
import {
  mapStripeAccount,
  mapStripeAccountSummary,
} from "@/mappers/stripeConnectMapper";
import {stripeConnectPersistenceService} from "@/services/payment/stripeConnectPersistenceService";
import {stripeConnectService} from "@/services/payment/stripeConnectService";
import {
  isStoreAuthorizationError,
  serverStoreAuthorizationService,
} from "@/services/store/serverStoreAuthorizationService";


/*
  Stripe and Firebase Admin require the Node.js runtime.
*/
export const runtime = "nodejs";


/*
  The browser supplies only the Firestore store document ID.

  The Stripe account ID and store owner ID are loaded from trusted
  Firestore data after authentication.
*/
interface StripeStatusRequestBody {
  storeId: string;
}


/*
  Predictable request validation error.
*/
class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "RequestValidationError";
  }
}


/*
  Parse and validate the request body.
*/
async function parseRequestBody(
  request: Request
): Promise<StripeStatusRequestBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError(
      "The request body must contain valid JSON."
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new RequestValidationError(
      "The request body is invalid."
    );
  }

  const storeId = Reflect.get(body, "storeId");

  if (
    typeof storeId !== "string" ||
    storeId.trim().length === 0
  ) {
    throw new RequestValidationError(
      "A valid store ID is required."
    );
  }

  return {
    storeId: storeId.trim(),
  };
}


/*
  Translate store authorization errors into HTTP status codes.
*/
function getStoreAuthorizationStatus(
  code: string
): number {
  switch (code) {
    case "STORE_FORBIDDEN":
      return 403;

    case "STORE_NOT_FOUND":
      return 404;

    case "STORE_INVALID":
    default:
      return 500;
  }
}


/*
  Retrieve and synchronize the store's latest Stripe account state.
*/
export async function POST(request: Request) {
  try {
    /*
      Step 1:
      Verify the Firebase ID token.
    */
    const authenticatedUser =
      await requireFirebaseUser(request);

    /*
      Step 2:
      Validate the requested store ID.
    */
    const {storeId} = await parseRequestBody(request);

    /*
      Step 3:
      Confirm that the authenticated user owns the store.
    */
    const store =
      await serverStoreAuthorizationService.requireOwnedStore(
        storeId,
        authenticatedUser.uid
      );

    /*
      Status synchronization requires an existing connected account.
    */
    if (!store.stripeAccountId) {
      return NextResponse.json(
        {
          account: null,
          connected: false,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    /* Do not query an Accounts v1 ID through the Accounts v2 API. */
    if (store.stripeConnectApiVersion !== "v2") {
      return NextResponse.json(
        {
          error:
            "This store has a legacy Stripe connection. Reconnect Stripe to use the current payment setup.",
          code: "STRIPE_ACCOUNT_VERSION_MISMATCH",
        },
        {status: 409}
      );
    }

    /*
      Step 4:
      Retrieve the latest account directly from Stripe.

      Firestore is a synchronized cache for the UI, while Stripe remains
      the source of truth for the connected account's operational state.
    */
    const stripeAccount =
      await stripeConnectService.getAccount(
        store.stripeAccountId
      );

    /*
      Preserve the original connection date.

      Existing connected accounts should already have this value.
      The fallback safely supports older store records created before
      stripeConnectedAt was introduced.
    */
    const connectedAt =
      store.stripeConnectedAt ??
      new Date().toISOString();

    /*
      Step 5:
      Convert the external Stripe Account object into LIA's domain model.
    */
    const mappedAccount = mapStripeAccount(
      stripeAccount,
      "store",
      store.id,
      connectedAt
    );

    /*
      Step 6:
      Save the latest synchronized state to Firestore.

      The persistence service repeats the store ownership validation
      inside its transaction.
    */
    await stripeConnectPersistenceService
      .saveAuthorizedStoreAccount(
        mappedAccount,
        authenticatedUser.uid
      );

    /*
      Step 7:
      Return only the safe browser summary.
    */
    const summary = mapStripeAccountSummary(
      stripeAccount,
      "store",
      store.id
    );

    return NextResponse.json(
      {
        account: summary,
        connected: true,
      },
      {
        status: 200,
        headers: {
          /*
            Account status can change at any time.

            Never allow browsers or intermediary caches to reuse an old
            response for this financial status endpoint.
          */
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: unknown) {
    if (isFirebaseAuthenticationError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: 401,
        }
      );
    }

    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "INVALID_REQUEST",
        },
        {
          status: 400,
        }
      );
    }

    if (isStoreAuthorizationError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: getStoreAuthorizationStatus(error.code),
        }
      );
    }

    if (error instanceof Stripe.errors.StripeError) {
      console.error("Stripe account-status request failed:", {
        type: error.type,
        code: error.code,
        message: error.message,
        requestId: error.requestId,
      });

      return NextResponse.json(
        {
          error:
            "Stripe could not retrieve the connected-account status.",
          code: "STRIPE_STATUS_FAILED",
        },
        {
          status: 502,
        }
      );
    }

    console.error(
      "Unexpected Stripe account-status API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "The Stripe account status could not be refreshed.",
        code: "INTERNAL_SERVER_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}
