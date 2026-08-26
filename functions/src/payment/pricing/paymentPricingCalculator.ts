/*
|--------------------------------------------------------------------------
| Payment Pricing Calculator
|--------------------------------------------------------------------------
|
| Calculates the trusted customer payment amount inside Firebase
| Functions.
|
| This module is intentionally pure:
|
| - No Firestore reads
| - No Stripe calls
| - No Firebase authentication
| - No browser-provided totals
|
| It accepts already validated server-side inputs and returns integer
| cent amounts suitable for Stripe PaymentIntents.
*/

import {PAYMENT_CURRENCY} from "./paymentPricingConfig";
import type {
  MarketplacePricingPolicy,
} from "./marketplacePricingPolicy";


/*
  Trusted inputs supplied by the future checkout preparation service.

  The merchandise subtotal must already be calculated from current
  Firestore product prices.
*/
export interface CalculatePaymentPricingInput {
  policy: MarketplacePricingPolicy;
  fulfillmentType?: "delivery" | "pickup";
  /*
    Trusted merchandise subtotal in cents.

    Example:

    2599 = $25.99
  */
  subtotalAmount: number;

  /*
    Trusted driving distance calculated by the backend.
  */
  distanceMiles: number;

  /*
    Customer-selected tip in cents.
  */
  tipAmount: number;

  /*
    Trusted peak-pricing state from the applicable default or zone policy.
  */
  isPeakTime?: boolean;

  /*
    An administrator-approved customer Order Zone is allowed to bypass the
    normal marketplace radius. The route remains trusted and is still used
    to calculate the complete distance-based delivery fee.
  */
  enforceMaximumDistance?: boolean;
}


/*
  Trusted pricing result used for the future order record and Stripe
  PaymentIntent.
*/
export interface PaymentPricingResult {
  currency: typeof PAYMENT_CURRENCY;

  subtotalAmount: number;

  deliveryFeeAmount: number;

  serviceFeeAmount: number;

  taxAmount: number;

  tipAmount: number;

  totalAmount: number;

  isFreeDelivery: boolean;

  isPeakTime: boolean;

  peakSurchargeAmount: number;
}


