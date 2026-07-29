"use client";

/*
|--------------------------------------------------------------------------
| Stripe Checkout
|--------------------------------------------------------------------------
|
| Initializes Stripe Elements for one prepared LIA payment.
|
| Responsibilities:
|
| - Receive the PaymentIntent client secret
| - Receive the Customer Session client secret
| - Configure Stripe Elements
| - Render CheckoutPaymentForm
|
| The Customer Session enables:
|
| - Saved payment methods
| - Saving a new payment method with consent
| - Removing saved payment methods
*/

import {
  Elements,
} from "@stripe/react-stripe-js";

import {
  CheckoutPaymentForm,
} from "@/components/checkout/CheckoutPaymentForm";

import {
  stripePromise,
} from "@/lib/stripe/stripeClient";


/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface StripeCheckoutProps {
  orderId: string;

  clientSecret: string;

  customerSessionClientSecret: string;

  totalAmount: number;

  customerEmail: string;

  customerPhone: string;

  onPaymentConfirmed: (
    orderId: string
  ) => void;

  onPaymentError: (
    message: string
  ) => void;
}


/*
|--------------------------------------------------------------------------
| Component
|--------------------------------------------------------------------------
*/

export function StripeCheckout({
  orderId,
  clientSecret,
  customerSessionClientSecret,
  totalAmount,
  customerEmail,
  customerPhone,
  onPaymentConfirmed,
  onPaymentError,
}: StripeCheckoutProps) {
  /*
    The two secrets serve different purposes:

    clientSecret
      Confirms this order's PaymentIntent.

    customerSessionClientSecret
      Gives Stripe Elements temporary access to the authenticated
      customer's saved payment methods.
  */
  const options = {
    clientSecret,

    customerSessionClientSecret,

    /*
      Match LIA's current visual language.

      These appearance values affect only Stripe-controlled fields.
    */
    appearance: {
      theme:
        "stripe" as const,

      variables: {
        colorPrimary:
          "#f97316",

        colorText:
          "#1f2937",

        colorDanger:
          "#dc2626",

        borderRadius:
          "12px",

        fontFamily:
          "Arial, sans-serif",
      },
    },
  };

  return (
    <Elements
      stripe={
        stripePromise
      }
      options={
        options
      }
    >
      <CheckoutPaymentForm
        orderId={
          orderId
        }
        totalAmount={
          totalAmount
        }
        customerEmail={
          customerEmail
        }
        customerPhone={
          customerPhone
        }
        onPaymentConfirmed={
          onPaymentConfirmed
        }
        onPaymentError={
          onPaymentError
        }
      />
    </Elements>
  );
}
