"use client";

/*
|--------------------------------------------------------------------------
| useCustomerStore Hook
|--------------------------------------------------------------------------
|
| Loads and prepares all data required by the customer store page.
|
| Responsibilities:
| - Load the store through storeService.
| - Load products through productService.
| - Group products into categories.
| - Load the customer's default location.
| - Calculate distance, delivery fee, and estimated time.
| - Create the CustomerStore view model.
| - Determine whether the distance warning should appear.
|
| The page remains responsible for rendering UI and navigation.
|
*/

import {
  useEffect,
  useState,
} from "react";

import { auth } from "@/lib/firebase";

import { storeMapper } from "@/mappers/storeMapper";

import { productService } from "@/services/product/productService";
import { promotionService } from "@/services/promotion/promotionService";
import { storeService } from "@/services/store/storeService";
import { isStoreCustomerVisible } from "@/services/store/storeAvailability";
import { userService } from "@/services/user/userService";

import {
  getEstimatedTime,
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
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";
import {marketplacePricingClientService, type ApplicableMarketplacePricing} from "@/services/pricing/marketplacePricingClientService";

import type { Category } from "@/types/category";
import type { Product } from "@/types/product";
import type { CustomerStore } from "@/types/view-models/customerStore";
import type { Promotion } from "@/types/promotion";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCustomerStoreParams {
  storeId: string;

  distanceParam?: string | null;

  deliveryFeeParam?: string | null;

  estimatedTimeParam?: string | null;

  skipDistanceWarning?: boolean;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCustomerStoreResult {
  store: CustomerStore | null;

  categories: Category[];

  products: Product[];

  loading: boolean;

  /* The store ID whose initial request has reached a terminal result. */
  resolvedStoreId: string | null;

  error: string | null;

  showDistanceWarning: boolean;

  distanceValue: number;

  isOutsideDeliveryRadius: boolean;

  closeDistanceWarning: () => void;

  openDistanceWarning: () => void;
}

/*
|--------------------------------------------------------------------------
| Safe Number Parsing
|--------------------------------------------------------------------------
|
| URL parameters arrive as strings. These helpers prevent NaN values from
| entering our pricing and distance calculations.
|
*/

function parseNumber(
  value: string | null | undefined
): number {
  if (!value) {
    return 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue)
    ? parsedValue
    : 0;
}

/**
 * Product promotions are the store promotions customers can currently use.
 * Keep every active product offer as its own carousel item so a store can
 * advertise multiple discounts, BOGO offers, or delivery offers at once.
 */
function getActiveStorePromotions(
  products: Product[]
): Promotion[] {
  return products.flatMap((product) => {
    const promotion = product.promotion;

    if (!promotion || !promotionService.isActive(promotion)) {
      return [];
    }

    const label = promotionService.getLabel(promotion);
    const title = promotion?.title?.trim();
    const description = promotion?.description?.trim();

    return [{
      ...promotion,
      id: `${product.id}-${promotion?.id || "promotion"}`,
      title: title || label || "Store special",
      description: description || `${label || "Special offer"} on ${product.name}.`,
      imageUrl: promotion?.imageUrl || "",
    }];
  });
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCustomerStore({
  storeId,
  distanceParam,
  deliveryFeeParam,
  estimatedTimeParam,

  skipDistanceWarning = false,
}: UseCustomerStoreParams): UseCustomerStoreResult {
  const [applicablePricing, setApplicablePricing] =
    useState<ApplicableMarketplacePricing | null>(null);
  const marketplacePolicy = applicablePricing?.policy ?? null;
  const [store, setStore] =
    useState<CustomerStore | null>(null);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [resolvedStoreId, setResolvedStoreId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [
    showDistanceWarning,
    setShowDistanceWarning,
  ] = useState(false);

  const [distanceValue, setDistanceValue] =
    useState(0);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeStore: (() => void) | null = null;
    let removeCatalogRefresh: (() => void) | null = null;

    /*
    |--------------------------------------------------------------------------
    | Load Store Page Data
    |--------------------------------------------------------------------------
    */

    const loadStoreData = async () => {
      const storeTrace = startCustomerPerformanceTrace("customer_store_ready");

      try {
        setLoading(true);
        setError(null);

        /*
         * The customer address is needed only when Home did not already pass
         * a route. Start this independent request immediately so it overlaps
         * with the public store/profile reads below.
         */
        const initialDistance = parseNumber(distanceParam);
        const customerLocationRequest = initialDistance > 0 || !auth.currentUser
          ? Promise.resolve(null)
          : userService.getDefaultLocation(auth.currentUser.uid);

        /*
        |--------------------------------------------------------------------------
        | Load Domain Store
        |--------------------------------------------------------------------------
        */

        const [domainStore, storeCategories, customerLocation, pricingBootstrap] =
          await Promise.all([
            storeService.getStore(storeId),
            productService.getStoreProductPreview(storeId),
            customerLocationRequest,
            marketplacePricingClientService.getHomeBootstrap([storeId]),
          ]);

        const currentPricing = pricingBootstrap.byStoreId[storeId] ?? {
          policy: pricingBootstrap.policy,
          decision: null,
          pickupDecision: null,
          storePickupEnabled: false,
        };
        const currentPolicy = currentPricing.policy;
        const currentOrderDeliveryPolicy = pricingBootstrap.orderDeliveryPolicy;

        if (!domainStore) {
          if (isMounted) {
            setStore(null);
            setError("Store not found");
            setResolvedStoreId(storeId);
          }
          storeTrace.stop({status: "not_found"});

          return;
        }

        if (!isStoreCustomerVisible(domainStore)) {
          if (isMounted) {
            setStore(null);
            setError("This store is not currently available.");
            setResolvedStoreId(storeId);
          }
          storeTrace.stop({status: "unavailable"});

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Load Products
        |--------------------------------------------------------------------------
        */

        const previewProducts = storeCategories.flatMap(
          (category) => category.products,
        );

        /*
        |--------------------------------------------------------------------------
        | Read Values Passed From Home Page
        |--------------------------------------------------------------------------
        |
        | These values prevent unnecessary recalculation when the home page
        | already knows the customer's distance and delivery pricing.
        |
        */

        let distance =
          parseNumber(distanceParam);

        let deliveryFee =
          parseNumber(deliveryFeeParam);

        let estimatedTime =
          parseNumber(estimatedTimeParam);

        /*
        |--------------------------------------------------------------------------
        | Calculate Missing Delivery Information
        |--------------------------------------------------------------------------
        */

        if (distance <= 0) {
          const currentUser =
            auth.currentUser;

          if (currentUser) {
            const userLocation = customerLocation;

            const hasUserLocation =
              userLocation !== null &&
              hasValidRouteCoordinates({
                latitude: userLocation.lat,
                longitude: userLocation.lng,
              });

            const hasStoreLocation =
              hasValidRouteCoordinates({
                latitude: domainStore.latitude,
                longitude: domainStore.longitude,
              });

            if (!hasUserLocation) {
              throw new Error(
                "Your delivery address needs valid map coordinates. Please update and verify your address."
              );
            }

            if (!hasStoreLocation) {
              throw new Error(
                "This store address needs valid map coordinates before delivery can be calculated."
              );
            }

            {
              const route =
                await getStoreDeliveryRoute(
                  storeId,
                  {
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                  }
                );

              if (route === null) {
                throw new Error("Unable to calculate the driving distance to this store.");
              }

              distance = route.distanceMiles;

              const deliveryPricing =
                calculateDeliveryFee(
                  distance,
                  0,
                  currentPolicy,
                  currentPolicy.peakSurchargeEnabled,
                  currentPricing.decision?.zoneAccessType !== "customer_order_zone",
                );

              deliveryFee =
                deliveryPricing.deliveryFee;

              estimatedTime =
                getEstimatedTimeNumber(
                  distance,
                  currentOrderDeliveryPolicy,
                );
            }
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Create Customer Store View Model
        |--------------------------------------------------------------------------
        */

        const customerStore =
          storeMapper.toCustomerStore(
            domainStore,
            {
              distance,

              deliveryFee,

              deliveryFeeDisplay:
                getDeliveryFeeDisplay(
                  distance,
                  currentPolicy,
                  currentPricing.decision?.zoneAccessType !== "customer_order_zone",
                ),

              estimatedPrepTime:
                estimatedTime ||
                currentOrderDeliveryPolicy.defaultPreparationMinutes ||
                0,

              estimatedDeliveryTime:
                getEstimatedTime(
                  distance,
                  currentOrderDeliveryPolicy,
                ),

              categories:
                storeCategories,

              promotions:
                getActiveStorePromotions(
                  previewProducts
                ),

              isFavorite: false,
              maxDeliveryMiles: currentPolicy.maxRadiusMiles,
              zoneAccessAllowed: currentPricing.decision?.allowed ?? true,
              zoneAccessType: currentPricing.decision?.zoneAccessType ?? "default_pricing",
              pickupZoneAccessAllowed: currentPricing.pickupDecision?.allowed ?? false,
              storePickupEnabled: currentPricing.storePickupEnabled,
            }
          );

        /*
        |--------------------------------------------------------------------------
        | Update Hook State
        |--------------------------------------------------------------------------
        */

        if (!isMounted) {
          return;
        }

        setStore(customerStore);
        setApplicablePricing(currentPricing);
        setProducts(previewProducts);
        setCategories(storeCategories);
        setResolvedStoreId(storeId);

        /*
         * The store page uses the public projection listener so marketplace
         * status, opening state, logo, and banner update in real time. Keep
         * customer-specific distance and already-loaded catalog state intact.
         */
        unsubscribeStore = storeService.listenToStore(
          storeId,
          (updatedStore) => {
            if (!isMounted) {
              return;
            }

            if (!updatedStore || !isStoreCustomerVisible(updatedStore)) {
              setStore(null);
              setProducts([]);
              setCategories([]);
              setError("This store is not currently available.");
              return;
            }

            setStore((currentStore) => {
              if (!currentStore) {
                return currentStore;
              }

              return storeMapper.toCustomerStore(
                updatedStore,
                {
                  distance: currentStore.distance,
                  deliveryFee: currentStore.deliveryFee,
                  deliveryFeeDisplay: currentStore.deliveryFeeDisplay,
                  estimatedPrepTime: currentStore.estimatedPrepTime,
                  estimatedDeliveryTime:
                    currentStore.estimatedDeliveryTime,
                  reviewCount: currentStore.reviewCount,
                  categories: currentStore.categories,
                  promotions: currentStore.promotions,
                  isFavorite: currentStore.isFavorite,
                  maxDeliveryMiles: currentStore.maxDeliveryMiles,
                  zoneAccessAllowed: currentStore.zoneAccessAllowed,
                  zoneAccessType: currentStore.zoneAccessType,
                  pickupZoneAccessAllowed: currentStore.pickupZoneAccessAllowed,
                  storePickupEnabled: currentStore.pickupEnabled === true,
                }
              );
            });
          },
          (listenerError) => {
            console.error(
              "Error receiving customer store updates:",
              listenerError
            );
          }
        );

        /* Refresh only the bounded category previews when a customer returns
         * to the app. This catches stock and image changes without installing
         * an unbounded listener over the store's complete inventory. */
        let lastCatalogRefreshAt = Date.now();
        const refreshCatalogWhenVisible = () => {
          if (document.visibilityState !== "visible" ||
              Date.now() - lastCatalogRefreshAt < 30_000) return;
          lastCatalogRefreshAt = Date.now();
          void productService.getStoreProductPreview(storeId, true).then((updatedCategories) => {
            if (!isMounted) return;
            const updatedProducts = updatedCategories.flatMap((category) => category.products);
            setCategories(updatedCategories);
            setProducts(updatedProducts);
            setStore((current) => current ? {
              ...current,
              categories: updatedCategories,
              promotions: getActiveStorePromotions(updatedProducts),
            } : current);
          }).catch((refreshError) => {
            console.error("Unable to refresh the store catalog preview:", refreshError);
          });
        };
        document.addEventListener("visibilitychange", refreshCatalogWhenVisible);
        window.addEventListener("focus", refreshCatalogWhenVisible);
        removeCatalogRefresh = () => {
          document.removeEventListener("visibilitychange", refreshCatalogWhenVisible);
          window.removeEventListener("focus", refreshCatalogWhenVisible);
        };

        const exceedsDeliveryRadius =
          currentPricing.decision?.zoneAccessType !== "customer_order_zone" &&
          distance > currentPolicy.maxRadiusMiles;
        const cannotOrder = exceedsDeliveryRadius || currentPricing.decision?.allowed === false;

        setDistanceValue(distance);

        setShowDistanceWarning(
          cannotOrder &&
          !skipDistanceWarning
        );
        storeTrace.stop({status: "success", category_count: String(storeCategories.length)});

      } catch (loadError) {
        storeTrace.stop({status: "error"});
        console.error(
          "Error loading customer store:",
          loadError
        );

        if (isMounted) {
          setStore(null);
          setProducts([]);
          setCategories([]);

          setError(
            "Unable to load this store"
          );
          setResolvedStoreId(storeId);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadStoreData();

    /*
    |--------------------------------------------------------------------------
    | Effect Cleanup
    |--------------------------------------------------------------------------
    |
    | Prevents state updates if the customer leaves the page before an
    | asynchronous request finishes.
    |
    */

    return () => {
      isMounted = false;
      unsubscribeStore?.();
      removeCatalogRefresh?.();
    };
  }, [
    storeId,
    distanceParam,
    deliveryFeeParam,
    estimatedTimeParam,
    skipDistanceWarning,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Close Distance Warning
  |--------------------------------------------------------------------------
  */

  const closeDistanceWarning = () => {
    setShowDistanceWarning(false);
  };

  const openDistanceWarning = () => {
    setShowDistanceWarning(true);
  };

  return {
    store,
    categories,
    products,
    loading,
    resolvedStoreId,
    error,
    showDistanceWarning,
    distanceValue,
    isOutsideDeliveryRadius:
      applicablePricing?.decision?.allowed === false ||
      (applicablePricing?.decision?.zoneAccessType !== "customer_order_zone" &&
        distanceValue > (marketplacePolicy?.maxRadiusMiles ?? Infinity)),
    closeDistanceWarning,
    openDistanceWarning,
  };
}
