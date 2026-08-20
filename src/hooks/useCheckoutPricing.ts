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
import {
  hasValidRouteCoordinates,
} from "@/services/delivery/routing";
import {
  getStoreDeliveryRoute,
} from "@/services/delivery/deliveryRoutesClientService";

import {
  calculateDeliveryFee,
} from "@/services/delivery/deliveryPricing";
import {
  useMarketplacePricingPolicy,
} from "@/hooks/useMarketplacePricingPolicy";
import {useOrderDeliveryPolicy} from "@/hooks/useOrderDeliveryPolicy";

import type {
  Store,
} from "@/types/store";

import type {
  CheckoutAddress,
  CheckoutTotals,
} from "@/app/checkout/types";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";

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

  distanceError: string | null;

  estimatedDeliveryMinutes: number;

  deliveryFee: number;

  /*
    Customer-facing platform fee retained by LIA.
  */
  serviceFee: number;

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
  const marketplacePolicy =
    useMarketplacePricingPolicy(store?.id);
  const orderDeliveryPolicy = useOrderDeliveryPolicy(store?.id);
  const [distanceMiles, setDistanceMiles] = useState(0);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  useEffect(() => {
    if (!store || address?.latitude === undefined || address?.longitude === undefined) {
      queueMicrotask(() => {
        setDistanceMiles(0);
        setIsCalculatingDistance(false);
        setDistanceError(
          address
            ? "Your delivery address needs valid map coordinates. Please update it before checkout."
            : null
        );
      });
      return;
    }

    if (!hasValidRouteCoordinates({
      latitude: store.latitude,
      longitude: store.longitude,
    })) {
      queueMicrotask(() => {
        setDistanceMiles(0);
        setIsCalculatingDistance(false);
        setDistanceError(
          "This store address is not ready for delivery calculations."
        );
      });
      return;
    }

    if (!hasValidRouteCoordinates({
      latitude: address.latitude,
      longitude: address.longitude,
    })) {
      queueMicrotask(() => {
        setDistanceMiles(0);
        setIsCalculatingDistance(false);
        setDistanceError(
          "Your delivery address needs valid map coordinates. Please update it before checkout."
        );
      });
      return;
    }

    let isMounted = true;
    const pricingTrace = startCustomerPerformanceTrace("customer_checkout_pricing_ready");
    queueMicrotask(() => {
      if (!isMounted) return;
      setIsCalculatingDistance(true);
      setDistanceError(null);
    });

    getStoreDeliveryRoute(
      store.id,
      { latitude: address.latitude, longitude: address.longitude }
    )
      .then((route) => {
        if (isMounted) {
          if (route === null) {
            setDistanceMiles(0);
            setDistanceError(
              "We could not calculate a driving route for this delivery address. Please try again shortly."
            );
            return;
          }

          setDistanceMiles(route.distanceMiles);
          pricingTrace.stop({status: "success"});
        }
      })
      .catch(() => {
        pricingTrace.stop({status: "error"});
        if (isMounted) {
          setDistanceMiles(0);
          setDistanceError(
            "We could not calculate a driving route for this delivery address. Please try again shortly."
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCalculatingDistance(false);
        }
      });

    return () => {
      isMounted = false;
      pricingTrace.stop({status: "cancelled"});
    };
  }, [store, address]);

  return useMemo(() => {
    const pricing = marketplacePolicy
      ? calculateDeliveryFee(distanceMiles, subtotal, marketplacePolicy)
      : null;

    const deliveryFee =
      pricing?.deliveryFee ?? 0;

    const originalDeliveryFee = Math.round(
      (
        (pricing?.breakdown.distanceFee ?? 0) +
        (pricing?.breakdown.peakSurcharge ?? 0)
      ) * 100
    ) / 100;
    
    /*
    |--------------------------------------------------------------------------
    | Service Fee
    |--------------------------------------------------------------------------
    |
    | calculateDeliveryFee() applies the centralized:
    |
    | - 5% percentage
    | - $1.99 minimum
    | - $9.99 maximum
    |
    | These are MVP fallback values. The future admin panel will manage the
    | active pricing rules.
    |
    */

    const serviceFee =
      pricing?.serviceFee ?? 0;

    const tax =
      Math.round(
        subtotal *
          (marketplacePolicy?.salesTaxRate ?? 0) *
          100
      ) / 100;

    const total =
      subtotal +
      deliveryFee +
      serviceFee +
      tax +
      tip;

    return {
      distanceMiles,

      isCalculatingDistance,

      distanceError,

      estimatedDeliveryMinutes:
        getEstimatedTimeNumber(
          distanceMiles
          , orderDeliveryPolicy
        ),

      deliveryFee,

      serviceFee,
      
      tax,

      total,

      totals: {
        subtotal,
        deliveryFee,
        originalDeliveryFee,
        serviceFee,
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
    distanceError,
    marketplacePolicy,
    orderDeliveryPolicy,
  ]);
}
