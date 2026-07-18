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

import { categoryMapper } from "@/mappers/categoryMapper";
import { storeMapper } from "@/mappers/storeMapper";

import { DELIVERY_CONFIG } from "@/config/delivery";

import { productService } from "@/services/product/productService";
import { storeService } from "@/services/store/storeService";
import { userService } from "@/services/user/userService";

import {
  calculateDistance,
  getEstimatedTime,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";

import {
  calculateDeliveryFee,
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";

import type { Category } from "@/types/category";
import type { Product } from "@/types/product";
import type { CustomerStore } from "@/types/view-models/customerStore";

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

  closeDistanceWarning: () => void;
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

        const storeProducts =
          await productService.getStoreProducts(
            storeId
          );

        const storeCategories =
          categoryMapper.fromProducts(
            storeProducts
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
              userLocation !== null;

            const hasStoreLocation =
              Number.isFinite(
                domainStore.latitude
              ) &&
              Number.isFinite(
                domainStore.longitude
              );

            if (
              hasUserLocation &&
              hasStoreLocation
            ) {
              distance = calculateDistance(
                userLocation.lat,
                userLocation.lng,
                domainStore.latitude,
                domainStore.longitude
              );

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

              promotions: [
                {
                  id: "promo1",

                  title:
                    "Free Delivery",

                  description:
                    "Free delivery on qualifying orders",

                  imageUrl: "",

                  type:
                    "free_shipping",
                },
              ],

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
        setProducts(storeProducts);
        setCategories(storeCategories);

        const exceedsDeliveryRadius =
          distance >
          DELIVERY_CONFIG.MAX_RADIUS_MILES;

        setDistanceValue(distance);

        setShowDistanceWarning(
          exceedsDeliveryRadius
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
    };
  }, [
    storeId,
    distanceParam,
    deliveryFeeParam,
    estimatedTimeParam,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Close Distance Warning
  |--------------------------------------------------------------------------
  */

  const closeDistanceWarning = () => {
    setShowDistanceWarning(false);
  };

  return {
    store,
    categories,
    products,
    loading,
    error,
    showDistanceWarning,
    distanceValue,
    closeDistanceWarning,
  };
}