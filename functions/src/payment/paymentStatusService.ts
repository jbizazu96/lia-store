/*
|--------------------------------------------------------------------------
| Payment Status Service
|--------------------------------------------------------------------------
|
| Synchronizes non-successful Stripe PaymentIntent events with the
| payment-pending LIA order and checkout session.
|
| Supported recoverable states:
|
| payment_intent.processing
|   Payment has been submitted but Stripe has not completed it yet.
|
| payment_intent.payment_failed
|   The current payment method failed.
|   The customer may choose another method and retry the same
|   PaymentIntent.
|
| Important:
|
| A normal payment failure does NOT:
|
| - Cancel the order
| - Expire the checkout session
| - Create another order
| - Create another PaymentIntent
| - Notify the store
| - Deduct inventory
|
| The customer remains in checkout and can retry.
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  ValidatedStripePaymentEvent,
} from "./stripe/stripePaymentWebhookTypes";


/*
|--------------------------------------------------------------------------
| Firestore
|--------------------------------------------------------------------------
*/

const db =
  getFirestore("default");


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type PaymentStatusServiceErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER"
  | "PAYMENT_INTENT_MISMATCH"
  | "CHECKOUT_SESSION_NOT_FOUND"
  | "CHECKOUT_SESSION_MISMATCH"
  | "PAYMENT_STATUS_UPDATE_FAILED";


export class PaymentStatusServiceError extends Error {
  readonly code:
    PaymentStatusServiceErrorCode;

