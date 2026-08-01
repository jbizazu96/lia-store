/**
 * ================================================================
 * Marketplace Payment Configuration
 * ================================================================
 *
 * This file contains the business rules for the LIA marketplace.
 *
 * IMPORTANT:
 * - Do NOT hard-code commission percentages anywhere else.
 * - All payment calculations must read values from this file.
 * - This file represents business policy, not Stripe configuration.
 *
 * Example:
 *
 * Customer pays
 * --------------------------
 * Products ........ $100
 * Sales Tax ....... $7
 * Delivery ........ $10
 * Driver Tip ...... $5
 * Service Fee ..... $4
 *
 * Allocation
 * --------------------------
 * Store receives:
 *   - 90% of products
 *   - 100% of sales tax
 *
 * Driver receives:
 *   - 70% of delivery fee
 *   - 100% of driver tip
 *
 * LIA receives:
 *   - 10% product commission
 *   - 30% delivery commission
 *   - 100% service fee
 */

/**
 * Currency used throughout the marketplace.
 *
 * Future:
 * This can become configurable if LIA expands internationally.
 */
export const MARKETPLACE_CURRENCY = "usd";

/**
 * Stripe and payment calculations should always use
 * the smallest currency unit.
 *
 * USD
 * ----
 * $1.00 = 100 cents
 */
export const CURRENCY_SCALE = 100;

/**
 * Percentages are stored as Basis Points.
 *
 * Why?
 * ----
 * Floating point percentages introduce rounding errors.
 *
 * 100 basis points = 1%
 * 1000 basis points = 10%
 * 3000 basis points = 30%
 * 10000 basis points = 100%
 */
export const BASIS_POINTS = 10_000;

/**
 * Store commission retained by LIA.
 *
 * Store keeps:
 *      90%
 *
 * LIA keeps:
 *      10%
 */
export const STORE_COMMISSION_BASIS_POINTS = 1_000;

/**
 * Driver delivery commission retained by LIA.
 *
 * Driver keeps:
 *      70%
 *
 * LIA keeps:
 *      30%
 */
export const DRIVER_COMMISSION_BASIS_POINTS = 3_000;

/**
 * Driver tips belong entirely to the driver.
 */
export const DRIVER_TIP_BASIS_POINTS = BASIS_POINTS;

/**
 * Sales tax belongs entirely to the store.
 *
 * LIA never keeps any portion of sales tax.
 */
export const STORE_TAX_BASIS_POINTS = BASIS_POINTS;

/**
 * Customer service fees belong entirely to LIA.
 */
export const PLATFORM_SERVICE_FEE_BASIS_POINTS = BASIS_POINTS;

/**
 * Store commission is calculated BEFORE sales tax.
 *
 * Example:
 *
 * Products:
 *      $100
 *
 * Tax:
 *      $7
 *
 * Commission applies ONLY to:
 *      $100
 */
export const COMMISSION_APPLIES_BEFORE_TAX = true;

/**
 * Marketplace payout policy:
 *
 * Both the store and driver become eligible for payment only after Shipday
 * confirms successful delivery. This keeps the customer payment on LIA's
 * platform account while the order can still be cancelled or fail delivery.
 */
export const PAY_DRIVER_AFTER_DELIVERY = true;

export const PAY_STORE_AFTER_DELIVERY = true;

/*
 * Orders at the platform free-delivery threshold still require a driver.
 * LIA funds this incentive from its retained marketplace revenue. A tip
 * lowers the incentive because the driver is already receiving that tip.
 */
