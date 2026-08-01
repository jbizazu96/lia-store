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

import {
  PAYMENT_CURRENCY,
  PAYMENT_DELIVERY_CONFIG,
  PAYMENT_PRICING_CONFIG,
} from "./paymentPricingConfig";


/*
  Trusted inputs supplied by the future checkout preparation service.

  The merchandise subtotal must already be calculated from current
  Firestore product prices.
*/
export interface CalculatePaymentPricingInput {
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
    Optional peak-pricing flag.

    The current checkout flow will use false.
  */
  isPeakTime?: boolean;
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
  distanceMiles: number
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
    distanceMiles >
    PAYMENT_DELIVERY_CONFIG.maxRadiusMiles
  ) {
    throw new Error(
      `Delivery is unavailable beyond ${PAYMENT_DELIVERY_CONFIG.maxRadiusMiles} miles.`
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
  subtotalAmount: number
): number {
  /*
    Math.round() keeps the percentage result in whole cents.
  */
  const percentageAmount =
    Math.round(
      subtotalAmount *
      PAYMENT_PRICING_CONFIG.serviceFeeRate
    );

  return Math.max(
    PAYMENT_PRICING_CONFIG.minimumServiceFeeCents,
    Math.min(
      percentageAmount,
      PAYMENT_PRICING_CONFIG.maximumServiceFeeCents
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
  isPeakTime: boolean
): {
  deliveryFeeAmount: number;
  isFreeDelivery: boolean;
} {
  const isFreeDelivery =
    subtotalAmount >=
    PAYMENT_PRICING_CONFIG.freeDeliveryMinimumCents;

  if (isFreeDelivery) {
    return {
      deliveryFeeAmount: 0,
      isFreeDelivery: true,
    };
  }

  let deliveryFeeAmount =
    PAYMENT_DELIVERY_CONFIG.baseDeliveryFeeCents;

  if (
    distanceMiles >
    PAYMENT_DELIVERY_CONFIG.baseDistanceMiles
  ) {
    const extraMiles =
      distanceMiles -
      PAYMENT_DELIVERY_CONFIG.baseDistanceMiles;

    /*
      The frontend currently permits fractional route miles.

      Multiply the per-mile cent rate by the fractional distance and
      round once to the nearest cent.
    */
    deliveryFeeAmount += Math.round(
      extraMiles *
      PAYMENT_DELIVERY_CONFIG.costPerMileCents
    );
  }

  if (isPeakTime) {
    deliveryFeeAmount +=
      PAYMENT_DELIVERY_CONFIG.peakSurchargeCents;
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
  subtotalAmount: number
): number {
  return Math.round(
    subtotalAmount *
    PAYMENT_PRICING_CONFIG.salesTaxRate
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

  const tipAmount =
    requireValidCentAmount(
      input.tipAmount,
      "Tip"
    );

  const distanceMiles =
    requireValidDistance(
      input.distanceMiles
    );

  const {
    deliveryFeeAmount,
    isFreeDelivery,
  } = calculateDeliveryFeeAmount(
    subtotalAmount,
    distanceMiles,
    input.isPeakTime ?? false
  );

  const serviceFeeAmount =
    calculateServiceFeeAmount(
      subtotalAmount
    );

  const taxAmount =
    calculateTaxAmount(
      subtotalAmount
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
  };
}