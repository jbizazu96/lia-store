# Firebase App Check rollout

LIA uses a staged App Check rollout so existing web, PWA, iOS, and Android users are not locked out unexpectedly.

## Current stage: monitor and throttle

1. Create a reCAPTCHA Enterprise web app in Firebase App Check.
2. Add its public site key as `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` to web/PWA build environments.
3. Deploy the protected Functions listed below.
4. Keep `APP_CHECK_ENFORCEMENT_MODE` unset. Functions accept missing App Check tokens but record `lastAppCheckVerified` and `missingAppCheckCount` in `callableRateLimits`.
5. Confirm legitimate web and PWA requests show verified tokens.

Rate limits are active during this stage, independently of App Check.

## Native clients

Before strict enforcement, configure Firebase App Check in each Capacitor project:

- iOS: register App Attest with DeviceCheck fallback.
- Android: register Play Integrity and verify release signing configuration.
- Test development builds with Firebase App Check debug providers and register only test debug tokens in Firebase Console.

Do not ship a debug App Check token in application source or a production build.

## Strict enforcement

After web, installed PWA, iOS, and Android telemetry is consistently verified, set this Functions runtime environment value and redeploy the protected functions:

```text
APP_CHECK_ENFORCEMENT_MODE=enforce
```

Missing or invalid App Check requests will then receive `failed-precondition`. Firebase Console enforcement can be enabled after the application-level rollout is stable.

## Protected operations

- Google Routes delivery calculations
- Checkout payment preparation
- Address geocoding during customer, store, and driver onboarding
- Notification test sends
- Customer Order Zone requests
- Customer order-support requests
- Customer and driver upload preparation
- Refund evidence upload preparation
- Store and driver Stripe account/status/onboarding operations
