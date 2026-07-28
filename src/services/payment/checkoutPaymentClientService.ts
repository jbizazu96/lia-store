/*
|--------------------------------------------------------------------------
| Checkout Payment Client Service
|--------------------------------------------------------------------------
|
| Calls the authenticated Firebase Function that prepares a Stripe
| customer payment.
|
| Responsibilities:
|
| - Send only customer-selectable checkout values
| - Convert the selected tip from dollars to integer cents
| - Call prepareCheckoutPayment
| - Validate the callable response
| - Return the Stripe clientSecret and trusted backend pricing
|
| This service does NOT:
|
| - Calculate trusted product prices
| - Calculate the trusted delivery fee
| - Create a PaymentIntent directly
| - Confirm the payment
| - Mark the order paid
|
| Those responsibilities remain on Firebase Functions and Stripe.
*/

import {
  getFunctions,
  httpsCallable,
} from "firebase/functions";

import type {
  CheckoutPaymentAddressInput,
  CheckoutPaymentItemInput,
  PrepareCheckoutPaymentInput,
  PrepareCheckoutPaymentResult,
} from "@/types/checkoutPayment";


/*
  Use the same Firebase Functions region as the deployed callable.
*/
const functions =
  getFunctions(
    undefined,
    "us-central1"
  );


/*
  Input accepted by the browser service.

  Tip remains dollar-valued here because the current checkout UI stores
  and displays money as dollars.
*/
export interface PrepareCustomerPaymentInput {
  storeId: string;

  contactName: string;

  contactPhone: string;

  items: CheckoutPaymentItemInput[];

  deliveryAddress:
    CheckoutPaymentAddressInput;

  deliveryInstructions?: string;

  /*
    Example:

    5.00 = $5.00
  */
  tip: number;
}


/*
  Raw callable response returned by Firebase Functions.
*/
interface PrepareCheckoutPaymentCallableResponse {
  success: true;

  orderId: string;

  orderNumber: string;

  paymentIntentId: string;

  clientSecret: string;

    /*
      Customer Session client secret used by Stripe Elements to display,
      save, and remove the authenticated customer's saved payment methods.
    */
    customerSessionClientSecret: string;

    pricing: {
    currency: "usd";

    subtotalAmount: number;

    deliveryFeeAmount: number;

    serviceFeeAmount: number;

    taxAmount: number;

    tipAmount: number;

    totalAmount: number;
  };
}


/*
  Convert a dollar-valued customer tip into integer cents.

  Example:

  5.25
      ↓
  525
*/
function dollarsToCents(
  amount: number
): number {
  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error(
      "The selected tip amount is invalid."
    );
  }

  const cents =
    Math.round(
      amount * 100
    );

  if (
    !Number.isSafeInteger(cents)
  ) {
    throw new Error(
      "The selected tip amount is invalid."
    );
  }

  return cents;
}


/*
  Validate that the callable returned the values required by Stripe
  Elements.
*/
function validateResponse(
  value:
    PrepareCheckoutPaymentCallableResponse
): void {
  if (
      value.success !== true ||
      !value.orderId?.trim() ||
      !value.orderNumber?.trim() ||
      !value.paymentIntentId?.trim() ||
      !value.clientSecret?.trim() ||
      !value.customerSessionClientSecret?.trim()
    ) {
    throw new Error(
      "The payment could not be prepared."
    );
  }

  if (
    !Number.isSafeInteger(
      value.pricing.totalAmount
    ) ||
    value.pricing.totalAmount <= 0
  ) {
    throw new Error(
      "The prepared payment amount is invalid."
    );
  }
}


/*
  Prepare one authenticated Stripe payment.
*/
async function prepareCheckoutPayment(
  input: PrepareCustomerPaymentInput
): Promise<
  PrepareCheckoutPaymentResult
  > {
  const request:
  PrepareCheckoutPaymentInput = {
      storeId:
        input.storeId,

      contactName:
        input.contactName,

      contactPhone:
        input.contactPhone,

      items:
        input.items,

      deliveryAddress:
        input.deliveryAddress,

      deliveryInstructions:
        input.deliveryInstructions,

      tipAmountCents:
        dollarsToCents(
          input.tip
        ),
    };

  const callable =
    httpsCallable<
      typeof request,
      PrepareCheckoutPaymentCallableResponse
    >(
      functions,
      "prepareCheckoutPayment"
    );

  const response =
    await callable(
      request
    );

  validateResponse(
    response.data
  );

  return {
    orderId:
      response.data.orderId,

    orderNumber:
      response.data.orderNumber,

    paymentIntentId:
      response.data
        .paymentIntentId,

    clientSecret:
    response.data.clientSecret,

     customerSessionClientSecret:
        response.data
          .customerSessionClientSecret,

      pricing: {
      currency:
        response.data
          .pricing.currency,

      subtotalAmount:
        response.data
          .pricing
          .subtotalAmount,

      deliveryFeeAmount:
        response.data
          .pricing
          .deliveryFeeAmount,

      serviceFeeAmount:
        response.data
          .pricing
          .serviceFeeAmount,

      taxAmount:
        response.data
          .pricing
          .taxAmount,

      tipAmount:
        response.data
          .pricing
          .tipAmount,

      totalAmount:
        response.data
          .pricing
          .totalAmount,
    },
  };
}


export const checkoutPaymentClientService = {
  prepareCheckoutPayment,
};