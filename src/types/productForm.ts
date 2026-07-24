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

/*
|--------------------------------------------------------------------------
| Product Gallery Upload
|--------------------------------------------------------------------------
|
| Represents one image selected by the store owner before upload.
|
| These objects only exist in the browser.
|
*/

export type ProductImageRole =
  | "front"
  | "back";

export interface ProductGalleryImageSelection {
  /**
   * Front or back product image.
   */
  role: ProductImageRole;

  /**
   * Existing Firestore gallery-image document ID.
   *
   * Null means this is a newly selected image for a new product.
   */
  existingImageId: string | null;

  /**
   * Newly selected browser file.
   *
   * Null means the existing processed image should remain unchanged.
   */
  file: File | null;

  /**
   * Existing Firebase URL or temporary browser preview URL.
   */
  previewUrl: string;

  /**
   * Tracks whether an existing gallery image was intentionally removed.
   */
  markedForRemoval?: boolean;
}