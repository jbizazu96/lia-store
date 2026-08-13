"use client";

/*
|--------------------------------------------------------------------------
| usePrepareCheckoutPayment Hook
|--------------------------------------------------------------------------
|
| Prepares one customer Stripe payment from the checkout UI.
|
| Responsibilities:
|
| - Call the secure checkout payment client service
| - Store the prepared PaymentIntent client secret
| - Store the Customer Session client secret
| - Store the trusted backend pricing
| - Expose loading and error state
| - Allow checkout to reset a prepared payment
|
| This hook does NOT:
|
| - Calculate trusted prices
| - Create the PaymentIntent directly
| - Render Stripe Elements
| - Confirm payment
| - Mark the order paid
| - Clear the cart
|
| Those responsibilities belong to Firebase Functions, Stripe Elements,
| the Stripe payment webhook, and the checkout page.
*/

import {
  useState,
} from "react";

import {
  checkoutPaymentClientService,
} from "@/services/payment/checkoutPaymentClientService";

import type {
  PrepareCustomerPaymentInput,
} from "@/services/payment/checkoutPaymentClientService";

import type {
  PrepareCheckoutPaymentResult,
} from "@/types/checkoutPayment";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";


/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UsePrepareCheckoutPaymentResult {
  /*
    True while Firebase Functions and Stripe are preparing checkout.
  */
  loading: boolean;

  /*
    Safe customer-facing error.
  */
  error: string | null;

  /*
    Complete prepared checkout result.

    Null before payment preparation or after reset.
  */
  preparedPayment:
    PrepareCheckoutPaymentResult | null;

  /*
    Prepare the trusted backend order and Stripe PaymentIntent.

    Returns the result when successful and null when preparation fails.
  */
  preparePayment: (
    input: PrepareCustomerPaymentInput
  ) => Promise<
    PrepareCheckoutPaymentResult | null
  >;

  /*
    Remove the current error.
  */
  clearError: () => void;

  /*
    Remove the prepared payment and return checkout to the review state.

    Important:
    This does not delete the pending Firestore order or cancel its
    PaymentIntent. Server-side cleanup will be added separately.
  */
  resetPreparedPayment: () => void;
}


/*
|--------------------------------------------------------------------------
| Error Message
|--------------------------------------------------------------------------
*/

/*
  Convert client-service and Firebase callable failures into a safe
  checkout message.

  Firebase callable errors often expose a message property, but this
  function never assumes the thrown value is an Error.
*/
function getPaymentPreparationErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return (
    "The payment could not be prepared. " +
    "Please review your checkout information and try again."
  );
}


/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function usePrepareCheckoutPayment():
UsePrepareCheckoutPaymentResult {
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

  const [
    preparedPayment,
    setPreparedPayment,
  ] = useState<
    PrepareCheckoutPaymentResult | null
  >(null);


  /*
  |--------------------------------------------------------------------------
  | Prepare Payment
  |--------------------------------------------------------------------------
  */

  const preparePayment =
    async (
      input:
        PrepareCustomerPaymentInput
    ): Promise<
      PrepareCheckoutPaymentResult | null
    > => {
      /*
        Prevent duplicate preparation requests from repeated button
        clicks while the first request is still running.
      */
      if (loading) {
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        const result =
          await checkoutPaymentClientService
            .prepareCheckoutPayment(
              input
            );

        setPreparedPayment(
          result
        );

        return result;
      } catch (
        preparationError: unknown
      ) {
        console.error(
          "Unable to prepare Stripe checkout:",
          preparationError
        );
        reportClientIssue({
          area: "checkout.payment_preparation",
          message: "Unable to prepare Stripe checkout",
          error: preparationError,
          metadata: {storeId: input.storeId},
        });

        const message =
          getPaymentPreparationErrorMessage(
            preparationError
          );

        setError(
          message
        );

        setPreparedPayment(
          null
        );

        return null;
      } finally {
        setLoading(false);
      }
    };


  /*
  |--------------------------------------------------------------------------
  | Clear Error
  |--------------------------------------------------------------------------
  */

  const clearError =
    () => {
      setError(null);
    };


  /*
  |--------------------------------------------------------------------------
  | Reset Prepared Payment
  |--------------------------------------------------------------------------
  */

  const resetPreparedPayment =
    () => {
      setPreparedPayment(
        null
      );

      setError(
        null
      );
    };


  return {
    loading,

    error,

    preparedPayment,

    preparePayment,

    clearError,

    resetPreparedPayment,
  };
}
