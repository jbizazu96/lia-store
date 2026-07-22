/*
|--------------------------------------------------------------------------
| Promotion Domain Model
|--------------------------------------------------------------------------
|
| Shared promotion model used throughout LIA.
|
| Promotions can be attached to:
|
| • Stores
| • Products
| • Future marketing campaigns
|
*/

export interface Promotion {
  /*
  |--------------------------------------------------------------------------
  | Identity And Display
  |--------------------------------------------------------------------------
  */

  /**
   * Unique promotion ID.
   */
  id: string;

  /**
   * Display title.
   */
  title: string;

  /**
   * Description shown to customers.
   */
  description: string;

  /**
   * Promotion image.
   */
  imageUrl: string;

  /**
   * Promotion type.
   */
  type:
    | "discount"
    | "bogo"
    | "free_shipping";

  /*
  |--------------------------------------------------------------------------
  | Availability
  |--------------------------------------------------------------------------
  */

  /**
   * Whether the promotion is enabled.
   *
   * Undefined is treated as enabled for legacy promotions.
   */
  isActive?: boolean;

  /**
   * ISO date when the promotion starts.
   *
   * Undefined or null means it starts immediately.
   */
  startsAt?: string | null;

  /**
   * ISO date when the promotion expires.
   *
   * Undefined or null means it does not expire.
   */
  endsAt?: string | null;

  /*
  |--------------------------------------------------------------------------
  | Discount Details
  |--------------------------------------------------------------------------
  */

  /**
   * Percentage discount.
   *
   * Example:
   * 20 means 20% off.
   */
  discountPercentage?: number;

  /**
   * Fixed discount amount.
   *
   * Example:
   * 5 means $5 off.
   */
  discountAmount?: number;
}