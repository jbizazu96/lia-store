/*
  Types for the customer store page.
*/

import type { Store } from "@/types/store";
export interface ScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
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