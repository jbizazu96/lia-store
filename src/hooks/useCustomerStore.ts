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

import {
  categoryService,
} from "@/services/category/categoryService";
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
import {
  useMarketplacePricingPolicy,
} from "@/hooks/useMarketplacePricingPolicy";
import {useOrderDeliveryPolicy} from "@/hooks/useOrderDeliveryPolicy";

import type { Category } from "@/types/category";
import type { Product } from "@/types/product";
import type { CustomerStore } from "@/types/view-models/customerStore";
import type { Promotion } from "@/types/promotion";

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
 * Customers only see image-bearing products once the optimized image is
 * ready. Legacy and intentionally image-less products remain available.
 */
function isCustomerVisibleProduct(
  product: Product
): boolean {
  return (
    product.isAvailable &&
    (product.imageStatus === undefined ||
      product.imageStatus === "none" ||
      product.imageStatus === "ready")
  );
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
  const orderDeliveryPolicy = useOrderDeliveryPolicy();
  const marketplacePolicy = useMarketplacePricingPolicy();
  const [store, setStore] =
    useState<CustomerStore | null>(null);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] =
    useState(true);

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
    let unsubscribeProducts: (() => void) | null = null;
    let unsubscribeStore: (() => void) | null = null;

    /*
    |--------------------------------------------------------------------------
    | Load Store Page Data
    |--------------------------------------------------------------------------
    */

    const loadStoreData = async () => {
      /*
      - The store view needs the trusted pricing policy to calculate delivery
      - details. Do not finish loading while that independent policy request
      - is still pending: otherwise pages briefly render their empty-store
      - error state before this effect reruns with the policy.
       */
      if (!marketplacePolicy) {
        /*
         * This also covers a route change while the policy cache is being
         * refreshed. Keep the existing screen behind the loader rather than
         * briefly rendering the page's "store not found" fallback.
         */
        setLoading(true);
        setError(null);
        return;
      }

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

        const domainStore =
          await storeService.getStore(storeId);

        if (!domainStore) {
          if (isMounted) {
            setStore(null);
            setError("Store not found");
          }

          return;
        }

        if (!isStoreCustomerVisible(domainStore)) {
          if (isMounted) {
            setStore(null);
            setError("This store is not currently available.");
          }

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Load Products
        |--------------------------------------------------------------------------
        */

        const [
          storeProducts,
          categoryDefinitions,
          customerLocation,
        ] = await Promise.all([
          productService.getStoreProducts(
            storeId
          ),
          categoryService.getCategories(),
          customerLocationRequest,
        ]);

        const customerProducts =
          storeProducts.filter(
            isCustomerVisibleProduct
          );

        const storeCategories =
          categoryService.groupCategoriesWithProducts(
            categoryDefinitions,
            customerProducts
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
                  marketplacePolicy,
                );

              deliveryFee =
                deliveryPricing.deliveryFee;

              estimatedTime =
                getEstimatedTimeNumber(
                  distance,
                  orderDeliveryPolicy,
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
                  marketplacePolicy,
                ),

              estimatedPrepTime:
                estimatedTime ||
                orderDeliveryPolicy?.defaultPreparationMinutes ||
                0,

              estimatedDeliveryTime:
                getEstimatedTime(
                  distance,
                  orderDeliveryPolicy,
                ),

              reviewCount: 0,

              categories:
                storeCategories,

              promotions:
                getActiveStorePromotions(
                  customerProducts
                ),

              isFavorite: false,
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
        setProducts(customerProducts);
        setCategories(storeCategories);

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

        const exceedsDeliveryRadius =
          distance >
          marketplacePolicy.maxRadiusMiles;

        setDistanceValue(distance);

        setShowDistanceWarning(
          exceedsDeliveryRadius &&
          !skipDistanceWarning
        );

        unsubscribeProducts =
          productService.listenToStoreProducts(
            storeId,
            (liveProducts) => {
              if (!isMounted) {
                return;
              }

              const visibleProducts =
                liveProducts.filter(
                  isCustomerVisibleProduct
                );

              setProducts(visibleProducts);
              setStore((currentStore) =>
                currentStore
                  ? {
                    ...currentStore,
                    promotions:
                      getActiveStorePromotions(
                        visibleProducts
                      ),
                  }
                  : currentStore
              );
              setCategories(
                categoryService.groupCategoriesWithProducts(
                  categoryDefinitions,
                  visibleProducts
                )
              );
            },
            (listenerError) => {
              console.error(
                "Error receiving customer store products:",
                listenerError
              );
            }
          );
      } catch (loadError) {
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
      unsubscribeProducts?.();
    };
  }, [
    storeId,
    distanceParam,
    deliveryFeeParam,
    estimatedTimeParam,
    skipDistanceWarning,
    marketplacePolicy,
    orderDeliveryPolicy,
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
    error,
    showDistanceWarning,
    distanceValue,
    isOutsideDeliveryRadius:
      distanceValue >
      (marketplacePolicy?.maxRadiusMiles ?? Infinity),
    closeDistanceWarning,
    openDistanceWarning,
  };
}
