/*
  Stripe Connect Accounts v2 webhook.

  This HTTPS function receives Stripe thin-event notifications for
  connected store accounts.

  Flow:

  Stripe Accounts v2 event
        ↓
  Verify Stripe signature using the untouched raw request body
        ↓
  Validate the event type and related Account reference
        ↓
  Retrieve the latest Accounts v2 Account from Stripe
        ↓
  Read and validate LIA metadata
        ↓
  Map the account into LIA's stable Stripe state
        ↓
  Update stores/{storeId} in Firestore

  Important:

  Thin events do not contain the complete Account resource.

  We always retrieve the latest account state from Stripe before
  updating Firestore.
*/

import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import Stripe from "stripe";

import {
  mapStripeAccount,
} from "../stripe/stripeConnectMapper";
import {
  isStripeWebhookPersistenceError,
  stripeConnectPersistence,
} from "../stripe/stripeConnectPersistence";


/*
  Stripe API secret used to retrieve the latest Accounts v2 resource.

  This secret will be stored in Google Secret Manager through Firebase.
*/
const stripeSecretKey =
  defineSecret("STRIPE_SECRET_KEY");


/*
  Signing secret belonging specifically to the Stripe event
  destination that points to this Firebase Function.

  This is not the same value as STRIPE_SECRET_KEY.

  Webhook signing secrets normally begin with:

  whsec_
*/
const stripeConnectWebhookSecret =
  defineSecret("STRIPE_CONNECT_WEBHOOK_SECRET");


/*
  Account data needed by the mapper.

  This must match the includes used by the working Next.js Accounts v2
  service.
*/
const ACCOUNT_INCLUDES = [
  "configuration.recipient",
  "identity",
  "requirements",
  "future_requirements",
] as const;


/*
  Thin-event shape returned by constructEvent().

  constructEvent verifies the original Stripe JSON payload; it does not
  transform its API field names, so related_object remains snake case.
*/
interface StripeV2AccountEventNotification {
  id: string;
  type: string;
  livemode: boolean;

  related_object: {
    id: string;
    type: string;
    url: string;
  } | null;
}


/*
  Events that can change the state displayed by LIA's payment settings.

  Requirement events:
  - Information becomes due
  - Information is submitted
  - Stripe begins or finishes verification
  - A requirement becomes past due

  Recipient events:
  - Recipient configuration changes
  - stripe_transfers capability changes status
*/
const SUPPORTED_EVENT_TYPES = new Set<string>([
  "v2.core.account[requirements].updated",
  "v2.core.account[future_requirements].updated",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
]);


/*
  Safely parse and validate the signed event as an Accounts v2 Account
  event notification.

  Signature verification happens before this function is called.
*/
function parseAccountEventNotification(
  verifiedEvent: unknown
): StripeV2AccountEventNotification {
  if (
    typeof verifiedEvent !== "object" ||
    verifiedEvent === null
  ) {
    throw new Error(
      "The verified Stripe event payload is invalid."
    );
  }

  const event = verifiedEvent as Partial<
    StripeV2AccountEventNotification
  >;

  if (
    typeof event.id !== "string" ||
    typeof event.type !== "string"
  ) {
    throw new Error(
      "The Stripe payload is not a valid Accounts v2 event notification."
    );
  }

  if (
    typeof event.livemode !== "boolean"
  ) {
    throw new Error(
      "The Stripe event is missing its livemode value."
    );
  }

  return event as StripeV2AccountEventNotification;
}


/*
  Extract the related Accounts v2 account ID from the thin event.

  We require the related object type to be exactly "v2.core.account"
  so another Stripe resource cannot be processed accidentally.
*/
function getRelatedAccountId(
  event: StripeV2AccountEventNotification
): string {
  const relatedObject = event.related_object;

  if (
    !relatedObject ||
    relatedObject.type !== "v2.core.account" ||
    typeof relatedObject.id !== "string" ||
    relatedObject.id.trim().length === 0
  ) {
    throw new Error(
      "The Stripe event does not reference a valid Accounts v2 account."
    );
  }

  return relatedObject.id.trim();
}


/*
  Read and validate LIA metadata from the latest Stripe account.

  These metadata fields were written when LIA originally created the
  connected account.
*/
function getOwnerFromMetadata(
  account: Stripe.V2.Core.Account
): { ownerType: "store" | "driver"; ownerId: string } {
  const ownerType =
    account.metadata?.liaOwnerType;

  const apiVersion =
    account.metadata?.liaConnectApiVersion;

  const storeId =
    account.metadata?.liaStoreId?.trim();
  const driverId =
    account.metadata?.liaDriverId?.trim();

  if (ownerType !== "store" && ownerType !== "driver") {
    throw new Error(
      `Stripe account ${account.id} is not a supported LIA recipient account.`
    );
  }

  /*
    Reject legacy Accounts v1 records.

    The Functions mapper is designed specifically for Accounts v2.
  */
  if (apiVersion !== "v2") {
    throw new Error(
      `Stripe account ${account.id} is not marked as Accounts v2.`
    );
  }

  const ownerId = ownerType === "store" ? storeId : driverId;

  if (!ownerId) {
    throw new Error(
      `Stripe account ${account.id} is missing its LIA owner metadata.`
    );
  }

  return { ownerType, ownerId };
}


