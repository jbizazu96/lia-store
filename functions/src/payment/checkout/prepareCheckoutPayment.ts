/*
|--------------------------------------------------------------------------
| Prepare Checkout Payment
|--------------------------------------------------------------------------
|
| Authenticated callable Firebase Function that prepares or resumes one
| Stripe customer payment.
|
| Flow:
|
| Validate browser choices
|        ↓
| Load trusted store and products
|        ↓
| Calculate trusted route and pricing
|        ↓
| Create or retrieve the customer's Stripe Customer
|        ↓
| Resolve LIA checkout session
|        ↓
| ┌────────────────────────┬─────────────────────────┐
| | Existing active session| New checkout session    |
| |                        |                         |
| | Retrieve PaymentIntent | Create pending order    |
| |                        | Create PaymentIntent    |
| └────────────────────────┴─────────────────────────┘
|        ↓
| Create a fresh Stripe Customer Session
|        ↓
| Return PaymentIntent and Customer Session secrets
|
| Important:
|
| This function does NOT:
|
| - Confirm payment
| - Deduct inventory
| - Notify the store
| - Start fulfillment
| - Create a Shipday delivery
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
import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {requireAccountOperational} from "../../accountDeletion/accountDeletionAccessService";
import {enforceCallableAbuseProtection} from "../../security/callableAbuseProtection";
import {requireCurrentCustomerLegalDocuments} from "../../legal/customerLegalConfig";

import {
  checkoutDataService,
  isCheckoutDataError,
} from "./checkoutDataService";

import {
  checkoutDistanceService,
  isCheckoutDistanceError,
} from "./checkoutDistanceService";

import {
  isCheckoutPaymentValidationError,
  validatePrepareCheckoutPaymentRequest,
} from "./checkoutPaymentValidation";

import {
  isCheckoutSessionServiceError,
  checkoutSessionService,
} from "./checkoutSessionService";

import {
  isPaymentPendingOrderError,
  paymentPendingOrderService,
} from "../paymentPendingOrderService";

import {
  calculatePaymentPricing,
} from "../pricing/paymentPricingCalculator";
import {
  getMarketplacePricingPolicyForZone,
} from "../pricing/marketplacePricingPolicy";
import {
  isPickupAllowedByZoneOrDistance,
  resolvePickupZoneDecision,
  resolveZonePricingDecision,
} from "../pricing/zonePricingResolutionService";

import {
  isStripeCustomerServiceError,
  stripeCustomerService,
} from "../stripe/stripeCustomerService";

import {
  isStripeCustomerSessionError,
  stripeCustomerSessionService,
} from "../stripe/stripeCustomerSessionService";

import {
  isStripePaymentServiceError,
  stripePaymentService,
} from "../stripe/stripePaymentService";
import {
  createStripeTaxCalculation,
  StripeTaxCalculationError,
} from "../tax/stripeTaxCalculationService";

import type {
  PrepareCheckoutPaymentResponse,
  TrustedCheckoutCustomer,
} from "./checkoutPaymentTypes";

import type {
  ReusableCheckoutSession,
} from "./checkoutSessionTypes";
import {checkoutOperationalGuard} from "../../callable/adminOperations";


/*
|--------------------------------------------------------------------------
| Secrets
|--------------------------------------------------------------------------
*/

const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );

const googleMapsApiKey =
  defineSecret(
    "GOOGLE_MAPS_API_KEY"
  );

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");


/*
|--------------------------------------------------------------------------
| Delivery Estimate
|--------------------------------------------------------------------------
*/

