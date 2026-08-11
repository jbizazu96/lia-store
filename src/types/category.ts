/*
|--------------------------------------------------------------------------
| Category Domain Model
|--------------------------------------------------------------------------
|
| Shared category model used throughout LIA.
|
| Every feature that displays product categories should use this
| interface instead of defining its own.
|
*/

import type { Product } from "./product";

/**
 * Product category.
 */
export interface Category {
  /**
   * Unique category ID.
   */
  id: string;

  /**
   * Display name.
   */
  name: string;

  /** Admin-managed optimized category image. */
  iconUrl: string;

  freshnessEligible: boolean;

  /**
   * Products belonging to this category.
   */
  products: Product[];
}
