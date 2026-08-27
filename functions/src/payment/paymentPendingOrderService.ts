/*
|--------------------------------------------------------------------------
| Payment-Pending Order Service
|--------------------------------------------------------------------------
|
| Creates the Firestore order record used while the customer is
| completing Stripe payment.
|
| Flow:
|
| Trusted checkout data
| + trusted distance
| + trusted pricing
| + authenticated customer
|        ↓
| Create payment-pending order
|        ↓
| Stripe PaymentIntent is created
|        ↓
| PaymentIntent ID is attached to the order
|
| Important:
|
| This service does NOT:
|
| - Reduce product stock
| - Notify the store
| - Trigger Shipday
| - Mark the order paid
| - Start the fulfillment timeline
|
| Those actions happen only after Stripe confirms payment.
*/

import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  CheckoutPaymentAddressInput,
  PrepareCheckoutPaymentRequest,
  TrustedCheckoutCustomer,
} from "./checkout/checkoutPaymentTypes";

import type {
  TrustedCheckoutData,
} from "../payment/checkout/checkoutDataService";

import type {
  PaymentPricingResult,
} from "./pricing/paymentPricingCalculator";
import type {
  MarketplacePricingPolicy,
} from "./pricing/marketplacePricingPolicy";
import type {ZonePricingDecision} from "./pricing/zonePricingResolutionService";
import {createCatalogSearchTokens} from "../services/catalog/catalogSearchTokens";


const db =
  getFirestore("default");


/*
  Checkout lifecycle is separate from fulfillment status.

  An order can have fulfillment status "pending" while still being hidden
  from the store until checkoutStatus becomes "confirmed".
*/
export type CheckoutStatus =
  | "awaiting_payment"
  | "processing"
  | "confirmed"
  | "payment_failed"
  | "expired";


/*
  Data required to create a payment-pending order.
*/
export interface CreatePaymentPendingOrderInput {

  /*
    LIA checkout-session document associated with this order.
  */
  checkoutSessionId: string;

  /*
    Stable fingerprint used to identify an identical checkout.
  */
  checkoutFingerprint: string;

  /*
    ISO expiration timestamp copied from the checkout session.
  */
  checkoutExpiresAt: string;

  customer: TrustedCheckoutCustomer;

  checkoutRequest:
    PrepareCheckoutPaymentRequest;

  checkoutData:
    TrustedCheckoutData;

  pricing:
    PaymentPricingResult;

  pricingPolicy:
    MarketplacePricingPolicy;

  zoneDecision: ZonePricingDecision;

  distanceMiles: number;

  estimatedDeliveryMinutes?: number;
}


/*
  Safe result required by the PaymentIntent service.
*/
export interface PaymentPendingOrderResult {
  orderId: string;

  orderNumber: string;
}


/*
  Predictable order-creation errors.
*/
export type PaymentPendingOrderErrorCode =
  | "INVALID_CUSTOMER"
  | "INVALID_DISTANCE"
  | "ORDER_CREATE_FAILED";


export class PaymentPendingOrderError extends Error {
  readonly code: PaymentPendingOrderErrorCode;

  constructor(
    code: PaymentPendingOrderErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PaymentPendingOrderError";

    this.code =
      code;
  }
}


/*
  Convert an integer cent amount into the dollar-valued order model
  currently used by the Next.js application.

  Stripe and payment reconciliation continue using integer cents.
*/
function centsToDollars(
  amount: number
): number {
  return amount / 100;
}


/*
  Build one formatted delivery-address string.
*/
function formatDeliveryAddress(
  address: CheckoutPaymentAddressInput
): string {
  const suppliedFormattedAddress =
    address.formattedAddress?.trim();

  if (suppliedFormattedAddress) {
    return suppliedFormattedAddress;
  }

  return [
    address.street,
    address.city,
    address.state,
    address.zip,
  ]
    .filter(Boolean)
    .join(", ");
}


