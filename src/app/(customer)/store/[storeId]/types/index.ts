/*
  Types for the customer store page.
*/

export interface Store {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  latitude: number;
  longitude: number;
  distance: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedPrepTime: number;
  isOpen: boolean;
  rating: number;
  reviewCount: number;
  categories: Category[];
  promotions: Promotion[];
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  products: Product[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  displayPrice: number;
  imageUrl: string;
  category: string;
  reviewCount: number;
  stock: number;
  rating: number;
  soldCount: number;
  brand: string;
  size?: {
    value: number;
    unit: string;
  };
  promotion?: {
    type: string;
    description: string;
    discountAmount?: number;
  };
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  type: "discount" | "bogo" | "free_shipping";
}