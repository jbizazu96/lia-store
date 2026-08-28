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
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  auth,
} from "@/lib/firebase";

import {
  calculateDeliveryFee,
} from "@/services/delivery/deliveryPricing";
import {
  useMarketplacePricingPolicy,
} from "@/hooks/useMarketplacePricingPolicy";
import {
  getStoreDeliveryRoute,
} from "@/services/delivery/deliveryRoutesClientService";
import {
  userService,
} from "@/services/user/userService";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";
import type {FulfillmentType} from "@/types/fulfillment";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCartPricingParams {
  subtotal: number;

  storeId?: string;
  fulfillmentType: FulfillmentType;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCartPricingResult {
  subtotal: number;

  deliveryFee: number;

  /* Delivery price before an eligible free-delivery promotion is applied. */
  originalDeliveryFee: number;

  /*
    Customer-facing platform fee paid to LIA.

    The amount is calculated from the centralized pricing configuration.
  */
  serviceFee: number;

  tax: number;

  total: number;

  amountUntilFreeDelivery: number;

  hasFreeDelivery: boolean;

  distanceMiles: number | null;

  isCalculatingDelivery: boolean;

  deliveryError: string | null;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCartPricing({
  subtotal,
  storeId,
  fulfillmentType,
}: UseCartPricingParams): UseCartPricingResult {
  const marketplacePolicy =
    useMarketplacePricingPolicy(fulfillmentType === "pickup" ? undefined : storeId);
  const [
    distanceMiles,
    setDistanceMiles,
  ] = useState<number | null>(null);

  const [
    isCalculatingDelivery,
    setIsCalculatingDelivery,
  ] = useState(false);

  const [
    deliveryError,
    setDeliveryError,
  ] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!storeId) {
      const resetTimeout = window.setTimeout(() => {
        if (!isMounted) {
          return;
        }

        setDistanceMiles(null);
        setIsCalculatingDelivery(false);
        setDeliveryError(null);
      }, 0);

      return () => {
        isMounted = false;
        window.clearTimeout(resetTimeout);
      };
    }

    const user = auth.currentUser;

    if (!user) {
      const resetTimeout = window.setTimeout(() => {
        if (!isMounted) {
          return;
        }

        setDistanceMiles(null);
        setIsCalculatingDelivery(false);
        setDeliveryError(
          "Sign in to calculate your delivery fee."
        );
      }, 0);

      return () => {
        isMounted = false;
        window.clearTimeout(resetTimeout);
      };
    }

    const loadDeliveryRoute = async () => {
      const pricingTrace = startCustomerPerformanceTrace("customer_cart_pricing_ready");
      setIsCalculatingDelivery(true);
      setDeliveryError(null);

      try {
        const location = await userService
          .getDefaultLocation(user.uid);

        if (!location) {
          throw new Error(
            "Add a verified delivery address to calculate your delivery fee."
          );
        }

        const route = await getStoreDeliveryRoute(
          storeId,
          {
            latitude: location.lat,
            longitude: location.lng,
          }
        );

        if (!isMounted) {
          return;
        }

        if (!route) {
          throw new Error(
            "We could not calculate a driving route for your delivery address."
          );
        }

        setDistanceMiles(route.distanceMiles);
        pricingTrace.stop({status: "success"});
      } catch (error: unknown) {
        pricingTrace.stop({status: "error"});
        if (!isMounted) {
          return;
        }

        setDistanceMiles(null);
        setDeliveryError(
          error instanceof Error
            ? error.message
            : "We could not calculate your delivery fee."
        );
      } finally {
        if (isMounted) {
          setIsCalculatingDelivery(false);
        }
      }
    };

    void loadDeliveryRoute();

    return () => {
      isMounted = false;
    };
  }, [storeId, fulfillmentType]);

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

    const deliveryPricing = marketplacePolicy
      ? calculateDeliveryFee(
          distanceMiles ?? 0,
          subtotal,
          marketplacePolicy,
          marketplacePolicy.peakSurchargeEnabled,
          true,
          fulfillmentType,
        )
      : null;

    const deliveryFee = fulfillmentType === "pickup"
      ? 0
      : deliveryPricing?.deliveryFee ?? 0;

    /*
      Keep the pre-promotion price for the cart UI. When delivery is free,
      customers can see the value of the waived fee instead of only $0.00.
    */
    const originalDeliveryFee = fulfillmentType === "pickup" ? 0 : Math.round(
      (
        (deliveryPricing?.breakdown.distanceFee ?? 0) +
        (deliveryPricing?.breakdown.peakSurcharge ?? 0)
      ) * 100
    ) / 100;

      /*
      |--------------------------------------------------------------------------
      | Service Fee
      |--------------------------------------------------------------------------
      |
      | calculateDeliveryFee() already applies the configured:
      |
      | - Percentage
      | - Minimum fee
      | - Maximum fee
      |
      | Although this service calculates multiple marketplace values, the cart
      | uses only the customer-facing delivery and service fees here.
      |
      */

      const serviceFee =
        deliveryPricing?.serviceFee ?? 0;
    /*
    |--------------------------------------------------------------------------
    | Tax
    |--------------------------------------------------------------------------
    */

    /* Stripe Tax supplies the authoritative amount during payment preparation. */
    const tax = 0;

    /*
    |--------------------------------------------------------------------------
    | Total
    |--------------------------------------------------------------------------
    */

    const total =
      subtotal +
      deliveryFee +
      serviceFee +
      tax;

    /*
    |--------------------------------------------------------------------------
    | Free Delivery Progress
    |--------------------------------------------------------------------------
    */

    const amountUntilFreeDelivery =
      Math.max(
        0,
        ((marketplacePolicy?.freeDeliveryMinimumCents ?? 0) / 100) -
          subtotal
      );

    return {
      subtotal,

      deliveryFee,

      originalDeliveryFee,

      serviceFee,

      tax,

      total,

      amountUntilFreeDelivery,

      hasFreeDelivery:
        fulfillmentType === "delivery" &&
        deliveryPricing?.isFreeDelivery === true &&
        subtotal > 0,

      distanceMiles,

      isCalculatingDelivery,

      deliveryError,
    };
  }, [
    subtotal,
    distanceMiles,
    isCalculatingDelivery,
    deliveryError,
    marketplacePolicy,
    fulfillmentType,
      ]);
}
