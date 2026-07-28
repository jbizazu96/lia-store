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
 * Service fee charged to the customer for using the LIA marketplace.
 *
 * This helps cover platform operations such as:
 *
 * • Payment processing
 * • Customer support
 * • Refund and dispute operations
 * • Marketplace infrastructure
 * • Fraud and operational risk
 *
 * Example:
 * 0.05 = 5%
 *
 * Important:
 * These values are MVP defaults only.
 *
 * The future admin panel will manage the active pricing configuration
 * in Firestore. The backend will then use the Firestore configuration
 * as the trusted source of truth.
 */
SERVICE_FEE_PERCENTAGE: 0.05,

/**
 * Lowest service fee charged to the customer.
 *
 * This prevents very small orders from producing a service fee that
 * does not reasonably cover platform operating costs.
 *
 * MVP fallback value:
 * $1.99
 */
MIN_SERVICE_FEE: 1.99,

/**
 * Maximum service fee charged to the customer.
 *
 * This prevents the percentage-based fee from becoming excessive on
 * large grocery orders.
 *
 * MVP fallback value:
 * $9.99
 */
MAX_SERVICE_FEE: 9.99,

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