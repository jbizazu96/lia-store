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
  maxDeliveryMiles?: number;
  zoneAccessAllowed?: boolean;
  zoneAccessType?: CustomerStore["zoneAccessType"];
  pickupZoneAccessAllowed?: boolean;
  storePickupEnabled?: boolean;
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
      reviewCount: options.reviewCount ?? store.reviewCount ?? 0,

      categories: options.categories ?? [],

      promotions: options.promotions ?? [],
      isFavorite: options.isFavorite ?? false,
      maxDeliveryMiles: options.maxDeliveryMiles ?? 0,
      zoneAccessAllowed: options.zoneAccessAllowed ?? true,
      zoneAccessType: options.zoneAccessType ?? "default_pricing",
      pickupZoneAccessAllowed: options.pickupZoneAccessAllowed ?? false,
      pickupEnabled: options.storePickupEnabled ?? store.pickupEnabled,
    };
  },
};
