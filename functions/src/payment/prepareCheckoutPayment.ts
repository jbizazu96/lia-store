/*
|--------------------------------------------------------------------------
| Prepare Checkout Payment
|--------------------------------------------------------------------------
|
| Authenticated callable Firebase Function that prepares one Stripe
| customer payment.
|
| Flow:
|
| Customer submits permitted checkout choices
|        ↓
| Validate the untrusted request
|        ↓
| Load trusted store and product data from Firestore
|        ↓
| Calculate trusted driving distance with Google Routes
|        ↓
| Calculate trusted payment amounts in integer cents
|        ↓
| Create a payment-pending Firestore order
|        ↓
| Create a Stripe PaymentIntent on the LIA platform account
|        ↓
| Attach the PaymentIntent ID to the order
|        ↓
| Return the clientSecret to the browser
|
| This function does NOT:
|
| - Confirm payment
| - Deduct inventory
| - Notify the store
| - Start fulfillment
| - Create Shipday delivery
| - Transfer money to the store or driver
*/

import {
  defineSecret,
} from "firebase-functions/params";

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import Stripe from "stripe";

import {
  checkoutDataService,
  isCheckoutDataError,
} from "./checkoutDataService";

import {
  checkoutDistanceService,
  isCheckoutDistanceError,
} from "./checkoutDistanceService";

import {
  calculatePaymentPricing,
} from "./paymentPricingCalculator";

import {
  isCheckoutPaymentValidationError,
  validatePrepareCheckoutPaymentRequest,
} from "./checkoutPaymentValidation";

import {
  isPaymentPendingOrderError,
  paymentPendingOrderService,
} from "./paymentPendingOrderService";

import {
  isStripePaymentServiceError,
  stripePaymentService,
} from "./stripePaymentService";

import type {
  PrepareCheckoutPaymentResponse,
  TrustedCheckoutCustomer,
} from "./checkoutPaymentTypes";


/*
  Stripe platform secret.

  This must belong to the same Stripe sandbox or live environment used
  by LIA's customer payments and connected accounts.
*/
const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );


/*
  Server-only Google Maps Platform key.

  Firebase Functions uses this key to calculate the trusted delivery
  route through Google Routes API.
*/
const googleMapsApiKey =
  defineSecret(
    "GOOGLE_MAPS_API_KEY"
  );


/*
  Convert a trusted distance into a simple delivery-time estimate.

  Current fallback rule:

  - Five minutes preparation
  - Two driving minutes per mile

  This estimate is informational only and does not affect the amount
  charged to the customer.

  Later, delivery ETA settings can be loaded from the admin-managed
  pricing and operations configuration.
*/
function estimateDeliveryMinutes(
  distanceMiles: number
): number {
  const preparationMinutes = 5;
  const minutesPerMile = 2;

  return Math.max(
    preparationMinutes,
    Math.round(
      preparationMinutes +
      distanceMiles *
        minutesPerMile
    )
  );
}


/*
  Build the trusted customer snapshot.

  request.auth determines ownership.

  The delivery contact name and phone come from the validated checkout
  request because a customer may legitimately order for another person.
*/
function buildTrustedCustomer(
  uid: string,
  email: string | undefined,
  contactName: string,
  contactPhone: string
): TrustedCheckoutCustomer {
  return {
    uid,
    email:
      email?.trim() ?? "",
    name:
      contactName,
    phone:
      contactPhone,
  };
}


