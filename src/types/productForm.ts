/*
|--------------------------------------------------------------------------
| Product Form Types
|--------------------------------------------------------------------------
|
| Shared types used by:
|
| - Add Product
| - Edit Product
| - Product duplication
| - Future admin product editor
|
*/

import type {
  Promotion,
} from "@/types/promotion";

/*
|--------------------------------------------------------------------------
| Product Size
|--------------------------------------------------------------------------
*/

export interface ProductSize {
  value: number;

  unit: string;
}

/*
|--------------------------------------------------------------------------
| Product Form Data
|--------------------------------------------------------------------------
*/

export interface ProductFormData {
  name: string;

  description: string;

  category: string;

  brand: string;

  price: number;

  stock: number;

  sku: string;

  imageUrl: string;

  isAvailable: boolean;

  featured: boolean;

  size: ProductSize | null;

  promotion: Promotion | null;
}