  constructor(
    code:
      PaymentStatusServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PaymentStatusServiceError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function requireString(
  value: unknown,
  code:
    PaymentStatusServiceErrorCode,
  message: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new PaymentStatusServiceError(
      code,
      message
    );
  }

  return value.trim();
}


/*
|--------------------------------------------------------------------------
| Validate Relationship
|--------------------------------------------------------------------------
*/

function validatePaymentRelationship(
  orderData:
    FirebaseFirestore.DocumentData,
  paymentEvent:
    ValidatedStripePaymentEvent
): {
  checkoutSessionId: string;
} {
  const storedPaymentIntentId =
    requireString(
      orderData.payment
        ?.paymentIntentId,
      "PAYMENT_INTENT_MISMATCH",
      "The order is missing its Stripe PaymentIntent."
    );

  if (
    storedPaymentIntentId !==
    paymentEvent.paymentIntentId
  ) {
    throw new PaymentStatusServiceError(
      "PAYMENT_INTENT_MISMATCH",
      "The Stripe PaymentIntent does not belong to this order."
    );
  }

  const storedCustomerUid =
    requireString(
      orderData.customer?.uid,
      "INVALID_ORDER",
      "The order customer is invalid."
    );

  if (
    storedCustomerUid !==
    paymentEvent.metadata
      .customerUid
  ) {
    throw new PaymentStatusServiceError(
      "INVALID_ORDER",
      "The Stripe customer does not match the order."
    );
  }

  const storedStoreId =
    requireString(
      orderData.store?.id,
      "INVALID_ORDER",
      "The order store is invalid."
    );

  if (
    storedStoreId !==
    paymentEvent.metadata
      .storeId
  ) {
    throw new PaymentStatusServiceError(
      "INVALID_ORDER",
      "The Stripe store does not match the order."
    );
  }

  const checkoutSessionId =
    requireString(
      orderData.checkoutSessionId,
      "CHECKOUT_SESSION_NOT_FOUND",
      "The order is missing its checkout session."
    );

  return {
    checkoutSessionId,
  };
}


/*
|--------------------------------------------------------------------------
| Update Processing
|--------------------------------------------------------------------------
|
| A processing payment remains hidden from the store.
|
| Stripe may later send:
|
| - payment_intent.succeeded
| - payment_intent.payment_failed
|
*/

async function markProcessing(
  paymentEvent:
    ValidatedStripePaymentEvent
): Promise<void> {
  const orderReference =
    db.collection(
      "orders"
    ).doc(
      paymentEvent.metadata
        .orderId
    );

  try {
    await db.runTransaction(
      async (
        transaction
      ) => {
        const orderSnapshot =
          await transaction.get(
            orderReference
          );

        if (!orderSnapshot.exists) {
          throw new PaymentStatusServiceError(
            "ORDER_NOT_FOUND",
            "The Stripe payment references an order that does not exist."
          );
        }

        const orderData =
          orderSnapshot.data() ?? {};

        /*
          A confirmed order must never move backward to processing.
        */
        if (
          orderData.checkoutStatus ===
            "confirmed" &&
          orderData.payment?.status ===
            "paid"
        ) {
          return;
        }

        const {
          checkoutSessionId,
        } =
          validatePaymentRelationship(
            orderData,
            paymentEvent
          );

        const sessionReference =
          db.collection(
            "checkoutSessions"
          ).doc(
            checkoutSessionId
          );

        const sessionSnapshot =
          await transaction.get(
            sessionReference
          );

        if (!sessionSnapshot.exists) {
          throw new PaymentStatusServiceError(
            "CHECKOUT_SESSION_NOT_FOUND",
            "The related checkout session does not exist."
          );
        }

        const sessionData =
          sessionSnapshot.data() ?? {};

        if (
          sessionData.orderId !==
            orderSnapshot.id ||
          sessionData.paymentIntentId !==
            paymentEvent.paymentIntentId
        ) {
          throw new PaymentStatusServiceError(
            "CHECKOUT_SESSION_MISMATCH",
            "The checkout session does not match the payment."
          );
        }

        transaction.update(
          orderReference,
          {
            checkoutStatus:
              "processing",

            "payment.status":
              "processing",

            "payment.stripeStatus":
              paymentEvent
                .paymentIntentStatus,

            "payment.failureMessage":
              FieldValue.delete(),

            "payment.updatedAt":
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        transaction.update(
          sessionReference,
          {
            status:
              "processing",

            failureMessage:
              FieldValue.delete(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      PaymentStatusServiceError
    ) {
      throw error;
    }

    console.error(
      "Unable to mark Stripe payment processing:",
      {
        eventId:
          paymentEvent.eventId,

        orderId:
          paymentEvent.metadata
            .orderId,

        paymentIntentId:
          paymentEvent
            .paymentIntentId,

        error,
      }
    );

    throw new PaymentStatusServiceError(
      "PAYMENT_STATUS_UPDATE_FAILED",
      "The processing payment status could not be saved."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Update Failed Payment
|--------------------------------------------------------------------------
|
| A declined or failed payment remains recoverable.
|
| The checkout returns to awaiting_payment so the customer can select a
| different payment method and retry the existing PaymentIntent.
|
*/

async function markPaymentFailed(
  paymentEvent:
    ValidatedStripePaymentEvent
): Promise<void> {
  const orderReference =
    db.collection(
      "orders"
    ).doc(
      paymentEvent.metadata
        .orderId
    );

  const failureMessage =
    paymentEvent.failureMessage ||
    "Your payment method could not be accepted. Please choose another payment method and try again.";

  try {
    await db.runTransaction(
      async (
        transaction
      ) => {
        const orderSnapshot =
          await transaction.get(
            orderReference
          );

        if (!orderSnapshot.exists) {
          throw new PaymentStatusServiceError(
            "ORDER_NOT_FOUND",
            "The Stripe payment references an order that does not exist."
          );
        }

        const orderData =
          orderSnapshot.data() ?? {};

        /*
          A confirmed paid order must never move backward to failed.
        */
        if (
          orderData.checkoutStatus ===
            "confirmed" &&
          orderData.payment?.status ===
            "paid"
        ) {
          return;
        }

        const {
          checkoutSessionId,
        } =
          validatePaymentRelationship(
            orderData,
            paymentEvent
          );

        const sessionReference =
          db.collection(
            "checkoutSessions"
          ).doc(
            checkoutSessionId
          );

        const sessionSnapshot =
          await transaction.get(
            sessionReference
          );

        if (!sessionSnapshot.exists) {
          throw new PaymentStatusServiceError(
            "CHECKOUT_SESSION_NOT_FOUND",
            "The related checkout session does not exist."
          );
        }

        const sessionData =
          sessionSnapshot.data() ?? {};

        if (
          sessionData.orderId !==
            orderSnapshot.id ||
          sessionData.paymentIntentId !==
            paymentEvent.paymentIntentId
        ) {
          throw new PaymentStatusServiceError(
            "CHECKOUT_SESSION_MISMATCH",
            "The checkout session does not match the failed payment."
          );
        }

        /*
          Keep checkout reusable.

          payment.status records that the most recent attempt failed,
          while checkoutStatus remains awaiting_payment so another method
          can be submitted.
        */
        transaction.update(
          orderReference,
          {
            checkoutStatus:
              "awaiting_payment",

            "payment.status":
              "failed",

            "payment.stripeStatus":
              paymentEvent
                .paymentIntentStatus,

            "payment.failureMessage":
              failureMessage.slice(
                0,
                500
              ),

            "payment.failedAt":
              FieldValue.serverTimestamp(),

            "payment.updatedAt":
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        transaction.update(
          sessionReference,
          {
            status:
              "awaiting_payment",

            failureMessage:
              failureMessage.slice(
                0,
                500
              ),

            lastPaymentFailedAt:
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      PaymentStatusServiceError
    ) {
      throw error;
    }

    console.error(
      "Unable to mark Stripe payment failed:",
      {
        eventId:
          paymentEvent.eventId,

        orderId:
          paymentEvent.metadata
            .orderId,

        paymentIntentId:
          paymentEvent
            .paymentIntentId,

        error,
      }
    );

    throw new PaymentStatusServiceError(
      "PAYMENT_STATUS_UPDATE_FAILED",
      "The failed payment status could not be saved."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isPaymentStatusServiceError(
  error: unknown
): error is PaymentStatusServiceError {
  return (
    error instanceof
    PaymentStatusServiceError
  );
}


/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const paymentStatusService = {
  markProcessing,

  markPaymentFailed,
};