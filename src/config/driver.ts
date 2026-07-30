/*
|--------------------------------------------------------------------------
| Driver Configuration
|--------------------------------------------------------------------------
|
| Central settings for driver onboarding and eligibility. Keep policy values
| here so the UI and services do not rely on scattered hard-coded values.
|
*/

export const DRIVER_CONFIG = {
  MINIMUM_AGE: 18,

  /*
  |--------------------------------------------------------------------------
  | Preferred Service Radius
  |--------------------------------------------------------------------------
  |
  | This caps a driver's requested operating area. An administrator still
  | decides the approved radius after reviewing the application.
  |
  */
  MAXIMUM_PREFERRED_RADIUS_MILES: 50,
} as const;
