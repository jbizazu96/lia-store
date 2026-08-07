/*
|--------------------------------------------------------------------------
| Delivery Configuration
|--------------------------------------------------------------------------
|
| Technical constants used for distance and time formatting only.
| Marketplace pricing and the operational delivery radius are stored in
| settings/marketplacePayment and loaded through the pricing policy.
|
*/

export const DELIVERY_CONFIG = {
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

} as const;
