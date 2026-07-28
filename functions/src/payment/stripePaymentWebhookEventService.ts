/*
|--------------------------------------------------------------------------
| Stripe Payment Webhook Event Service
|--------------------------------------------------------------------------
|
| Protects payment webhook processing from duplicate Stripe deliveries.
|
| Stripe can retry the same event multiple times.
|
| This service stores one record at:
|
| stripeWebhookEvents/{stripeEventId}
|
| Lifecycle:
|
| New event
|   → processing
|   → processed
|
| Failed event
|   → failed
|   → may be claimed again on a later Stripe retry
|
| Concurrent duplicate
|   → already_processing
|
| Completed duplicate
|   → already_processed
*/

import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  StripeWebhookEventClaimResult,
  SupportedStripePaymentEventType,
} from "./stripePaymentWebhookTypes";


const db =
  getFirestore("default");


/*
  A processing claim older than five minutes is considered abandoned.

  This allows a later Stripe retry to recover when a function instance
  crashed after claiming the event but before completing it.
*/
const PROCESSING_LOCK_TIMEOUT_MS =
  5 * 60 * 1000;


/*
|--------------------------------------------------------------------------
| Inputs
|--------------------------------------------------------------------------
*/

export interface ClaimStripePaymentEventInput {
  eventId: string;

  eventType:
    SupportedStripePaymentEventType;

  paymentIntentId: string;

  orderId: string;

  livemode: boolean;
}


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type StripePaymentWebhookEventServiceErrorCode =
  | "INVALID_EVENT_ID"
  | "INVALID_PAYMENT_INTENT_ID"
  | "INVALID_ORDER_ID"
  | "EVENT_ID_CONFLICT"
  | "EVENT_CLAIM_FAILED"
  | "EVENT_UPDATE_FAILED";


export class StripePaymentWebhookEventServiceError extends Error {
  readonly code:
    StripePaymentWebhookEventServiceErrorCode;

  constructor(
    code:
      StripePaymentWebhookEventServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "StripePaymentWebhookEventServiceError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeRequiredIdentifier(
  value: string,
  code:
    StripePaymentWebhookEventServiceErrorCode,
  message: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new StripePaymentWebhookEventServiceError(
      code,
      message
    );
  }

  return normalized;
}


function toDate(
  value: unknown
): Date | null {
  if (
    value instanceof
    Timestamp
  ) {
    return value.toDate();
  }

  if (
    value instanceof Date
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const parsed =
      new Date(value);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed;
    }
  }

  return null;
}


function isProcessingLockExpired(
  lastReceivedAt: unknown
): boolean {
  const lastReceivedDate =
    toDate(
      lastReceivedAt
    );

  if (!lastReceivedDate) {
    return true;
  }

  return (
    Date.now() -
      lastReceivedDate.getTime() >=
    PROCESSING_LOCK_TIMEOUT_MS
  );
}


/*
|--------------------------------------------------------------------------
| Claim Event
|--------------------------------------------------------------------------
*/

/*
  Claim a Stripe event before performing any payment side effects.

  This transaction guarantees that concurrent deliveries of the same
  event cannot both activate the order or deduct inventory.
*/
async function claimEvent(
  input:
    ClaimStripePaymentEventInput
): Promise<
  StripeWebhookEventClaimResult
