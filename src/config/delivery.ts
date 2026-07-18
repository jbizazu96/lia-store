/*
|--------------------------------------------------------------------------
| Delivery Configuration
|--------------------------------------------------------------------------
|
| Central place for all delivery-related business rules and constants.
| All services and UI components should read from here instead of
| hardcoding values.
|
*/

export const DELIVERY_CONFIG = {
  /**
   * Maximum delivery radius.
   */
  MAX_RADIUS_MILES: 25,

  /**
   * Base delivery fee.
   */
  BASE_DELIVERY_FEE: 4.99,

  /**
   * Additional cost per mile after the base distance.
   */
  COST_PER_MILE: 0.75,

  /**
   * Base distance included in the base fee.
   */
  BASE_DISTANCE_MILES: 5,

  /**
   * Minimum delivery fee.
   */
  MIN_DELIVERY_FEE: 2.99,

  /**
   * Minutes per mile.
   */
  MINUTES_PER_MILE: 2,

  /**
   * Default preparation time.
   */
  DEFAULT_PREP_MINUTES: 5,

  /**
   * Earth's radius for Haversine calculations.
   */
  EARTH_RADIUS_MILES: 3959,

  /**
   * Conversion factor.
   */
  METERS_PER_MILE: 1609.34,

  /**
   * Peak delivery surcharge.
   */
  PEAK_SURCHARGE: 1.99,
} as const;