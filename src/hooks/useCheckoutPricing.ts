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
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";
import { getDrivingDistanceMiles } from "@/services/delivery/routing";

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

  isCalculatingDistance: boolean;

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
  const [distanceMiles, setDistanceMiles] = useState(0);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  useEffect(() => {
    if (!store || address?.latitude === undefined || address?.longitude === undefined) {
      setDistanceMiles(0);
      setIsCalculatingDistance(false);
      return;
    }

    let isMounted = true;
    setIsCalculatingDistance(true);

    getDrivingDistanceMiles(
      { latitude: store.latitude, longitude: store.longitude },
      { latitude: address.latitude, longitude: address.longitude }
    )
      .then((drivingDistance) => {
        if (isMounted) {
          setDistanceMiles(drivingDistance ?? 0);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCalculatingDistance(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [store, address?.latitude, address?.longitude]);

  return useMemo(() => {
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

      isCalculatingDistance,

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
    distanceMiles,
    isCalculatingDistance,
  ]);
}
