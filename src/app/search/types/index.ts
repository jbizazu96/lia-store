/*
  Search page types.
*/

import type {
  ProductImageVariants,
} from "@/types/product";

export interface SearchResult {
  resultType: "product" | "store";
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  imageVariants?: ProductImageVariants;
  category: string;
  stock: number;
  storeId: string;
  storeName: string;
  storeRating: number;
  storeDistance: number;
  deliveryFee: number;
  estimatedTime: number;
  zoneAccessAllowed?: boolean;
  zoneAccessType?: string;
  storeLogo?: string;
  storeIsOpen?: boolean;
  storeAddress?: string;
  storePhone?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  promotion?: {
    type: string;
    description: string;
    discountAmount?: number;
  };
  size?: {
    value: number;
    unit: string;
  };
}

export interface StoreData {
  id: string;
  name: string;
  logoUrl?: string;
  rating: number;
  latitude: number;
  longitude: number;
  address: string;
  phone: string;
  deliveryFee: number;
  estimatedPrepTime: number;
  isOpen: boolean;
}

export interface StoreGroup {
  storeId: string;
  storeName: string;
  storeRating: number;
  storeDistance: number;
  deliveryFee: number;
  estimatedTime: number;
  storeLogo?: string;
  isOpen: boolean;
  storeAddress: string;
  storePhone: string;
  storeLatitude: number;
  storeLongitude: number;
  /* True when the store itself matched the customer's query. */
  matchesStore?: boolean;
  products: SearchResult[];
}
