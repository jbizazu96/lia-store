/*
  Search page types.
*/

export interface SearchResult {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  stock: number;
  storeId: string;
  storeName: string;
  storeRating: number;
  storeDistance: number;
  deliveryFee: number;
  estimatedTime: number;
  storeLogo?: string;
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
  deliveryFee: number;
  estimatedPrepTime: number;
  isOpen: boolean;
  status: string;
}

export interface StoreGroup {
  storeId: string;
  storeName: string;
  storeRating: number;
  storeDistance: number;
  deliveryFee: number;
  estimatedTime: number;
  storeLogo?: string;
  products: SearchResult[];
}