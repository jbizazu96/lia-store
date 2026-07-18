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

/**
 * Promotion.
 */
export interface Promotion {

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

}