function estimateDeliveryMinutes(
  distanceMiles: number
): number {
  const preparationMinutes =
    5;

  const minutesPerMile =
    2;

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
|--------------------------------------------------------------------------
| Trusted Customer
|--------------------------------------------------------------------------
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
|--------------------------------------------------------------------------
| Minimum Order Enforcement
|--------------------------------------------------------------------------
|
| The merchandise subtotal is rebuilt from live product records. Delivery,
| tax, service fee, and tip never count toward the minimum purchase amount.
|
| The current marketplace policy is the one source of truth. A store-specific
| override can be introduced later only with a separately reviewed admin
| setting; legacy store.minimumOrder values must not override this policy.
|
*/

function requireMinimumOrder(
  input: {
    storeName: string;
    subtotalAmount: number;
    defaultMinimumOrderAmount: number;
  }
): void {
  const minimumOrderAmount =
    input.defaultMinimumOrderAmount;

  if (
    input.subtotalAmount >=
    minimumOrderAmount
  ) {
    return;
  }

  const currency = (amount: number) =>
    `$${(amount / 100).toFixed(2)}`;

  const remainingAmount =
    minimumOrderAmount -
    input.subtotalAmount;

  throw new HttpsError(
    "failed-precondition",
    `${input.storeName} requires a minimum merchandise order of ${
      currency(minimumOrderAmount)
    }. Add ${currency(remainingAmount)} more to continue.`
  );
}


/*
|--------------------------------------------------------------------------
| Reused PaymentIntent
|--------------------------------------------------------------------------
*/

interface ReusedPaymentIntentResult {
  paymentIntentId: string;

  clientSecret: string;

  status:
    Stripe.PaymentIntent.Status;
}


/*
  Retrieve and validate the PaymentIntent belonging to a reusable LIA
  checkout session.

  We do not trust Firestore references by themselves. Stripe remains the
  source of truth for the payment resource.
*/
async function retrieveReusablePaymentIntent(
  stripe: Stripe,
  session:
    ReusableCheckoutSession,
  expectedStripeCustomerId: string,
  expectedCustomerUid: string,
  expectedStoreId: string
): Promise<
  ReusedPaymentIntentResult
> {
  const paymentIntent =
    await stripe.paymentIntents.retrieve(
      session.paymentIntentId
    );

  const paymentCustomerId =
    typeof paymentIntent.customer ===
      "string"
      ? paymentIntent.customer
      : paymentIntent.customer?.id;

  /*
    Confirm that the reused PaymentIntent still represents the exact
    checkout session and authenticated customer.
  */
  if (
    paymentIntent.id !==
      session.paymentIntentId ||
    paymentIntent.amount !==
      session.totalAmount ||
    paymentIntent.currency !==
      session.currency ||
    paymentCustomerId !==
      expectedStripeCustomerId ||
    paymentIntent.metadata
      .liaOrderId !==
      session.orderId ||
    paymentIntent.metadata
      .liaCustomerUid !==
      expectedCustomerUid ||
    paymentIntent.metadata
      .liaStoreId !==
      expectedStoreId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The existing payment session no longer matches this checkout."
    );
  }

  /*
    These states can continue through the Payment Element.
  */
  const reusableStatuses:
    Stripe.PaymentIntent.Status[] = [
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
      "processing",
    ];

  if (
    !reusableStatuses.includes(
      paymentIntent.status
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The existing payment session can no longer be reused."
    );
  }

  if (
    !paymentIntent.client_secret
  ) {
    throw new HttpsError(
      "internal",
      "Stripe did not return the existing payment client secret."
    );
  }

  return {
    paymentIntentId:
      paymentIntent.id,

    clientSecret:
      paymentIntent.client_secret,

    status:
      paymentIntent.status,
  };
}


/*
|--------------------------------------------------------------------------
| Error Mapping
|--------------------------------------------------------------------------
*/