/*
  Convert expected application errors into safe callable-function
  errors.

  Raw Stripe, Firestore, Google, and internal server details must not be
  exposed to the browser.
*/
function throwSafeCheckoutError(
  error: unknown
): never {
  if (
    isCheckoutPaymentValidationError(
      error
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      error.message
    );
  }

  if (
    isCheckoutDataError(error)
  ) {
    switch (error.code) {
      case "STORE_NOT_FOUND":
      case "PRODUCT_NOT_FOUND":
        throw new HttpsError(
          "not-found",
          error.message
        );

      case "STORE_UNAVAILABLE":
      case "STORE_STRIPE_NOT_READY":
      case "PRODUCT_UNAVAILABLE":
      case "INSUFFICIENT_STOCK":
      case "PRODUCT_STORE_MISMATCH":
        throw new HttpsError(
          "failed-precondition",
          error.message
        );

      default:
        throw new HttpsError(
          "invalid-argument",
          error.message
        );
    }
  }

  if (
    isCheckoutDistanceError(error)
  ) {
    switch (error.code) {
      case "INVALID_ROUTE_COORDINATES":
      case "ROUTE_NOT_FOUND":
        throw new HttpsError(
          "failed-precondition",
          error.message
        );

      case "MISSING_GOOGLE_MAPS_KEY":
        throw new HttpsError(
          "internal",
          "The delivery service is not configured."
        );

      default:
        throw new HttpsError(
          "unavailable",
          "The delivery route could not be calculated. Please try again."
        );
    }
  }

  if (
    isPaymentPendingOrderError(error)
  ) {
    throw new HttpsError(
      "internal",
      "The checkout order could not be prepared."
    );
  }

  if (
    isStripePaymentServiceError(error)
  ) {
    throw new HttpsError(
      "internal",
      "The payment could not be prepared."
    );
  }

  if (
    error instanceof
      Stripe.errors.StripeError
  ) {
    console.error(
      "Stripe rejected checkout payment preparation:",
      {
        type:
          error.type,
        code:
          error.code,
        message:
          error.message,
        requestId:
          error.requestId,
      }
    );

    throw new HttpsError(
      "unavailable",
      "Stripe could not prepare the payment. Please try again."
    );
  }

  console.error(
    "Unexpected checkout payment preparation failure:",
    error
  );

  throw new HttpsError(
    "internal",
    "The checkout payment could not be prepared."
  );
}


