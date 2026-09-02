# Native Firebase setup for LIA Customer

The web, iOS, and Android apps are separate Firebase app registrations inside
the same `lia-store` Firebase project. They share backend resources, but each
platform has its own app ID, configuration file, authentication callback, and
App Check attestation provider.

## Registered applications

- Web: existing LIA web/PWA registration.
- iOS: package/bundle ID `com.liamarketplace.customer`, configured by
  `ios/App/App/GoogleService-Info.plist`.
- Android: package `com.liamarketplace.customer`, configured by
  `android/app/google-services.json`.

Do not create a second Firebase project for Android.

## Android console steps

1. In Firebase **Project settings > Your apps**, open the Android registration.
2. Add SHA-1 and SHA-256 for the local debug key, release key, and Google Play
   App Signing key where applicable.
3. Download a fresh `google-services.json` after fingerprint changes and place
   it in `android/app/`.
4. In **Build > App Check**, register the Android app with Play Integrity.
5. Keep enforcement in monitoring until real internal-track builds produce
   healthy valid-token metrics.
6. In **Authentication > Sign-in method**, keep Google enabled and verify the
   generated Android OAuth client exists.

Android builds require JDK 21 for the current Capacitor/Gradle toolchain. Select
it before building:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
npx cap sync android
cd android
./gradlew bundleRelease
```

## iOS console and Apple steps

1. In Firebase **Build > App Check**, register the iOS app with App Attest. The
   plugin falls back to DeviceCheck on older supported devices.
2. In Firebase **Project settings > Cloud Messaging**, upload the APNs
   authentication key and confirm its Team ID and Key ID.
3. In Xcode, select the LIA target and Apple team. Confirm Push Notifications,
   Sign in with Apple, Associated Domains, and App Attest capabilities.
4. Run on a physical iPhone once, then confirm App Check, FCM, and Crashlytics
   metrics appear under the iOS Firebase app.
5. Archive a release candidate and confirm the Crashlytics symbol-upload phase
   succeeds.

## Safe enforcement order

1. Web/PWA reCAPTCHA Enterprise remains in monitoring.
2. Validate iOS App Attest/DeviceCheck and Android Play Integrity from release
   candidates.
3. Validate callable Functions, Firestore, Storage, and Authentication traffic
   for all three registrations.
4. Enforce one Firebase product at a time, watch metrics/errors, and retain a
   rollback window. Do not enforce Android before the Play-distributed build is
   producing valid Play Integrity tokens.