function throwSafeCheckoutError(
  error: unknown
): never {
  if (
    error instanceof
    HttpsError
  ) {
    throw error;
  }

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
    isCheckoutDataError(
      error
    )
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
      case "PRODUCT_TAX_CLASSIFICATION_REQUIRED":
      case "PRODUCT_TAX_CLASSIFICATION_INVALID":
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
    isCheckoutDistanceError(
      error
    )
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
    isCheckoutSessionServiceError(
      error
    )
  ) {
    throw new HttpsError(
      "internal",
      "The checkout session could not be prepared."
    );
  }

  if (
    isStripeCustomerServiceError(
      error
    )
  ) {
    switch (error.code) {
      case "USER_NOT_FOUND":
        throw new HttpsError(
          "failed-precondition",
          "Your customer profile could not be found."
        );

      case "INVALID_STORED_CUSTOMER":
      case "STRIPE_CUSTOMER_CONFLICT":
        throw new HttpsError(
          "failed-precondition",
          "Your saved payment profile needs attention."
        );

      default:
        throw new HttpsError(
          "internal",
          "Your Stripe customer profile could not be prepared."
        );
    }
  }

  if (
    isPaymentPendingOrderError(
      error
    )
  ) {
    throw new HttpsError(
      "internal",
      "The checkout order could not be prepared."
    );
  }

  if (
    isStripePaymentServiceError(
      error
    )
  ) {
    throw new HttpsError(
      "internal",
      "The payment could not be prepared."
    );
  }

  if (error instanceof StripeTaxCalculationError) {
    throw new HttpsError(
      "failed-precondition",
      error.message
    );
  }

  if (
    isStripeCustomerSessionError(
      error
    )
  ) {
    throw new HttpsError(
      "internal",
      "Your saved payment methods could not be prepared."
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
|--------------------------------------------------------------------------
| Callable Function
|--------------------------------------------------------------------------
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
      await checkoutOperationalGuard();

      await enforceCallableAbuseProtection({
        operation: "prepare-checkout-payment",
        uid: request.auth.uid,
        appCheckVerified: Boolean(request.app),
        maximumRequests: 10,
        windowSeconds: 300,
      });

      await requireAccountOperational(request.auth.uid);

      /*
       * Account suspension is a server-enforced customer lifecycle control.
       * A browser cannot bypass it by calling checkout directly.
       */
      const customerProfile = await db.collection("users")
        .doc(request.auth.uid)
        .get();

      if (
        !customerProfile.exists ||
        customerProfile.data()?.accountType !== "customer"
      ) {
        throw new HttpsError(
          "permission-denied",
          "This account is not authorized to complete customer checkout."
        );
      }

      if (customerProfile.data()?.isActive === false) {
        throw new HttpsError(
          "permission-denied",
          "This customer account is currently suspended. Contact support for help."
        );
      }

      await requireCurrentCustomerLegalDocuments(db, customerProfile.data() ?? {}, request.auth.uid);

      /*
        These references are populated only for a newly created session.

        A reused session must never be marked failed merely because a
        temporary browser response or Customer Session request fails.
      */
      let newlyCreatedSessionId:
        string | null = null;

      let newlyCreatedOrderId:
        string | null = null;

      /*
        Once this becomes true, the order and checkout session represent a
        valid reusable payment attempt.

        A later Customer Session failure must not invalidate them.
      */
      let paymentIntentAttached =
        false;

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
        | Validate Delivery Coordinates
        |--------------------------------------------------------------------------
        */

        const isPickup = checkoutRequest.fulfillmentType === "pickup";
        if (isPickup && !checkoutData.store.pickupEnabled) {
          throw new HttpsError("failed-precondition", "This store is not currently accepting pickup orders.");
        }

        const customerData = customerProfile.data() ?? {};
        const defaultAddress = customerData.defaultAddress &&
          typeof customerData.defaultAddress === "object"
          ? customerData.defaultAddress as Record<string, unknown>
          : {};
        const pickupZoneDecision = isPickup
          ? resolvePickupZoneDecision(
              customerData,
              {homeZoneId: checkoutData.store.homeZoneId},
            )
          : null;
        const deliveryZoneDecision = isPickup
          ? null
          : resolveZonePricingDecision(
              customerData,
              {homeZoneId: checkoutData.store.homeZoneId, serviceZoneIds: checkoutData.store.serviceZoneIds},
            );
        const marketplacePricingPolicy = await getMarketplacePricingPolicyForZone(
          isPickup ? null : deliveryZoneDecision?.pricingZoneId ?? null,
        );

        const destinationLatitude = isPickup
          ? defaultAddress.latitude
          : checkoutRequest.deliveryAddress?.latitude;

        const destinationLongitude = isPickup
          ? defaultAddress.longitude
          : checkoutRequest.deliveryAddress?.longitude;

        if (
          (!isPickup || pickupZoneDecision?.allowed !== true) && (
            typeof destinationLatitude !== "number" ||
            typeof destinationLongitude !== "number"
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            isPickup
              ? "Add a verified customer address so LIA can confirm the pickup distance."
              : "The delivery address needs valid map coordinates."
          );
        }


        /*
        |--------------------------------------------------------------------------
        | Calculate Trusted Route
        |--------------------------------------------------------------------------
        */

        const distanceMiles = isPickup && pickupZoneDecision?.allowed === true
          ? 0
          : await checkoutDistanceService
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
                  latitude: destinationLatitude as number,

                  longitude: destinationLongitude as number,
              },

              googleMapsApiKey.value()
            );


        /*
        |--------------------------------------------------------------------------
        | Calculate Trusted Pricing
        |--------------------------------------------------------------------------
        */

        const pickupDistanceAllowed = isPickup && pickupZoneDecision
          ? isPickupAllowedByZoneOrDistance(
              pickupZoneDecision,
              distanceMiles,
              marketplacePricingPolicy.pickupMaximumDistanceMiles,
            )
          : false;
        const zoneDecision = isPickup
          ? pickupZoneDecision?.allowed === true
            ? pickupZoneDecision
            : {
                ...pickupZoneDecision!,
                pricingZoneId: null,
                zoneAccessType: "pickup" as const,
                allowed: pickupDistanceAllowed,
              }
          : deliveryZoneDecision!;
        if (!zoneDecision.allowed) {
          throw new HttpsError(
            "failed-precondition",
            isPickup
              ? `This store is outside your delivery access and farther than the ${marketplacePricingPolicy.pickupMaximumDistanceMiles}-mile pickup threshold.`
              : "This store is outside your approved order zones. Contact LIA support for assistance.",
          );
        }
        if (isPickup && !marketplacePricingPolicy.pickupEnabled) {
          throw new HttpsError("failed-precondition", "Customer pickup is temporarily unavailable.");
        }

        requireMinimumOrder({
          storeName:
            checkoutData.store.name,

          subtotalAmount:
            checkoutData
              .subtotalAmount,

          defaultMinimumOrderAmount:
            isPickup
              ? marketplacePricingPolicy.pickupMinimumOrderCents
              : marketplacePricingPolicy.defaultMinimumOrderCents,
        });

        const pricingBeforeTax =
          calculatePaymentPricing({
            fulfillmentType: checkoutRequest.fulfillmentType,
            subtotalAmount:
              checkoutData
                .subtotalAmount,

            distanceMiles,

            tipAmount:
              checkoutRequest
                .tipAmountCents,

            isPeakTime:
              !isPickup && marketplacePricingPolicy
                .peakSurchargeEnabled,

            enforceMaximumDistance:
              !isPickup && zoneDecision.zoneAccessType !== "customer_order_zone",

            policy:
              marketplacePricingPolicy,

            authoritativeTaxAmount: 0,
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
        | Create Stripe Client
        |--------------------------------------------------------------------------
        */

        const stripe =
          new Stripe(
            stripeSecretKey.value()
          );

        const taxCalculation = await createStripeTaxCalculation(stripe, {
          fulfillmentType: checkoutRequest.fulfillmentType,
          items: checkoutData.items,
          store: checkoutData.store,
          deliveryAddress: checkoutRequest.deliveryAddress,
          pricingBeforeTax,
        });

        const pricing = calculatePaymentPricing({
          fulfillmentType: checkoutRequest.fulfillmentType,
          subtotalAmount: checkoutData.subtotalAmount,
          distanceMiles,
          tipAmount: checkoutRequest.tipAmountCents,
          isPeakTime: !isPickup && marketplacePricingPolicy.peakSurchargeEnabled,
          enforceMaximumDistance:
            !isPickup && zoneDecision.zoneAccessType !== "customer_order_zone",
          policy: marketplacePricingPolicy,
          authoritativeTaxAmount: taxCalculation.taxAmount,
        });

        if (pricing.totalAmount !== taxCalculation.amountTotal) {
          throw new StripeTaxCalculationError(
            "The trusted checkout total does not match Stripe Tax."
          );
        }


        /*
        |--------------------------------------------------------------------------
        | Create Or Retrieve Stripe Customer
        |--------------------------------------------------------------------------
        */

        const stripeCustomer =
          await stripeCustomerService
            .getOrCreateStripeCustomer(
              stripe,
              {
                firebaseUid:
                  customer.uid,

                email:
                  customer.email ||
                  undefined,

                name:
                  customer.name,

                phone:
                  customer.phone,
              }
            );


        /*
        |--------------------------------------------------------------------------
        | Resolve LIA Checkout Session
        |--------------------------------------------------------------------------
        |
        | The fingerprint uses trusted and normalized checkout facts.
        |
        | An identical active checkout reuses its existing order and
        | PaymentIntent.
        |
        */

        const sessionResolution =
          await checkoutSessionService
            .resolveCheckoutSession({
              fingerprintInput: {
                fulfillmentType: checkoutRequest.fulfillmentType,
                customerUid:
                  customer.uid,

                storeId:
                  checkoutData.store.id,

                items:
                  checkoutData.items.map(
                    (
                      item
                    ) => ({
                      productId:
                        item.productId,

                      quantity:
                        item.quantity,

                      size:
                        item.size ??
                        null,
                    })
                  ),

                deliveryAddress: isPickup ? null : {
                  street:
                    checkoutRequest
                      .deliveryAddress!
                      .street,

                  city:
                    checkoutRequest
                      .deliveryAddress!
                      .city,

                  state:
                    checkoutRequest
                      .deliveryAddress!
                      .state,

                  zip:
                    checkoutRequest
                      .deliveryAddress!
                      .zip,

                  latitude: destinationLatitude as number,

                  longitude: destinationLongitude as number,
                },

                fulfillmentInstructions: isPickup
                  ? checkoutRequest.pickupInstructions ?? null
                  : checkoutRequest.deliveryInstructions ?? null,

                tipAmount:
                  pricing.tipAmount,

                totalAmount:
                  pricing.totalAmount,

                currency:
                  pricing.currency,
              },
            });


        /*
        |--------------------------------------------------------------------------
        | Reuse Existing Checkout
        |--------------------------------------------------------------------------
        */

        if (
          sessionResolution.type ===
          "reuse"
        ) {
          const reusableSession =
            sessionResolution.session;

          const paymentIntent =
            await retrieveReusablePaymentIntent(
              stripe,
              reusableSession,
              stripeCustomer.customerId,
              customer.uid,
              checkoutData.store.id
            );

          /*
            Create a fresh Customer Session each time checkout opens.

            Customer Session secrets are short-lived and are not stored
            as reusable LIA session data.
          */
          const customerSession =
            await stripeCustomerSessionService
              .createCustomerSession(
                stripe,
                {
                  customerId:
                    stripeCustomer
                      .customerId,
                }
              );

          console.log(
            "Reusing active checkout session:",
            {
              sessionId:
                reusableSession
                  .sessionId,

              orderId:
                reusableSession
                  .orderId,

              paymentIntentId:
                paymentIntent
                  .paymentIntentId,
            }
          );

          return {
            success:
              true,

            orderId:
              reusableSession
                .orderId,

            checkoutSessionId:
              reusableSession
                .sessionId,

            orderNumber:
              reusableSession
                .orderNumber,

            paymentIntentId:
              paymentIntent
                .paymentIntentId,

            clientSecret:
              paymentIntent
                .clientSecret,

            customerSessionClientSecret:
              customerSession
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
        }


        /*
        |--------------------------------------------------------------------------
        | Create New Checkout Session
        |--------------------------------------------------------------------------
        */

        newlyCreatedSessionId =
          sessionResolution
            .session
            .sessionId;


        /*
        |--------------------------------------------------------------------------
        | Create Payment-Pending Order
        |--------------------------------------------------------------------------
        */

        const pendingOrder =
          await paymentPendingOrderService
            .createPaymentPendingOrder({

              checkoutSessionId:
                newlyCreatedSessionId,

              checkoutFingerprint:
                sessionResolution
                  .session
                  .fingerprint,

              checkoutExpiresAt:
                sessionResolution
                  .session
                  .expiresAt,

              customer,

              checkoutRequest,

              checkoutData,

              pricing,

              pricingPolicy:
                marketplacePricingPolicy,

              taxCalculation: taxCalculation.snapshot,

              productTaxById: taxCalculation.productTaxById,

              zoneDecision,

              distanceMiles,

              estimatedDeliveryMinutes: isPickup
                ? checkoutData.store.pickupPreparationMinutes ?? marketplacePricingPolicy.pickupPreparationMinutes
                : estimateDeliveryMinutes(distanceMiles),
            });

        newlyCreatedOrderId =
          pendingOrder.orderId;


        /*
        |--------------------------------------------------------------------------
        | Attach Order To Checkout Session
        |--------------------------------------------------------------------------
        */

        await checkoutSessionService
          .attachOrder({
            sessionId:
              newlyCreatedSessionId,

            orderId:
              pendingOrder.orderId,

            orderNumber:
              pendingOrder.orderNumber,
          });


        /*
        |--------------------------------------------------------------------------
        | Create Platform PaymentIntent
        |--------------------------------------------------------------------------
        */

        const paymentIntent =
          await stripePaymentService
            .createOrderPaymentIntent(
              stripe,
              {
                fulfillmentType: checkoutRequest.fulfillmentType,
                orderId:
                  pendingOrder.orderId,

                orderNumber:
                  pendingOrder.orderNumber,

                customerUid:
                  customer.uid,

                stripeCustomerId:
                  stripeCustomer
                    .customerId,

                customerEmail:
                  customer.email ||
                  undefined,

                storeId:
                  checkoutData.store.id,

                storeStripeAccountId:
                  checkoutData.store
                    .stripeAccountId,

                pricing,

                stripeTaxCalculationId: taxCalculation.snapshot.calculationId,
              }
            );


        /*
        |--------------------------------------------------------------------------
        | Attach PaymentIntent To Order
        |--------------------------------------------------------------------------
        */

        await paymentPendingOrderService
          .attachPaymentIntent(
            pendingOrder.orderId,

            paymentIntent
              .paymentIntentId,

            paymentIntent.status
          );


        /*
        |--------------------------------------------------------------------------
        | Activate Checkout Session
        |--------------------------------------------------------------------------
        |
        | Once both the order and PaymentIntent are attached, identical
        | future requests may reuse this checkout session.
        |
        */

        await checkoutSessionService
          .attachPaymentIntent({
            sessionId:
              newlyCreatedSessionId,

            paymentIntentId:
              paymentIntent
                .paymentIntentId,
          });

          /*
            The order and checkout session now reference a real reusable
            PaymentIntent.

            Failures after this point must preserve the awaiting-payment state.
          */
          paymentIntentAttached =
            true;


        /*
        |--------------------------------------------------------------------------
        | Create Stripe Customer Session
        |--------------------------------------------------------------------------
        */

        const customerSession =
          await stripeCustomerSessionService
            .createCustomerSession(
              stripe,
              {
                customerId:
                  stripeCustomer
                    .customerId,
              }
            );


        console.log(
          "Created new checkout session:",
          {
            sessionId:
              newlyCreatedSessionId,

            orderId:
              pendingOrder.orderId,

            paymentIntentId:
              paymentIntent
                .paymentIntentId,
          }
        );


        /*
        |--------------------------------------------------------------------------
        | Return Safe Checkout Data
        |--------------------------------------------------------------------------
        */

        return {
          success:
            true,

          orderId:
            pendingOrder.orderId,

          checkoutSessionId:
            newlyCreatedSessionId,

          orderNumber:
            pendingOrder.orderNumber,

          paymentIntentId:
            paymentIntent
              .paymentIntentId,

          clientSecret:
            paymentIntent
              .clientSecret,

          customerSessionClientSecret:
            customerSession
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
          Only newly created resources are marked failed here.

          Existing reusable sessions are left unchanged when a temporary
          response or Customer Session request fails.
        */
        if (
          newlyCreatedOrderId &&
          !paymentIntentAttached
        ) {
          try {
            await paymentPendingOrderService
              .markPaymentPreparationFailed(
                newlyCreatedOrderId,

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
                  newlyCreatedOrderId,

                cleanupError,
              }
            );
          }
        }

        if (
          newlyCreatedSessionId &&
          !paymentIntentAttached
        ) {
          await checkoutSessionService
            .markSessionFailed(
              newlyCreatedSessionId,

              error instanceof Error
                ? error.message
                : "Unknown checkout session preparation failure."
            );
        }

        throwSafeCheckoutError(
          error
        );
      }
    }
  );
