/*
  Store Stripe connected-account API route.

  POST /api/stripe/connect/account

  Responsibilities:

  - Authenticate the Firebase user
  - Authorize access to the requested store
  - Reuse an existing connected account when present
  - Create a new connected account when needed
  - Synchronize the latest Stripe state to Firestore
  - Return a safe account summary to the browser

  Important:

  This route does not create the Stripe-hosted onboarding link yet.

  Account creation and onboarding-link creation are separate operations.
  Keeping them separate makes retries, error handling, and testing easier.
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
  Force this route to use the Node.js runtime.

  The Stripe Node SDK and Firebase Admin SDK are server-side Node
  libraries and should not run in the Edge runtime.
*/
export const runtime = "nodejs";


/*
  Expected JSON request body.

  The browser supplies only the store ID.

  We do not accept ownerId, store name, email, or Stripe account ID
  from the browser because those values must come from trusted
  Firestore data.
*/
interface CreateStripeAccountRequestBody {
  storeId: string;
}

type StripeIdentityEntityType =
  | "company"
  | "individual"
  | "non_profit";


/*
  Safely parse and validate the request body.

  We reject missing, malformed, or empty store IDs before performing
  any Firebase or Stripe operations.
*/
async function parseRequestBody(
  request: Request
): Promise<CreateStripeAccountRequestBody> {
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
  Predictable request-validation error.

  This allows the route to distinguish a bad client request from an
  authentication, authorization, Stripe, or server error.
*/
class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "RequestValidationError";
  }
}


/*
  Translate store authorization errors into safe HTTP responses.
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
  Accounts v2 requires an ISO country and the legal entity type before a
  recipient configuration can be requested. Store creation currently serves
  the United States only, while newer store documents persist country=US.
*/
function getStripeIdentityCountry(country: string | undefined): string {
  if (!country) {
    return "US";
  }

  const normalizedCountry = country.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
    throw new RequestValidationError(
      "The store country must be a two-letter ISO country code."
    );
  }

  return normalizedCountry;
}


function getStripeIdentityEntityType(
  businessStructure: string | undefined,
  accountType: string | undefined
): StripeIdentityEntityType {
  /*
    The legal Business Structure is the authoritative LIA field for the
    Stripe entity type. The payment account type remains only as a fallback
    for older store records and to represent a non-profit.
  */
  switch (businessStructure) {
    case "llc":
    case "corporation":
    case "partnership":
      return "company";

    case "sole_proprietorship":
    case "dba":
      return "individual";
  }

  if (accountType === "non_profit") {
    return "non_profit";
  }

  if (accountType === "company" || accountType === "individual") {
    return accountType;
  }

  throw new RequestValidationError(
    "Select a valid business structure in Store Settings before connecting Stripe."
  );
}


/*
  Create or retrieve the store's Stripe connected account.
*/
export async function POST(request: Request) {
  try {
    /*
      Step 1:
      Verify the Firebase ID token and obtain the trusted UID.

      The UID is never taken from the request body.
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
      Load the store through Firebase Admin and confirm the verified
      user owns it.
    */
    const store =
      await serverStoreAuthorizationService.requireOwnedStore(
        storeId,
        authenticatedUser.uid
      );

    /*
      Preserve the original Stripe connection timestamp.

      For an existing connected account, use the value already stored in
      Firestore.

      For a newly created account, use the current time.
    */
    const connectedAt =
      store.stripeConnectedAt ??
      new Date().toISOString();

    /*
      An existing ID without the v2 marker was created by the former v1
      integration. Do not mix API generations or risk mutating it wrongly.
    */
    if (
      store.stripeAccountId &&
      store.stripeConnectApiVersion !== "v2"
    ) {
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
      Reuse the existing Stripe account whenever Firestore already
      contains one.

      This prevents a store from receiving multiple connected accounts
      because of repeated button clicks or browser retries.
    */
    const stripeAccount = store.stripeAccountId
      ? await stripeConnectService.getAccount(
          store.stripeAccountId
        )
      : await stripeConnectService.createStoreAccount({
          storeId: store.id,
          ownerId: store.ownerId,
          storeName: store.name,
          email: store.email,
          phone: store.phone,
          country: getStripeIdentityCountry(store.country),
          entityType: getStripeIdentityEntityType(
            store.businessStructure,
            store.stripeAccountType
          ),
          productDescription:
            `${store.name} sells grocery and retail products through LIA Store.`,
        });

    /*
      Step 5:
      Convert Stripe's external Account object into LIA's stable domain
      model.

      For store accounts, ownerId is the Firestore store document ID.
    */
    const mappedAccount = mapStripeAccount(
      stripeAccount,
      "store",
      store.id,
      connectedAt
    );

    /*
      Step 6:
      Atomically save the account ID and latest status to the store
      document.

      The persistence service repeats the ownership check inside the
      Firestore transaction.
    */
    await stripeConnectPersistenceService
      .saveAuthorizedStoreAccount(
        mappedAccount,
        authenticatedUser.uid
      );

    /*
      Step 7:
      Return only the browser-safe account summary.

      Never return the complete Stripe Account object.
    */
    const summary = mapStripeAccountSummary(
      stripeAccount,
      "store",
      store.id
    );

    return NextResponse.json(
      {
        account: summary,

        /*
          Helps the UI distinguish initial creation from reuse.
        */
        created: !store.stripeAccountId,
      },
      {
        status: store.stripeAccountId ? 200 : 201,
      }
    );
  } catch (error: unknown) {
    /*
      Authentication failures always return HTTP 401.
    */
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

    /*
      Invalid request bodies return HTTP 400.
    */
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

    /*
      Store authorization failures return 403, 404, or 500 depending
      on the specific problem.
    */
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

    /*
      Stripe API errors contain useful server diagnostics, but the full
      Stripe error must not be returned to the browser.
    */
    if (error instanceof Stripe.errors.StripeError) {
      console.error("Stripe connected-account request failed:", {
        type: error.type,
        code: error.code,
        message: error.message,
        requestId: error.requestId,
      });

      return NextResponse.json(
        {
          error:
            "Stripe could not process the connected-account request.",
          code: "STRIPE_REQUEST_FAILED",
        },
        {
          status: 502,
        }
      );
    }

    /*
      Unexpected failures are logged internally and returned as a
      generic server error.
    */
    console.error(
      "Unexpected Stripe connected-account API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "The Stripe account request could not be completed.",
        code: "INTERNAL_SERVER_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}
