/*
|--------------------------------------------------------------------------
| Customer Store View Model
|--------------------------------------------------------------------------
|
| Represents everything the customer-facing UI needs to display a store.
| This is NOT a Firestore document.
| It is built from the Store domain model plus computed data.
|
*/

import type { Store } from "@/types/store";
import type { Category } from "@/types/category";
import type { Promotion } from "@/types/promotion";

/**
 * Store model used by customer pages.
 */
export interface CustomerStore
  extends Omit<
    Store,
    | "ownerId"
    | "createdAt"
    | "updatedAt"
    | "stripeAccountId"
    | "businessType"
    | "registeredName"
    | "ein"
    | "businessStructure"
    | "photoIdUrl"
    | "storeFrontUrl"
    | "storeInsideUrl"
    | "stripeEmail"
    | "stripePhone"
    | "stripeBusinessType"
    | "stripeAccountType"
  > {
  /**
   * Distance from the customer.
   */
  distance: number;

  /**
   * Calculated delivery fee.
   */
  deliveryFee: number;

  /**
   * Estimated preparation time in minutes.
   */
  estimatedPrepTime: number;

  /**
   * Number of customer reviews.
   */
  reviewCount: number;

  /**
   * Product categories available in this store.
   */
  categories: Category[];

  /**
   * Promotions currently active.
   */
  promotions: Promotion[];

  /**
 * Display-ready delivery fee.
 */
deliveryFeeDisplay: string;

/**
 * Display-ready estimated delivery time.
 */
estimatedDeliveryTime: string;

/**
 * Whether this store is one of the customer's favorites.
 */
isFavorite: boolean;
}