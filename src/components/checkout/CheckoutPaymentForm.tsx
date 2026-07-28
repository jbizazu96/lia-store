"use client";

/*
|--------------------------------------------------------------------------
| Checkout Payment Form
|--------------------------------------------------------------------------
|
| Renders Stripe's Payment Element and confirms one prepared
| PaymentIntent.
|
| This component must be rendered inside:
|
| <Elements stripe={stripePromise} options={{ clientSecret }}>
|   <CheckoutPaymentForm ... />
| </Elements>
|
| Security:
|
| Raw card and payment-method details are collected by Stripe Elements.
| They never pass through LIA's React state, Next.js server, or Firebase
| Functions.
*/

import {
  useState,
} from "react";

import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import {
  CreditCard,
  LockKeyhole,
} from "lucide-react";


/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface CheckoutPaymentFormProps {
  /*
    Firestore order ID created during payment preparation.
  */
  orderId: string;

  /*
    Trusted backend total in integer cents.
  */
  totalAmount: number;

  /*
    Called when Stripe immediately confirms the payment.

    Important:
    The future payment webhook remains the authoritative source for
    marking the order paid and starting fulfillment.
  */
  onPaymentConfirmed: (
    orderId: string
  ) => void;

  /*
    Called when confirmation fails or payment remains incomplete.
  */
  onPaymentError: (
    message: string
  ) => void;
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/*
  Format integer cents using the US dollar locale.

  Example:

  12774
      ↓
  $127.74
*/
function formatCurrency(
  amount: number
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  ).format(
    amount / 100
  );
}


/*
  Convert Stripe's customer-facing payment errors into a safe message.
*/
function getPaymentErrorMessage(
  message: string | undefined
): string {
  return (
    message?.trim() ||
    "Your payment could not be completed. Please review your payment details and try again."
  );
}


/*
|--------------------------------------------------------------------------
| Component
|--------------------------------------------------------------------------
*/

export function CheckoutPaymentForm({
  orderId,
  totalAmount,
  onPaymentConfirmed,
  onPaymentError,
}: CheckoutPaymentFormProps) {
  const stripe =
    useStripe();

  const elements =
    useElements();

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    paymentElementReady,
    setPaymentElementReady,
  ] = useState(false);

  const [
    localError,
    setLocalError,
  ] = useState<string | null>(
    null
  );


  /*
  |--------------------------------------------------------------------------
  | Confirm Payment
  |--------------------------------------------------------------------------
  */

  const handleSubmit =
    async (
      event:
        React.FormEvent<HTMLFormElement>
    ) => {
      event.preventDefault();

      if (
        !stripe ||
        !elements
      ) {
        return;
      }

      setIsSubmitting(true);
      setLocalError(null);

      try {
        /*
          Validate the Payment Element before confirming.

          This surfaces incomplete fields without sending an avoidable
          confirmation request to Stripe.
        */
        const submitResult =
          await elements.submit();

        if (submitResult.error) {
          const message =
            getPaymentErrorMessage(
              submitResult
                .error
                .message
            );

          setLocalError(message);
          onPaymentError(message);

          return;
        }

        /*
          Redirect only when the selected payment method requires an
          external authorization flow.

          Normal card payments can complete without leaving checkout.
        */
        const confirmationResult =
          await stripe.confirmPayment({
            elements,

            confirmParams: {
              /*
                Stripe returns redirect-based payment methods here after
                authorization.

                The future payment-result page will inspect the
                PaymentIntent and wait for the webhook-confirmed order.
              */
              return_url:
                `${window.location.origin}/checkout/payment-result?orderId=${encodeURIComponent(
                  orderId
                )}`,
            },

            redirect:
              "if_required",
          });

        if (
          confirmationResult.error
        ) {
          const message =
            getPaymentErrorMessage(
              confirmationResult
                .error
                .message
            );

          setLocalError(message);
          onPaymentError(message);

          return;
        }

        const paymentIntent =
          confirmationResult
            .paymentIntent;

        if (!paymentIntent) {
          const message =
            "Stripe did not return the payment status. Please check your orders before trying again.";

          setLocalError(message);
          onPaymentError(message);

          return;
        }

        /*
          The browser status is useful for immediate user experience,
          but the Stripe webhook will remain the final authority.

          succeeded:
            Payment completed immediately.

          processing:
            Payment is still being processed asynchronously.
        */
        if (
          paymentIntent.status ===
            "succeeded" ||
          paymentIntent.status ===
            "processing"
        ) {
          onPaymentConfirmed(
            orderId
          );

          return;
        }

        const message =
          paymentIntent.status ===
            "requires_payment_method"
            ? "Your payment method was not accepted. Please choose another payment method."
            : "Your payment is not complete yet. Please review the payment details and try again.";

        setLocalError(message);
        onPaymentError(message);
      } catch (
        error: unknown
      ) {
        console.error(
          "Stripe payment confirmation failed:",
          error
        );

        const message =
          "Your payment could not be completed. Please try again.";

        setLocalError(message);
        onPaymentError(message);
      } finally {
        setIsSubmitting(false);
      }
    };


  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-4"
    >
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
            <CreditCard className="h-5 w-5 text-orange-600" />
          </div>

          <div>
            <h3 className="font-semibold text-gray-800">
              Payment method
            </h3>

            <p className="text-xs text-gray-500">
              Enter your payment details securely through Stripe.
            </p>
          </div>
        </div>

        {!paymentElementReady && (
          <div className="flex min-h-24 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        )}

        <div
          className={
            paymentElementReady
              ? "block"
              : "hidden"
          }
        >
          <PaymentElement
            onReady={() =>
              setPaymentElementReady(
                true
              )
            }
            options={{
              layout: {
                type:
                  "accordion",

                defaultCollapsed:
                  false,

                radios:
                  "always",

                spacedAccordionItems:
                  false,
              },
            }}
          />
        </div>
      </div>

      {localError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">
            {localError}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={
          !stripe ||
          !elements ||
          !paymentElementReady ||
          isSubmitting
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3.5 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />

            Processing payment...
          </>
        ) : (
          <>
            <LockKeyhole className="h-5 w-5" />

            Pay{" "}
            {formatCurrency(
              totalAmount
            )}
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <LockKeyhole className="h-3.5 w-3.5" />

        <span>
          Payment details are securely processed by Stripe
        </span>
      </div>
    </form>
  );
}