/*
  Create the unpaid checkout order.

  Firestore generates the order document ID before Stripe is called.
  That allows the ID to become the stable Stripe idempotency and metadata
  reference.
*/
async function createPaymentPendingOrder(
  input: CreatePaymentPendingOrderInput
): Promise<PaymentPendingOrderResult> {
  const customerUid =
    input.customer.uid.trim();

  const customerEmail =
    input.customer.email.trim();

  const customerName =
    input.customer.name.trim();

  const customerPhone =
    input.customer.phone.trim();

  if (
    !customerUid ||
    !customerName ||
    !customerPhone
  ) {
    throw new PaymentPendingOrderError(
      "INVALID_CUSTOMER",
      "The checkout customer information is invalid."
    );
  }

  if (
    !Number.isFinite(input.distanceMiles) ||
    (input.checkoutRequest.fulfillmentType === "delivery" && input.distanceMiles <= 0) ||
    (input.checkoutRequest.fulfillmentType === "pickup" && input.distanceMiles < 0)
  ) {
    throw new PaymentPendingOrderError(
      "INVALID_DISTANCE",
      "The trusted route distance is invalid."
    );
  }

    const checkoutSessionId =
    input.checkoutSessionId.trim();

  const checkoutFingerprint =
    input.checkoutFingerprint.trim();

  const checkoutExpiresAt =
    new Date(
      input.checkoutExpiresAt
    );

  if (
    !checkoutSessionId ||
    !checkoutFingerprint ||
    Number.isNaN(
      checkoutExpiresAt.getTime()
    ) ||
    checkoutExpiresAt.getTime() <=
      Date.now()
  ) {
    throw new PaymentPendingOrderError(
      "ORDER_CREATE_FAILED",
      "The checkout session reference is invalid."
    );
  }

  const orderReference =
    db.collection("orders").doc();

  const orderNumber =
    `LIA-${Date.now()}-${orderReference.id
      .slice(0, 6)
      .toUpperCase()}`;

  const isPickup = input.checkoutRequest.fulfillmentType === "pickup";
  const deliveryAddress = input.checkoutRequest.deliveryAddress;

  const customerLatitude =
    isPickup ? input.checkoutData.store.latitude : deliveryAddress?.latitude;

  const customerLongitude =
    isPickup ? input.checkoutData.store.longitude : deliveryAddress?.longitude;

  if (
    typeof customerLatitude !== "number" ||
    typeof customerLongitude !== "number"
  ) {
    throw new PaymentPendingOrderError(
      "INVALID_DISTANCE",
      "The delivery address is missing trusted coordinates."
    );
  }

  try {
    await orderReference.set({
      orderNumber,

      /* Server-owned search index used by the store order workspace. */
      storeSearchTokens:
        createCatalogSearchTokens([
          orderReference.id,
          orderNumber,
          customerName,
          customerEmail,
        ]),

            /*
        Temporary checkout-session relationship.

        The payment webhook uses this reference to atomically confirm
        both the order and its LIA checkout session.
      */
      checkoutSessionId,

      checkoutFingerprint,

      checkoutExpiresAt:
        Timestamp.fromDate(
          checkoutExpiresAt
        ),

      /*
        Authenticated customer ownership plus delivery-contact details.
      */
      customer: {
        uid:
          customerUid,

        name:
          customerName,

        email:
          customerEmail,

        phone:
          customerPhone,

        address: isPickup ? "CUSTOMER PICKUP" : formatDeliveryAddress(deliveryAddress!),

        latitude:
          customerLatitude,

        longitude:
          customerLongitude,
      },

      /*
        Trusted store snapshot loaded from Firestore.
      */
      store: {
        id:
          input.checkoutData.store.id,

        ownerId:
          input.checkoutData.store.ownerId,

        name:
          input.checkoutData.store.name,

        address:
          input.checkoutData.store.address,

        phone:
          input.checkoutData.store.phone,

        latitude:
          input.checkoutData.store.latitude,

        longitude:
          input.checkoutData.store.longitude,
      },

      fulfillmentType: input.checkoutRequest.fulfillmentType,

      /*
        Trusted product snapshots.

        Dollar-valued price fields preserve compatibility with the
        current Next.js Order domain.
      */
      items:
        input.checkoutData.items.map(
          (item) => ({
            id:
              item.productId,

            name:
              item.name,

            price:
              centsToDollars(
                item.unitPriceAmount
              ),

            originalPrice:
              typeof item.originalUnitPriceAmount === "number"
                ? centsToDollars(
                    item.originalUnitPriceAmount
                  )
                : null,

            quantity:
              item.quantity,

            imageUrl:
              item.imageUrl ?? null,

            size:
              item.size ?? null,

            /*
              Integer amounts support future reconciliation and auditing.
            */
            unitPriceAmount:
              item.unitPriceAmount,

            originalUnitPriceAmount:
              item.originalUnitPriceAmount ?? null,

            lineTotalAmount:
              item.lineTotalAmount,
          })
        ),

      /*
        Current customer-facing dollar values.
      */
      pricing: {
        subtotal:
          centsToDollars(
            input.pricing
              .subtotalAmount
          ),

        deliveryFee:
          centsToDollars(
            input.pricing
              .deliveryFeeAmount
          ),

        serviceFee:
          centsToDollars(
            input.pricing
              .serviceFeeAmount
          ),

        tax:
          centsToDollars(
            input.pricing
              .taxAmount
          ),

        tip:
          centsToDollars(
            input.pricing
              .tipAmount
          ),

        total:
          centsToDollars(
            input.pricing
              .totalAmount
          ),

        /*
          Integer Stripe-facing values.
        */
        currency:
          input.pricing.currency,

        subtotalAmount:
          input.pricing
            .subtotalAmount,

        deliveryFeeAmount:
          input.pricing
            .deliveryFeeAmount,

        serviceFeeAmount:
          input.pricing
            .serviceFeeAmount,

        taxAmount:
          input.pricing
            .taxAmount,

        tipAmount:
          input.pricing
            .tipAmount,

        totalAmount:
          input.pricing
            .totalAmount,

        isPeakTime:
          input.pricing.isPeakTime,

        peakSurchargeAmount:
          input.pricing.peakSurchargeAmount,
      },

      /*
       * Immutable policy snapshot used for this customer payment. Future
       * Admin pricing changes cannot alter settlement or refund accounting.
       */
      pricingPolicy:
        input.pricingPolicy,

      customerHomeZoneId: input.zoneDecision.customerHomeZoneId,
      storeHomeZoneId: input.zoneDecision.storeHomeZoneId,
      pricingZoneId: input.zoneDecision.pricingZoneId,
      zoneAccessType: input.zoneDecision.zoneAccessType,
      trustedRouteDistanceMiles: input.distanceMiles,

      delivery: isPickup ? null : {
        instructions:
          input.checkoutRequest
            .deliveryInstructions ??
          null,

        distanceMiles:
          input.distanceMiles,

        estimatedMinutes:
          input.estimatedDeliveryMinutes ??
          null,

        address: {
          street:
            deliveryAddress!.street,

          city:
            deliveryAddress!.city,

          state:
            deliveryAddress!.state,

          zip:
            deliveryAddress!.zip,

          formattedAddress:
            formatDeliveryAddress(
              deliveryAddress!
            ),

          latitude:
            customerLatitude,

          longitude:
            customerLongitude,
        },
      },

      pickup: isPickup ? {
        storeAddress: input.checkoutData.store.address,
        distanceMiles: input.distanceMiles,
        instructions: input.checkoutData.store.pickupInstructions,
        customerInstructions: input.checkoutRequest.pickupInstructions ?? null,
        preparationMinutes: input.estimatedDeliveryMinutes ?? input.pricingPolicy.pickupPreparationMinutes,
        estimatedReadyAt: null,
        pickupCodeHash: null,
        pickupCodeLastFour: null,
        readyAt: null,
        pickedUpAt: null,
        handedOffBy: null,
      } : null,

      /*
        Fulfillment status remains pending, but checkoutStatus prevents
        this unpaid record from being treated as an actionable store
        order.
      */
      status:
        "pending",

      checkoutStatus:
        "awaiting_payment" satisfies
          CheckoutStatus,

      statusHistory: [],

      payment: {
        provider:
          "stripe",

        status:
          "pending",

        currency:
          input.pricing.currency,

        amount:
          input.pricing
            .totalAmount,

        paymentIntentId:
          null,

        createdAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      },

      shipday: isPickup ? null : {
        status:
          "pending",

        active:
          false,
      },

      /*
        Store transfer information is captured for future payout and
        reconciliation logic, but no transfer is created yet.
      */
      payout: {
        storeStripeAccountId:
          input.checkoutData.store
            .stripeAccountId,

        storeTransferStatus:
          "not_started",

        driverTransferStatus: isPickup ? "not_applicable" : "not_started",
      },

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error(
      "Payment-pending order creation failed:",
      error
    );

    throw new PaymentPendingOrderError(
      "ORDER_CREATE_FAILED",
      "The payment checkout could not be prepared."
    );
  }

  return {
    orderId:
      orderReference.id,

    orderNumber,
  };
}


/*
  Attach the Stripe PaymentIntent after it has been created.

  The order already exists, so the Stripe webhook can always reconcile
  the PaymentIntent metadata back to Firestore.
*/
async function attachPaymentIntent(
  orderId: string,
  paymentIntentId: string,
  paymentIntentStatus: string
): Promise<void> {
  const normalizedOrderId =
    orderId.trim();

  const normalizedPaymentIntentId =
    paymentIntentId.trim();

  if (
    !normalizedOrderId ||
    !normalizedPaymentIntentId
  ) {
    throw new PaymentPendingOrderError(
      "ORDER_CREATE_FAILED",
      "The Stripe payment reference is invalid."
    );
  }

  await db
    .collection("orders")
    .doc(normalizedOrderId)
    .update({
      "payment.paymentIntentId":
        normalizedPaymentIntentId,

      "payment.stripeStatus":
        paymentIntentStatus,

      "payment.updatedAt":
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });
}


/*
  Mark checkout preparation as failed when Stripe PaymentIntent creation
  fails after Firestore order creation.

  Keeping the record supports audit and cleanup instead of silently
  abandoning an unexplained order document.
*/
async function markPaymentPreparationFailed(
  orderId: string,
  reason: string
): Promise<void> {
  const normalizedOrderId =
    orderId.trim();

  if (!normalizedOrderId) {
    return;
  }

  await db
    .collection("orders")
    .doc(normalizedOrderId)
    .update({
      checkoutStatus:
        "payment_failed",

      "payment.status":
        "failed",

      "payment.failureReason":
        reason.slice(0, 500),

      "payment.updatedAt":
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });
}


/*
  Type guard for callable error handling.
*/
export function isPaymentPendingOrderError(
  error: unknown
): error is PaymentPendingOrderError {
  return (
    error instanceof
    PaymentPendingOrderError
  );
}


export const paymentPendingOrderService = {
  createPaymentPendingOrder,

  attachPaymentIntent,

  markPaymentPreparationFailed,
};
