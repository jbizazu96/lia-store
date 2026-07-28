/*
  Stripe-hosted onboarding-link API route.

  POST /api/stripe/connect/onboarding-link

  Responsibilities:

  - Authenticate the Firebase user
  - Validate the requested store
  - Confirm store ownership
  - Require an existing Stripe connected account
  - Create a temporary Stripe-hosted onboarding link
  - Return the temporary URL to the browser

  Important:

  Stripe Account Links are short-lived and single-use.

  They must not be stored permanently in Firestore or sent through
  insecure channels.
*/

import {NextResponse} from "next/server";
import Stripe from "stripe";

import {
  isFirebaseAuthenticationError,
  requireFirebaseUser,
} from "@/lib/auth/requireFirebaseUser";
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
  Expected request body.

  The browser supplies only the store ID.

  The connected account ID is loaded from trusted Firestore data.
*/
interface CreateOnboardingLinkRequestBody {
  storeId: string;
}


/*
  Predictable request-validation error.
*/
class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "RequestValidationError";
  }
}


/*
  Validate and normalize the request body.
*/
async function parseRequestBody(
  request: Request
): Promise<CreateOnboardingLinkRequestBody> {
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
  Convert store authorization failures into HTTP status codes.
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
  Build the trusted application origin.

  We do not accept redirect URLs from the browser because an attacker
  could otherwise attempt to redirect Stripe onboarding to an
  untrusted website.
*/
function getApplicationOrigin(request: Request): string {
  /*
    Production deployments should define APP_URL explicitly.

    Example:

    APP_URL=https://www.lia-store.com
  */
  const configuredAppUrl = process.env.APP_URL?.trim();

  if (configuredAppUrl) {
    return configuredAppUrl.replace(/\/+$/, "");
  }

  /*
    During local development, use the origin of the current request.

    Example:

    http://localhost:3000
  */
  return new URL(request.url).origin;
}


/*
  Create a temporary Stripe-hosted onboarding link.
*/
export async function POST(request: Request) {
  try {
    /*
      Step 1:
      Authenticate the Firebase user.
    */
    const authenticatedUser =
      await requireFirebaseUser(request);

    /*
      Step 2:
      Validate the store ID.
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
      An onboarding link requires an existing connected account.

      The account-creation endpoint must run first.
    */
    if (!store.stripeAccountId) {
      return NextResponse.json(
        {
          error:
            "Create the store's Stripe account before starting onboarding.",
          code: "STRIPE_ACCOUNT_NOT_CREATED",
        },
        {
          status: 409,
        }
      );
    }

    /* Never send a legacy Accounts v1 ID to an Accounts v2 endpoint. */
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

    const applicationOrigin = getApplicationOrigin(request);

    /*
      Stripe sends the user back to the existing store settings page.

      We include section=payment so the settings page can reopen the
      payment section when it supports section-based navigation.
    */
    const refreshUrl =
      `${applicationOrigin}/store/settings` +
      `?section=payment` +
      `&storeId=${encodeURIComponent(store.id)}` +
      `&stripe=refresh`;

    /*
      Stripe sends the store owner here after they leave the hosted
      onboarding flow.

      Important:

      Returning to this URL does not prove onboarding is complete.

      PaymentSection will call the status endpoint and retrieve the latest
      account state directly from Stripe.
    */
    const returnUrl =
      `${applicationOrigin}/store/settings` +
      `?section=payment` +
      `&storeId=${encodeURIComponent(store.id)}` +
      `&stripe=return`;

    /*
      Step 4:
      Generate the temporary Stripe Account Link.
    */
    const onboardingLink =
      await stripeConnectService.createOnboardingLink({
        accountId: store.stripeAccountId,
        refreshUrl,
        returnUrl,
      });

    /*
      Prevent browsers and intermediary caches from storing a temporary
      financial onboarding URL.
    */
    return NextResponse.json(
      {
        onboarding: onboardingLink,
      },
      {
        status: 200,
        headers: {
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
      console.error("Stripe onboarding-link request failed:", {
        type: error.type,
        code: error.code,
        message: error.message,
        requestId: error.requestId,
      });

      return NextResponse.json(
        {
          error:
            "Stripe could not create the onboarding link.",
          code: "STRIPE_ONBOARDING_LINK_FAILED",
        },
        {
          status: 502,
        }
      );
    }

    console.error(
      "Unexpected Stripe onboarding-link API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "The Stripe onboarding link could not be created.",
        code: "INTERNAL_SERVER_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}
