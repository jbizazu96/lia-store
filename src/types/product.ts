/*
|--------------------------------------------------------------------------
| Product Domain Model
|--------------------------------------------------------------------------
|
| Shared product model used throughout LIA.
|
| This model is used by:
|
| • Customer store pages
| • Search
| • Cart
| • Store inventory
| • Admin panel
| • Order creation
|
| Pages should not create separate Product interfaces.
|
*/

import type { Promotion } from "./promotion";



/**
 * Product size or package quantity.
 *
 * Examples:
 *
 * • 5 lb
 * • 500 ml
 * • 12 oz
 */
export interface ProductSize {
  value: number;

  unit: string;
}



/*
|--------------------------------------------------------------------------
| Product Image Status
|--------------------------------------------------------------------------
|
| Tracks the asynchronous image-processing pipeline.
|
*/

export type ProductImageStatus =
  | "none"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";


/**
 * Product domain model.
 */
export interface Product {
  /**
   * Firestore document ID.
   */
  id: string;

  /**
   * Store that owns this product.
   */
  storeId: string;

  /**
   * Product information.
   */
  name: string;

  description: string;

  category: string;

  brand?: string;

  /**
   * Selling price.
   */
  price: number;

  /**
   * Current inventory quantity.
   */
  stock: number;

  /*
  |--------------------------------------------------------------------------
  | Product Image Processing
  |--------------------------------------------------------------------------
  */

  /**
   * Optimized WebP URL displayed throughout the application.
   */
  imageUrl: string;

  /**
   * Current state of the asynchronous image-processing pipeline.
   *
   * Legacy products may not have this field, so it remains optional.
   */
  imageStatus?: ProductImageStatus;

  /**
   * Storage path of the original uploaded image.
   *
   * The background function reads this file and may delete it after
   * successfully creating the optimized WebP.
   */
  originalImagePath?: string;

  /**
   * Storage path of the optimized WebP image.
   */
  optimizedImagePath?: string;

  /**
   * Human-readable processing error for debugging and UI feedback.
   */
  imageError?: string | null;

  /**
   * Store-managed inventory identifier.
   */
  sku: string;

  /**
   * Whether customers can currently purchase the product.
   */
  isAvailable: boolean;

  /**
   * Whether the product should be highlighted.
   */
  featured: boolean;

  /**
   * Optional package size.
   */
  size?: ProductSize | null;

  /**
   * Internal customer rating.
   */
  rating?: number;

  /**
   * Number of submitted reviews.
   */
  reviewCount?: number;

  /**
   * Number of units sold.
   */
  soldCount?: number;

  /**
   * Optional active promotion.
   */
  promotion?: Promotion | null;

  /**
   * Audit timestamps stored as ISO strings.
   */
  createdAt: string;

  updatedAt: string;
}