> {
  const eventId =
    normalizeRequiredIdentifier(
      input.eventId,
      "INVALID_EVENT_ID",
      "A valid Stripe event ID is required."
    );

  const paymentIntentId =
    normalizeRequiredIdentifier(
      input.paymentIntentId,
      "INVALID_PAYMENT_INTENT_ID",
      "A valid Stripe PaymentIntent ID is required."
    );

  const orderId =
    normalizeRequiredIdentifier(
      input.orderId,
      "INVALID_ORDER_ID",
      "A valid LIA order ID is required."
    );

  if (
    !eventId.startsWith(
      "evt_"
    )
  ) {
    throw new StripePaymentWebhookEventServiceError(
      "INVALID_EVENT_ID",
      "The Stripe event ID is invalid."
    );
  }

  if (
    !paymentIntentId.startsWith(
      "pi_"
    )
  ) {
    throw new StripePaymentWebhookEventServiceError(
      "INVALID_PAYMENT_INTENT_ID",
      "The Stripe PaymentIntent ID is invalid."
    );
  }

  const eventReference =
    db.collection(
      "stripeWebhookEvents"
    ).doc(
      eventId
    );

  try {
    return await db.runTransaction(
      async (
        transaction
      ): Promise<
        StripeWebhookEventClaimResult
      > => {
        const snapshot =
          await transaction.get(
            eventReference
          );

        const now =
          Timestamp.now();

        /*
        |--------------------------------------------------------------------------
        | First Delivery
        |--------------------------------------------------------------------------
        */

        if (!snapshot.exists) {
          transaction.create(
            eventReference,
            {
              type:
                input.eventType,

              paymentIntentId,

              orderId,

              livemode:
                input.livemode,

              status:
                "processing",

              deliveryCount:
                1,

              firstReceivedAt:
                now,

              lastReceivedAt:
                now,

              processingStartedAt:
                now,

              processedAt:
                null,

              failedAt:
                null,

              failureReason:
                null,
            }
          );

          return {
            type:
              "process",

            eventId,
          };
        }

        const data =
          snapshot.data() ?? {};

        /*
          An existing event ID must always reference the same Stripe and
          LIA resources.

          A conflict indicates corrupted data or an environment mistake.
        */
        if (
          data.type !==
            input.eventType ||
          data.paymentIntentId !==
            paymentIntentId ||
          data.orderId !==
            orderId ||
          data.livemode !==
            input.livemode
        ) {
          throw new StripePaymentWebhookEventServiceError(
            "EVENT_ID_CONFLICT",
            "The Stripe event ID conflicts with an existing webhook record."
          );
        }

        const deliveryCount =
          Number.isSafeInteger(
            data.deliveryCount
          )
            ? data.deliveryCount + 1
            : 2;

        /*
        |--------------------------------------------------------------------------
        | Already Completed
        |--------------------------------------------------------------------------
        */

        if (
          data.status ===
          "processed"
        ) {
          transaction.update(
            eventReference,
            {
              deliveryCount,

              lastReceivedAt:
                now,
            }
          );

          return {
            type:
              "already_processed",

            eventId,
          };
        }

        /*
        |--------------------------------------------------------------------------
        | Concurrent Delivery
        |--------------------------------------------------------------------------
        */

        if (
          data.status ===
            "processing" &&
          !isProcessingLockExpired(
            data.processingStartedAt ??
            data.lastReceivedAt
          )
        ) {
          transaction.update(
            eventReference,
            {
              deliveryCount,

              lastReceivedAt:
                now,
            }
          );

          return {
            type:
              "already_processing",

            eventId,
          };
        }

        /*
        |--------------------------------------------------------------------------
        | Retry Failed Or Abandoned Processing
        |--------------------------------------------------------------------------
        |
        | Failed events and stale processing locks may be claimed again.
        |
        */

        transaction.update(
          eventReference,
          {
            status:
              "processing",

            deliveryCount,

            lastReceivedAt:
              now,

            processingStartedAt:
              now,

            processedAt:
              null,

            failedAt:
              null,

            failureReason:
              null,
          }
        );

        return {
          type:
            "process",

          eventId,
        };
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      StripePaymentWebhookEventServiceError
    ) {
      throw error;
    }

    console.error(
      "Stripe payment webhook event claim failed:",
      {
        eventId,
        paymentIntentId,
        orderId,
        error,
      }
    );

    throw new StripePaymentWebhookEventServiceError(
      "EVENT_CLAIM_FAILED",
      "The Stripe webhook event could not be claimed."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Mark Processed
|--------------------------------------------------------------------------
*/

async function markProcessed(
  eventId: string
): Promise<void> {
  const normalizedEventId =
    normalizeRequiredIdentifier(
      eventId,
      "INVALID_EVENT_ID",
      "A valid Stripe event ID is required."
    );

  try {
    await db
      .collection(
        "stripeWebhookEvents"
      )
      .doc(
        normalizedEventId
      )
      .update({
        status:
          "processed",

        processedAt:
          FieldValue
            .serverTimestamp(),

        lastReceivedAt:
          FieldValue
            .serverTimestamp(),

        failureReason:
          null,

        failedAt:
          null,
      });
  } catch (
    error: unknown
  ) {
    console.error(
      "Unable to mark Stripe webhook event processed:",
      {
        eventId:
          normalizedEventId,
        error,
      }
    );

    throw new StripePaymentWebhookEventServiceError(
      "EVENT_UPDATE_FAILED",
      "The Stripe webhook event could not be completed."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Mark Failed
|--------------------------------------------------------------------------
*/

async function markFailed(
  eventId: string,
  reason: string
): Promise<void> {
  const normalizedEventId =
    eventId.trim();

  if (!normalizedEventId) {
    return;
  }

  try {
    await db
      .collection(
        "stripeWebhookEvents"
      )
      .doc(
        normalizedEventId
      )
      .update({
        status:
          "failed",

        failedAt:
          FieldValue
            .serverTimestamp(),

        lastReceivedAt:
          FieldValue
            .serverTimestamp(),

        failureReason:
          reason
            .trim()
            .slice(
              0,
              500
            ),
      });
  } catch (
    error: unknown
  ) {
    console.error(
      "Unable to mark Stripe webhook event failed:",
      {
        eventId:
          normalizedEventId,
        error,
      }
    );
  }
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isStripePaymentWebhookEventServiceError(
  error: unknown
): error is StripePaymentWebhookEventServiceError {
  return (
    error instanceof
    StripePaymentWebhookEventServiceError
  );
}


/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const stripePaymentWebhookEventService = {
  claimEvent,

  markProcessed,

  markFailed,
};