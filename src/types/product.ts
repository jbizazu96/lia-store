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
   * Price currently shown to customers. When lower than `price`,
   * the product is on sale.
   */
  displayPrice: number;

  /**
   * Current inventory quantity.
   */
  stock: number;

  /**
   * Product image.
   */
  imageUrl: string;

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
