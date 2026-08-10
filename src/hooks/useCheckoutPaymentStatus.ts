"use client";

/*
|--------------------------------------------------------------------------
| useCheckoutPaymentStatus Hook
|--------------------------------------------------------------------------
|
| Listens to one customer-owned checkout session in Firestore and exposes its
| latest payment lifecycle state.
|
| The Stripe payment webhook updates the checkout session after receiving:
|
| - payment_intent.processing
| - payment_intent.payment_failed
| - payment_intent.succeeded
|
| This realtime listener allows checkout to react immediately:
|
| processing
|   → Show that Stripe is processing the payment.
|
| failed
|   → Show the failure warning and keep the Payment Element available
|     so the customer can select another payment method and retry.
|
| paid / confirmed
|   → Show success and clear the cart.
|
| Important:
|
| This hook does NOT:
|
| - Trust browser-side Stripe status as final
| - Mark orders paid
| - Deduct inventory
| - Notify the store
| - Create another PaymentIntent
|
| The session contains only checkout lifecycle data. The full order remains
| unreadable to the customer until the webhook marks it paid and confirmed.
*/

import {
  useEffect,
  useState,
} from "react";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";


/*
|--------------------------------------------------------------------------
| Checkout Status
|--------------------------------------------------------------------------
*/

export type CheckoutPaymentStatus =
  | "idle"
  | "awaiting_payment"
  | "processing"
  | "confirmed"
  | "payment_failed"
  | "expired"
  | "cancelled";


/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCheckoutPaymentStatusResult {
  /*
    Latest checkout lifecycle status from Firestore.
  */
  checkoutStatus:
    CheckoutPaymentStatus;

  /*
    Latest payment status stored by the Stripe webhook.
  */
  paymentStatus:
    string | null;

  /*
    Latest Stripe PaymentIntent status.
  */
  stripeStatus:
    string | null;

  /*
    Safe customer-facing failure message.

    Example:

    "Your card was declined."
  */
  failureMessage:
    string | null;

  /*
    True while the first order snapshot is loading.
  */
  loading: boolean;

  /*
    Firestore listener error.
  */
  error:
    string | null;

  /*
    Convenient state flags for the checkout page.
  */
  isAwaitingPayment:
    boolean;

  isProcessing:
    boolean;

  isConfirmed:
    boolean;

  hasPaymentFailed:
    boolean;

  isTerminal:
    boolean;
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeCheckoutStatus(
  value: unknown
): CheckoutPaymentStatus {
  switch (value) {
    case "awaiting_payment":
    case "processing":
    case "confirmed":
    case "payment_failed":
    case "expired":
    case "cancelled":
      return value;

    default:
      return "idle";
  }
}


function normalizeOptionalString(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized || null;
}


/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCheckoutPaymentStatus(
  checkoutSessionId:
    string | null
): UseCheckoutPaymentStatusResult {
  const [
    checkoutStatus,
    setCheckoutStatus,
  ] = useState<CheckoutPaymentStatus>(
    "idle"
  );

  const [
    paymentStatus,
    setPaymentStatus,
  ] = useState<string | null>(
    null
  );

  const [
    stripeStatus,
    setStripeStatus,
  ] = useState<string | null>(
    null
  );

  const [
    failureMessage,
    setFailureMessage,
  ] = useState<string | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );


  /*
  |--------------------------------------------------------------------------
  | Realtime Checkout-Session Listener
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    /*
      No payment has been prepared yet.
    */
    if (
      !checkoutSessionId?.trim()
    ) {
      queueMicrotask(() => {
        setCheckoutStatus("idle");
        setPaymentStatus(null);
        setStripeStatus(null);
        setFailureMessage(null);
        setLoading(false);
        setError(null);
      });

      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    const checkoutSessionReference =
      doc(
        db,
        "checkoutSessions",
        checkoutSessionId.trim()
      );

    const unsubscribe =
      onSnapshot(
        checkoutSessionReference,

        (
          snapshot
        ) => {
          if (
            !snapshot.exists()
          ) {
            setCheckoutStatus(
              "idle"
            );

            setPaymentStatus(
              null
            );

            setStripeStatus(
              null
            );

            setFailureMessage(
              null
            );

            setError(
              "The checkout session could not be found."
            );

            setLoading(
              false
            );

            return;
          }

          const data =
            snapshot.data();

          const nextCheckoutStatus =
            normalizeCheckoutStatus(
              data.status
            );

          /*
           * Checkout sessions intentionally do not expose the full order
           * payment map. Derive the customer-facing payment state from the
           * webhook-controlled session status instead.
           */
          const nextPaymentStatus =
            nextCheckoutStatus === "confirmed"
              ? "paid"
              : nextCheckoutStatus === "processing"
                ? "processing"
                : nextCheckoutStatus === "awaiting_payment" &&
                    normalizeOptionalString(
                      data.failureMessage
                    )
                  ? "failed"
                  : "pending";

          /*
           * Stripe's detailed PaymentIntent status is deliberately retained
           * server-side with the order. Checkout only needs the normalized
           * LIA session state above.
           */
          const nextStripeStatus =
            null;

          const nextFailureMessage =
            normalizeOptionalString(
              data.failureMessage
            );

          setCheckoutStatus(
            nextCheckoutStatus
          );

          setPaymentStatus(
            nextPaymentStatus
          );

          setStripeStatus(
            nextStripeStatus
          );

          /*
            Clear an older declined-card message after payment returns to
            processing or succeeds.
          */
          setFailureMessage(
            nextCheckoutStatus ===
              "processing" ||
            nextCheckoutStatus ===
              "confirmed"
              ? null
              : nextFailureMessage
          );

          setError(
            null
          );

          setLoading(
            false
          );
        },

        (
          listenerError
        ) => {
          console.error(
            "Unable to listen to checkout session status:",
            listenerError
          );

          setError(
            "The latest payment status could not be loaded."
          );

          setLoading(
            false
          );
        }
      );

    return unsubscribe;
  }, [
    checkoutSessionId,
  ]);


  /*
  |--------------------------------------------------------------------------
  | Derived State
  |--------------------------------------------------------------------------
  */

  const isAwaitingPayment =
    checkoutStatus ===
      "awaiting_payment";

  const isProcessing =
    checkoutStatus ===
      "processing" ||
    paymentStatus ===
      "processing";

  const isConfirmed =
    checkoutStatus ===
      "confirmed" &&
    paymentStatus ===
      "paid";

  /*
    Ordinary failed card attempts remain recoverable.

    The webhook keeps checkoutStatus at awaiting_payment while storing
    payment.status as failed.
  */
  const hasPaymentFailed =
    paymentStatus ===
      "failed" &&
    checkoutStatus ===
      "awaiting_payment";

  const isTerminal =
    checkoutStatus ===
      "confirmed" ||
    checkoutStatus ===
      "expired" ||
    checkoutStatus ===
      "cancelled";


  return {
    checkoutStatus,

    paymentStatus,

    stripeStatus,

    failureMessage,

    loading,

    error,

    isAwaitingPayment,

    isProcessing,

    isConfirmed,

    hasPaymentFailed,

    isTerminal,
  };
}