/*
  Firebase HTTPS endpoint for Stripe Accounts v2 notifications.

  Firebase provides request.rawBody as the untouched request bytes.

  Stripe signature verification must use that raw body. Parsing or
  recreating the JSON first can invalidate the signature because even
  minor whitespace changes affect the signed payload.
*/
export const stripeConnectWebhook = onRequest(
  {
    region: "us-central1",

    /*
      Make both secrets available only to this function.
    */
    secrets: [
      stripeSecretKey,
      stripeConnectWebhookSecret,
    ],

    /*
      Limit automatic horizontal scaling during the MVP.

      This protects Stripe and Firestore from unexpected traffic while
      still allowing concurrent webhook deliveries.
    */
    maxInstances: 10,

    /*
      Stripe expects webhook endpoints to respond quickly.

      The handler only verifies, retrieves one account, and performs
      one Firestore transaction.
    */
    timeoutSeconds: 60,
  },

  async (request, response) => {
    /*
      Stripe webhook endpoints accept POST requests only.
    */
    if (request.method !== "POST") {
      response
        .status(405)
        .set("Allow", "POST")
        .send("Method Not Allowed");

      return;
    }

    const signature =
      request.headers["stripe-signature"];

    if (
      typeof signature !== "string" ||
      signature.trim().length === 0
    ) {
      console.error(
        "Stripe Connect webhook received no Stripe-Signature header."
      );

      response
        .status(400)
        .send("Missing Stripe signature.");

      return;
    }

    /*
      Instantiate Stripe at runtime after Firebase has made the secret
      value available to this function.
    */
    const stripe = new Stripe(
      stripeSecretKey.value()
    );

    let eventNotification:
      StripeV2AccountEventNotification;

    try {
      /*
        Accounts v2 Thin Event destinations must use
        parseEventNotification().

        This method:

        - Verifies the Stripe signature
        - Parses the thin-event payload
        - Returns the typed v2 EventNotification

        constructEvent() is only for classic snapshot webhook events.
        */
        const verifiedNotification =
        stripe.parseEventNotification(
            request.rawBody,
            signature,
            stripeConnectWebhookSecret.value()
        );

        

        eventNotification =
        parseAccountEventNotification(
            verifiedNotification
        );
    } catch (error: unknown) {
      console.error(
        "Stripe Connect webhook signature or payload validation failed:",
        error
      );

      /*
        Return 400 because retrying an invalid signature or malformed
        payload will not fix the request.
      */
      response
        .status(400)
        .send("Invalid Stripe webhook.");

      return;
    }

    /*
      Acknowledge event types this endpoint does not currently use.

      The event destination should be configured with only supported
      types, but defensive handling prevents unnecessary Stripe retries
      if another event is delivered.
    */
    if (
      !SUPPORTED_EVENT_TYPES.has(
        eventNotification.type
      )
    ) {
      console.log(
        "Ignoring unsupported Stripe Connect event:",
        {
          eventId: eventNotification.id,
          eventType: eventNotification.type,
        }
      );

      response.status(200).json({
        received: true,
        processed: false,
      });

      return;
    }

    try {
      const accountId =
        getRelatedAccountId(
          eventNotification
        );

      /*
        Retrieve the latest Account resource.

        We do not rely on the thin event to contain account state.
      */
      const account =
        await stripe.v2.core.accounts.retrieve(
          accountId,
          {
            include: [...ACCOUNT_INCLUDES],
          }
        );

      /*
      Use metadata written during initial account creation to locate
      the correct Firestore owner record.
      */
      const owner = getOwnerFromMetadata(account);

      const mappedAccount =
        mapStripeAccount(
          account,
          owner.ownerType,
          owner.ownerId
        );

      /*
      The persistence service verifies the matching store or driver record,
      connected-account relationship, and Accounts v2 marker.
      */
      if (owner.ownerType === "store") {
        await stripeConnectPersistence.saveStoreStripeStatus(mappedAccount);
      } else {
        await stripeConnectPersistence.saveDriverStripeStatus(mappedAccount);
      }

      console.log(
        "Stripe Connect account synchronized:",
        {
          eventId: eventNotification.id,
          eventType: eventNotification.type,
          accountId: account.id,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          onboardingStatus:
            mappedAccount.onboardingStatus,
          transfersEnabled:
            mappedAccount.transfersEnabled,
        }
      );

      response.status(200).json({
        received: true,
        processed: true,
      });
    } catch (error: unknown) {
      /*
        Expected Firestore relationship errors still return a server
        error so Stripe retries the event.

        This gives us time to repair a temporary or incorrect store
        record and replay the event from Stripe Workbench.
      */
      if (
        isStripeWebhookPersistenceError(error)
      ) {
        console.error(
          "Stripe Connect webhook persistence failed:",
          {
            code: error.code,
            message: error.message,
            eventId: eventNotification.id,
            eventType:
              eventNotification.type,
          }
        );
      } else if (
        error instanceof
        Stripe.errors.StripeError
      ) {
        console.error(
          "Stripe API failed while processing Connect webhook:",
          {
            type: error.type,
            code: error.code,
            message: error.message,
            requestId: error.requestId,
            eventId: eventNotification.id,
          }
        );
      } else {
        console.error(
          "Unexpected Stripe Connect webhook error:",
          {
            error,
            eventId: eventNotification.id,
            eventType:
              eventNotification.type,
          }
        );
      }

      /*
        Return a retryable server error.

        Stripe retries unsuccessful webhook deliveries according to its
        webhook retry policy.
      */
      response
        .status(500)
        .send(
          "Stripe Connect webhook processing failed."
        );
    }
  }
);
