/*
|--------------------------------------------------------------------------
| Pricing Configuration
|--------------------------------------------------------------------------
|
| Centralized pricing rules used throughout the application.
|
| These values are used by:
| • Checkout
| • Delivery pricing
| • Store earnings
| • Admin dashboard
|
| Changing a value here automatically updates every part of the app.
|
*/

export const PRICING_CONFIG = {
  /**
   * Orders at or above this subtotal qualify
   * for free delivery.
   */
  FREE_DELIVERY_MINIMUM: 150,

  /**
   * Minimum order amount required before
   * a customer can place an order.
   */
  DEFAULT_MINIMUM_ORDER: 30,

  /**
   * Default commission charged to the store.
   *
   * Example:
   * 0.15 = 15%
   */
  DEFAULT_COMMISSION_RATE: 0.15,

  /**
   * Service fee charged to the customer.
   *
   * Example:
   * 0.10 = 10%
   */
  SERVICE_FEE_PERCENTAGE: 0.10,

  /**
   * Lowest service fee allowed,
   * regardless of order size.
   */
  MIN_SERVICE_FEE: 5.99,

  /**
   * Maximum service fee charged,
   * even for very large orders.
   */
  MAX_SERVICE_FEE: 15.99,

  /**
   * Sales tax percentage.
   *
   * Example:
   * 0.08 = 8%
   *
   * This may eventually become state-specific.
   */
  SALES_TAX_RATE: 0.08,

  /**
   * Default tip percentages shown
   * during checkout.
   */
  DEFAULT_TIPS: [10, 15, 20],
} as const;