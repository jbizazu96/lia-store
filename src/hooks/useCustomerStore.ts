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

import { DELIVERY_CONFIG } from "@/config/delivery";

import { productService } from "@/services/product/productService";
import { promotionService } from "@/services/promotion/promotionService";
import { storeService } from "@/services/store/storeService";
import { userService } from "@/services/user/userService";

import {
  getEstimatedTime,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";
import {
  getDrivingDistanceMiles,
  hasValidRouteCoordinates,
} from "@/services/delivery/routing";

import {
  calculateDeliveryFee,
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";

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

    /*
    |--------------------------------------------------------------------------
    | Load Store Page Data
    |--------------------------------------------------------------------------
    */

    const loadStoreData = async () => {
      try {
        setLoading(true);
        setError(null);

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

        /*
        |--------------------------------------------------------------------------
        | Load Products
        |--------------------------------------------------------------------------
        */

        const [
          storeProducts,
          categoryDefinitions,
        ] = await Promise.all([
          productService.getStoreProducts(
            storeId
          ),
          categoryService.getCategories(),
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
            const userLocation =
              await userService.getDefaultLocation(
                currentUser.uid
              );

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
              const drivingDistance = await getDrivingDistanceMiles(
                { latitude: userLocation.lat, longitude: userLocation.lng },
                {
                  latitude: domainStore.latitude,
                  longitude: domainStore.longitude,
                }
              );

              if (drivingDistance === null) {
                throw new Error("Unable to calculate the driving distance to this store.");
              }

              distance = drivingDistance;

              const deliveryPricing =
                calculateDeliveryFee(
                  distance,
                  0
                );

              deliveryFee =
                deliveryPricing.deliveryFee;

              estimatedTime =
                getEstimatedTimeNumber(
                  distance
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
                  distance
                ),

              estimatedPrepTime:
                estimatedTime || 15,

              estimatedDeliveryTime:
                getEstimatedTime(
                  distance
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

        const exceedsDeliveryRadius =
          distance >
          DELIVERY_CONFIG.MAX_RADIUS_MILES;

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
      unsubscribeProducts?.();
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
    error,
    showDistanceWarning,
    distanceValue,
    isOutsideDeliveryRadius:
      distanceValue >
      DELIVERY_CONFIG.MAX_RADIUS_MILES,
    closeDistanceWarning,
    openDistanceWarning,
  };
}