/*
  Prepare a customer Stripe payment.

  Firebase Authentication is required because the authenticated UID
  becomes the owner of the pending order.
*/
export const prepareCheckoutPayment =
  onCall(
    {
      region:
        "us-central1",

      secrets: [
        stripeSecretKey,
        googleMapsApiKey,
      ],

      maxInstances:
        10,

      timeoutSeconds:
        60,
    },

    async (
      request
    ): Promise<
      PrepareCheckoutPaymentResponse
    > => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "You must sign in before preparing payment."
        );
      }

      /*
        An order may be created before Stripe is called.

        Keep its ID outside the try block so a Stripe failure can mark
        that pending order as failed for audit and cleanup.
      */
      let pendingOrderId:
        string | null = null;

      try {
        /*
        |--------------------------------------------------------------------------
        | Validate Browser Request
        |--------------------------------------------------------------------------
        */

        const checkoutRequest =
          validatePrepareCheckoutPaymentRequest(
            request.data
          );

        /*
        |--------------------------------------------------------------------------
        | Load Trusted Store And Products
        |--------------------------------------------------------------------------
        */

        const checkoutData =
          await checkoutDataService
            .loadTrustedCheckoutData(
              checkoutRequest.storeId,
              checkoutRequest.items
            );

        /*
        |--------------------------------------------------------------------------
        | Calculate Trusted Route
        |--------------------------------------------------------------------------
        */

        const destinationLatitude =
          checkoutRequest
            .deliveryAddress
            .latitude;

        const destinationLongitude =
          checkoutRequest
            .deliveryAddress
            .longitude;

        if (
          typeof destinationLatitude !==
            "number" ||
          typeof destinationLongitude !==
            "number"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The delivery address needs valid map coordinates."
          );
        }

        const distanceMiles =
          await checkoutDistanceService
            .getTrustedDrivingDistanceMiles(
              {
                latitude:
                  checkoutData.store
                    .latitude,

                longitude:
                  checkoutData.store
                    .longitude,
              },

              {
                latitude:
                  destinationLatitude,

                longitude:
                  destinationLongitude,
              },

              googleMapsApiKey.value()
            );

        /*
        |--------------------------------------------------------------------------
        | Calculate Trusted Pricing
        |--------------------------------------------------------------------------
        */

        const pricing =
          calculatePaymentPricing({
            subtotalAmount:
              checkoutData
                .subtotalAmount,

            distanceMiles,

            tipAmount:
              checkoutRequest
                .tipAmountCents,

            isPeakTime:
              false,
          });

        /*
        |--------------------------------------------------------------------------
        | Build Trusted Customer
        |--------------------------------------------------------------------------
        */

        const customer =
          buildTrustedCustomer(
            request.auth.uid,
            request.auth.token.email as
              | string
              | undefined,
            checkoutRequest
              .contactName,
            checkoutRequest
              .contactPhone
          );

        /*
        |--------------------------------------------------------------------------
        | Create Payment-Pending Order
        |--------------------------------------------------------------------------
        */

        const pendingOrder =
          await paymentPendingOrderService
            .createPaymentPendingOrder({
              customer,

              checkoutRequest,

              checkoutData,

              pricing,

              distanceMiles,

              estimatedDeliveryMinutes:
                estimateDeliveryMinutes(
                  distanceMiles
                ),
            });

        pendingOrderId =
          pendingOrder.orderId;

        /*
        |--------------------------------------------------------------------------
        | Create Platform PaymentIntent
        |--------------------------------------------------------------------------
        */

        const stripe =
          new Stripe(
            stripeSecretKey.value()
          );

        const paymentIntent =
          await stripePaymentService
            .createOrderPaymentIntent(
              stripe,
              {
                orderId:
                  pendingOrder.orderId,

                orderNumber:
                  pendingOrder.orderNumber,

                customerUid:
                  customer.uid,

                customerEmail:
                  customer.email ||
                  undefined,

                storeId:
                  checkoutData.store.id,

                storeStripeAccountId:
                  checkoutData.store
                    .stripeAccountId,

                pricing,
              }
            );

        /*
        |--------------------------------------------------------------------------
        | Attach Stripe Reference
        |--------------------------------------------------------------------------
        */

        await paymentPendingOrderService
          .attachPaymentIntent(
            pendingOrder.orderId,
            paymentIntent
              .paymentIntentId,
            paymentIntent.status
          );

        return {
          success:
            true,

          orderId:
            pendingOrder.orderId,

          orderNumber:
            pendingOrder.orderNumber,

          paymentIntentId:
            paymentIntent
              .paymentIntentId,

          clientSecret:
            paymentIntent
              .clientSecret,

          pricing: {
            currency:
              pricing.currency,

            subtotalAmount:
              pricing
                .subtotalAmount,

            deliveryFeeAmount:
              pricing
                .deliveryFeeAmount,

            serviceFeeAmount:
              pricing
                .serviceFeeAmount,

            taxAmount:
              pricing
                .taxAmount,

            tipAmount:
              pricing
                .tipAmount,

            totalAmount:
              pricing
                .totalAmount,
          },
        };
      } catch (
        error: unknown
      ) {
        /*
          A failure after pending-order creation must leave an auditable
          failed record instead of an unexplained awaiting-payment order.
        */
        if (pendingOrderId) {
          try {
            await paymentPendingOrderService
              .markPaymentPreparationFailed(
                pendingOrderId,
                error instanceof Error
                  ? error.message
                  : "Unknown payment preparation failure."
              );
          } catch (
            cleanupError: unknown
          ) {
            console.error(
              "Unable to mark failed payment preparation:",
              {
                orderId:
                  pendingOrderId,
                cleanupError,
              }
            );
          }
        }

        throwSafeCheckoutError(
          error
        );
      }
    }
  );