/*
  Ensure a monetary amount is a valid non-negative integer number of
  cents.
*/
function requireValidCentAmount(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative integer amount in cents.`
    );
  }

  return value;
}


/*
  Validate the trusted driving distance.
*/
function requireValidDistance(
  distanceMiles: number,
  policy: MarketplacePricingPolicy,
  enforceMaximumDistance: boolean,
): number {
  if (
    !Number.isFinite(distanceMiles) ||
    distanceMiles < 0
  ) {
    throw new Error(
      "Delivery distance must be a valid non-negative number."
    );
  }

  if (
    enforceMaximumDistance &&
    distanceMiles >
    policy.maxRadiusMiles
  ) {
    throw new Error(
      `Delivery is unavailable beyond ${
        policy.maxRadiusMiles
      } miles.`
    );
  }

  return distanceMiles;
}


/*
  Calculate the customer-facing service fee.

  Formula:

  subtotal × 5%

  Then apply:

  - $1.99 minimum
  - $9.99 maximum
*/
function calculateServiceFeeAmount(
  subtotalAmount: number,
  policy: MarketplacePricingPolicy,
  fulfillmentType: "delivery" | "pickup",
): number {
  const serviceFeeRate = fulfillmentType === "pickup"
    ? policy.pickupServiceFeeRate
    : policy.serviceFeeRate;
  const minimumServiceFeeCents = fulfillmentType === "pickup"
    ? policy.pickupMinimumServiceFeeCents
    : policy.minimumServiceFeeCents;
  const maximumServiceFeeCents = fulfillmentType === "pickup"
    ? policy.pickupMaximumServiceFeeCents
    : policy.maximumServiceFeeCents;
  /*
    Math.round() keeps the percentage result in whole cents.
  */
  const percentageAmount =
    Math.round(
      subtotalAmount *
      serviceFeeRate
    );

  return Math.max(
    minimumServiceFeeCents,
    Math.min(
      percentageAmount,
      maximumServiceFeeCents
    )
  );
}


/*
  Calculate the distance-based delivery fee.

  Rules:

  - Up to five miles: $7.99
  - Beyond five miles: $7.99 + $1.75 per additional mile
  - Orders at or above $150.00 receive free delivery
  - Optional peak surcharge: $1.99
*/
function calculateDeliveryFeeAmount(
  subtotalAmount: number,
  distanceMiles: number,
  isPeakTime: boolean,
  policy: MarketplacePricingPolicy
): {
  deliveryFeeAmount: number;
  isFreeDelivery: boolean;
} {
  const isFreeDelivery =
    subtotalAmount >=
    policy.freeDeliveryMinimumCents;

  if (isFreeDelivery) {
    return {
      deliveryFeeAmount: 0,
      isFreeDelivery: true,
    };
  }

  let deliveryFeeAmount =
    policy.baseDeliveryFeeCents;

  if (
    distanceMiles >
    policy.baseDistanceMiles
  ) {
    const extraMiles =
      distanceMiles -
      policy.baseDistanceMiles;

    /*
      The frontend currently permits fractional route miles.

      Multiply the per-mile cent rate by the fractional distance and
      round once to the nearest cent.
    */
    deliveryFeeAmount += Math.round(
      extraMiles *
      policy.costPerMileCents
    );
  }

  if (isPeakTime) {
    deliveryFeeAmount +=
      policy.peakSurchargeCents;
  }

  return {
    deliveryFeeAmount,
    isFreeDelivery: false,
  };
}


/*
  Calculate sales tax.

  The current MVP behavior matches the frontend:

  tax = merchandise subtotal × 8%

  Delivery fee, service fee, and tip are not currently included in the
  taxable base.
*/
function calculateTaxAmount(
  subtotalAmount: number,
  policy: MarketplacePricingPolicy
): number {
  return Math.round(
    subtotalAmount *
      policy.salesTaxRate
  );
}


/*
  Calculate the complete trusted payment amount.
*/
export function calculatePaymentPricing(
  input: CalculatePaymentPricingInput
): PaymentPricingResult {
  const subtotalAmount =
    requireValidCentAmount(
      input.subtotalAmount,
      "Subtotal"
    );

  const fulfillmentType = input.fulfillmentType ?? "delivery";
  const tipAmount =
    requireValidCentAmount(
      fulfillmentType === "pickup" ? 0 : input.tipAmount,
      "Tip"
    );

  const distanceMiles =
    requireValidDistance(
      fulfillmentType === "pickup" ? 0 : input.distanceMiles,
      input.policy,
      input.enforceMaximumDistance ?? true,
    );

  const deliveryPricing =
    fulfillmentType === "pickup"
      ? {deliveryFeeAmount: 0, isFreeDelivery: false}
      : calculateDeliveryFeeAmount(
          subtotalAmount,
          distanceMiles,
          input.isPeakTime ?? false,
          input.policy
        );
  const {
    deliveryFeeAmount,
    isFreeDelivery,
  } = deliveryPricing;

  const serviceFeeAmount =
    calculateServiceFeeAmount(
      subtotalAmount,
      input.policy,
      fulfillmentType,
    );

  const taxAmount =
    calculateTaxAmount(
      subtotalAmount,
      input.policy
    );

  const totalAmount =
    subtotalAmount +
    deliveryFeeAmount +
    serviceFeeAmount +
    taxAmount +
    tipAmount;

  return {
    currency: PAYMENT_CURRENCY,

    subtotalAmount,

    deliveryFeeAmount,

    serviceFeeAmount,

    taxAmount,

    tipAmount,

    totalAmount,

    isFreeDelivery,

    isPeakTime: fulfillmentType === "delivery" && input.isPeakTime === true,

    peakSurchargeAmount:
      fulfillmentType === "delivery" && input.isPeakTime === true && !isFreeDelivery
        ? input.policy.peakSurchargeCents
        : 0,
  };
}
