"use client";

/*
|--------------------------------------------------------------------------
| useCheckoutPricing Hook
|--------------------------------------------------------------------------
|
| Calculates all checkout pricing from the current cart, delivery address,
| and store.
|
| This hook is completely pure. It performs no Firestore reads or writes.
|
*/

import {
  useMemo,
} from "react";

import {
  calculateDistance,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";

import {
  calculateDeliveryFee,
} from "@/services/delivery/deliveryPricing";

import {
  PRICING_CONFIG,
} from "@/config/pricing";

import type {
  Store,
} from "@/types/store";

import type {
  CheckoutAddress,
  CheckoutTotals,
} from "@/app/checkout/types";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCheckoutPricingParams {
  subtotal: number;

  tip: number;

  store: Store | null;

  address: CheckoutAddress | null;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCheckoutPricingResult {
  distanceMiles: number;

  estimatedDeliveryMinutes: number;

  deliveryFee: number;

  tax: number;

  total: number;

  totals: CheckoutTotals;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCheckoutPricing({
  subtotal,
  tip,
  store,
  address,
}: UseCheckoutPricingParams): UseCheckoutPricingResult {
  return useMemo(() => {
    const distanceMiles =
      store &&
      address?.latitude !== undefined &&
      address?.longitude !== undefined
        ? calculateDistance(
            store.latitude,
            store.longitude,
            address.latitude,
            address.longitude
          )
        : 0;

    const pricing =
      calculateDeliveryFee(
        distanceMiles,
        subtotal
      );

    const deliveryFee =
      pricing.deliveryFee;

    const tax =
      Math.round(
        subtotal *
          PRICING_CONFIG.SALES_TAX_RATE *
          100
      ) / 100;

    const total =
      subtotal +
      deliveryFee +
      tax +
      tip;

    return {
      distanceMiles,

      estimatedDeliveryMinutes:
        getEstimatedTimeNumber(
          distanceMiles
        ),

      deliveryFee,

      tax,

      total,

      totals: {
        subtotal,
        deliveryFee,
        tax,
        tip,
        total,
      },
    };
  }, [
    subtotal,
    tip,
    store,
    address,
  ]);
}