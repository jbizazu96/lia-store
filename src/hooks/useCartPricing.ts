"use client";

/*
|--------------------------------------------------------------------------
| useCartPricing Hook
|--------------------------------------------------------------------------
|
| Calculates the cart summary using the same centralized pricing rules used
| by checkout.
|
| The cart does not yet know the customer's delivery distance, so it uses
| zero miles as the estimate. Checkout recalculates the exact fee after the
| address and store coordinates are loaded.
|
*/

import {
  useMemo,
} from "react";

import {
  PRICING_CONFIG,
} from "@/config/pricing";

import {
  calculateDeliveryFee,
} from "@/services/delivery/deliveryPricing";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCartPricingParams {
  subtotal: number;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCartPricingResult {
  subtotal: number;

  deliveryFee: number;

  tax: number;

  total: number;

  amountUntilFreeDelivery: number;

  hasFreeDelivery: boolean;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCartPricing({
  subtotal,
}: UseCartPricingParams): UseCartPricingResult {
  return useMemo(() => {
    /*
    |--------------------------------------------------------------------------
    | Estimated Delivery Fee
    |--------------------------------------------------------------------------
    |
    | The cart uses zero miles because the exact delivery address is resolved
    | during checkout.
    |
    */

    const deliveryPricing =
      calculateDeliveryFee(
        0,
        subtotal
      );

    const deliveryFee =
      deliveryPricing.deliveryFee;

    /*
    |--------------------------------------------------------------------------
    | Tax
    |--------------------------------------------------------------------------
    */

    const tax =
      Math.round(
        subtotal *
          PRICING_CONFIG.SALES_TAX_RATE *
          100
      ) / 100;

    /*
    |--------------------------------------------------------------------------
    | Total
    |--------------------------------------------------------------------------
    */

    const total =
      subtotal +
      deliveryFee +
      tax;

    /*
    |--------------------------------------------------------------------------
    | Free Delivery Progress
    |--------------------------------------------------------------------------
    */

    const amountUntilFreeDelivery =
      Math.max(
        0,
        PRICING_CONFIG
          .FREE_DELIVERY_MINIMUM -
          subtotal
      );

    return {
      subtotal,

      deliveryFee,

      tax,

      total,

      amountUntilFreeDelivery,

      hasFreeDelivery:
        deliveryFee === 0 &&
        subtotal > 0,
    };
  }, [subtotal]);
}