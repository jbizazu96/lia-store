import type { Store } from "@/types/store";
import type { Category } from "@/types/category";
import type { Promotion } from "@/types/promotion";
import type { CustomerStore } from "@/types/view-models/customerStore";

interface CustomerStoreOptions {
  distance?: number;

  deliveryFee?: number;
  deliveryFeeDisplay?: string;

  estimatedPrepTime?: number;
  estimatedDeliveryTime?: string;

  reviewCount?: number;

  categories?: Category[];
  promotions?: Promotion[];

  isFavorite?: boolean;
}

/**
 * Store Mapper
 *
 * Converts a Store domain model into the
 * CustomerStore view model used by customer pages.
 */
export const storeMapper = {
  toCustomerStore(
    store: Store,
    options: CustomerStoreOptions = {}
  ): CustomerStore {

    return {
      ...store,

      distance: options.distance ?? 0,
      deliveryFee: options.deliveryFee ?? 0,
      deliveryFeeDisplay: options.deliveryFeeDisplay ?? "$0.00",
      estimatedPrepTime: options.estimatedPrepTime ?? 15,
      estimatedDeliveryTime: options.estimatedDeliveryTime ?? "15 min",
      reviewCount: options.reviewCount ?? 0,

      categories: options.categories ?? [],

      promotions: options.promotions ?? [],
      isFavorite: options.isFavorite ?? false,
    };
  },
};