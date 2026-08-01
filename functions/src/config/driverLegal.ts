/*
|--------------------------------------------------------------------------
| Driver Legal Configuration
|--------------------------------------------------------------------------
|
| Functions persist the agreement version that the driver accepted. Keep
| these values synchronized with src/config/driverLegal.ts whenever LIA
| publishes a materially revised agreement.
|
*/

export const DRIVER_LEGAL_CONFIG = {
  TERMS_VERSION: "2026-07-29",
  PRIVACY_POLICY_VERSION: "2026-07-29",
  DRIVER_AGREEMENT_VERSION: "2026-07-29",
} as const;
