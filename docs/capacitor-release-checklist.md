# LIA customer app: Capacitor release checklist

Complete these checks during native development and repeat them on release candidates. They require real iOS and Android projects, so they cannot be completed from the Next.js web workspace alone.

## Apple App Privacy

- Use [`docs/apple-app-privacy-worksheet.md`](./apple-app-privacy-worksheet.md) as the source of truth for the customer-only iOS App Privacy answers.
- Set the App Store privacy policy URL to `https://www.liamarketplace.com/legal/privacy`.
- Enter and publish every collected data type, identity-linking answer, tracking answer, and purpose listed in the worksheet.
- After the iOS project exists, inspect its generated privacy manifests and Xcode privacy report before submitting the first TestFlight/App Store build.
- Re-audit the worksheet whenever a native SDK or customer data practice changes.

## Google Play Data Safety

- Use [`docs/google-play-data-safety-worksheet.md`](./google-play-data-safety-worksheet.md) as the source of truth for the customer-only Android Data Safety form.
- Set the Play privacy policy URL to `https://www.liamarketplace.com/legal/privacy` and the account-deletion URL to `https://www.liamarketplace.com/legal/account-deletion`.
- Enter every collection, sharing, required/optional, ephemeral-processing and purpose answer from the worksheet.
- Keep the Play Console form in draft until the final Android App Bundle, merged manifest, permissions and SDK Index disclosures have been audited.
- Re-audit whenever an Android SDK, permission, recipient, or customer data practice changes.

## Google Play Account Deletion

- Use [`docs/google-play-account-deletion-audit.md`](./google-play-account-deletion-audit.md) for the customer account-deletion submission and release test.
- Enter `https://www.liamarketplace.com/legal/account-deletion` in the Play Console account-deletion URL field.
- Verify the URL from a signed-out mobile browser; the email request path must work without installing or signing into LIA.
- Test the in-app request, immediate account lock, grace-period cancellation, scheduled processing, anonymization, provider cleanup, failure retry and final deletion verification before production submission.

## Native configuration

- The native projects now live in `ios/` and `android/`, using the final customer app identifier `com.liamarketplace.customer`.
- Set `CAPACITOR_SERVER_URL=https://www.liamarketplace.com` before running Capacitor sync. A safe committed template is provided in `.env.capacitor.example`; configure it explicitly in each native build environment.
- Generate the Android and iOS splash assets from the approved LIA launch artwork after creating the native projects. The shared native splash behavior is already configured in `capacitor.config.ts`; verify the white native screen hands off cleanly to the branded customer loader without a blank or flashing frame.
- Universal Links and Android App Links are declared for `www.liamarketplace.com`. The Stripe return path `/checkout/payment-result` is explicitly included and is handled by `NativeCustomerBridge` through Capacitor's `appUrlOpen` event.
- Set `APPLE_TEAM_ID` in Vercel to the 10-character Apple Developer Team ID. Confirm `https://www.liamarketplace.com/.well-known/apple-app-site-association` returns `200` without a redirect and contains `TEAM_ID.com.liamarketplace.customer`.
- Create/select the Android release signing key, obtain its SHA-256 fingerprint, and set `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS` in Vercel. Multiple fingerprints are comma-separated. Confirm `https://www.liamarketplace.com/.well-known/assetlinks.json` returns `200` without a redirect and contains the release fingerprint. Include both Play App Signing and local release fingerprints when they differ.
- In Xcode, select the LIA App target and the correct Apple team. Verify the committed `App.entitlements` shows Associated Domains and Sign in with Apple capabilities; Xcode must provision both capabilities for `com.liamarketplace.customer`.
- Set `NEXT_PUBLIC_APP_URL=https://www.liamarketplace.com` in the hosted/native build environment. Stripe redirect returns must never use `capacitor://localhost`.
- The iOS Firebase app and committed `ios/App/App/GoogleService-Info.plist` use `com.liamarketplace.customer`; the plist is included in the Xcode target and its reversed Google client ID is registered in `Info.plist`.
- Register a separate Android Firebase app in the same Firebase project with package `com.liamarketplace.customer`. Add development/release SHA-1 and SHA-256 fingerprints, then place its downloaded file at `android/app/google-services.json` and run `npx cap sync android`.
- Keep Google and Apple enabled as Firebase Authentication providers. The native shell uses the Capacitor Firebase Authentication plugin while the hosted web/PWA keeps the Firebase JS flow.
- Configure Sign in with Apple in the Apple Developer portal and Firebase Authentication using the final App ID, Services ID, Team ID, Key ID, and private key.
- Verify Apple and Google are displayed as equivalent login choices and test Apple private-email relay accounts.
- Register the Firebase authentication email sender or custom email domain with Apple Private Email Relay so verification and account emails reach customers using Hide My Email.
- Test Apple reauthentication and authorization revocation as part of the in-app account deletion release flow before App Store submission. The native flow now passes Apple's fresh authorization code to Firebase `revokeAccessToken` before submitting the deletion request.
- Configure APNs credentials in Firebase for iOS, then confirm that FCM tokens can receive an APNs notification.
- After native dependency changes, run `npx cap sync`. Confirm that Firebase Authentication, App Check, Crashlytics, Messaging, and native settings appear in the synchronized plugin list.
- Follow the Firebase Messaging iOS setup in the plugin documentation: forward remote-notification registration and receipt callbacks from `AppDelegate.swift`. Do not reinstall `@capacitor/push-notifications`; it conflicts with the Firebase Messaging plugin used to obtain iOS FCM tokens.
- Android now has a monochrome notification icon and LIA notification color; verify their appearance on light/dark Android notification trays.

## Firebase App Check

- Register App Check separately for iOS and Android in the same Firebase project. Use App Attest with DeviceCheck fallback on iOS and Play Integrity on Android.
- Add the Android release SHA-256 fingerprint in Firebase and Google Play App Signing before testing Play Integrity.
- Keep Firebase products in monitoring mode while web/PWA, iOS, and Android metrics are being collected. Enforce only after valid-token traffic is healthy on every supported surface.
- The native App Check token is bridged into the hosted Firebase JS SDK so Firestore, Storage, Authentication, and callable requests made by the WebView carry native attestation.
- Never enable the debug provider in a production/TestFlight/Play build. Use a debug token only for trusted local development and CI.

## Native crash reporting

- `@capacitor-firebase/crashlytics` is connected to the customer shell. The existing Firestore reporter remains responsible for web/PWA diagnostics; native builds additionally send process crashes and handled client failures to Firebase Crashlytics.
- Android applies the Firebase Crashlytics Gradle plugin whenever `google-services.json` is present.
- iOS includes the Crashlytics Swift package and dSYM upload build phase. Archive once in Xcode and confirm the upload phase succeeds.
- In Firebase Console > Crashlytics, confirm separate iOS and Android apps are linked to the production Firebase project.
- Produce one intentional crash in a non-production build on each physical platform. Relaunch the app, then verify the issue, app version, customer UID, `app_surface=customer`, and `hosted_shell=true` appear in Crashlytics.
- Verify a handled React error appears as a non-fatal report and that ordinary web/PWA errors still appear only in LIA's browser error reports.
- Do not add an intentional crash control to a production-visible screen.

## Push and deep-link tests

- Record every physical-device result and its evidence in [`docs/native-push-device-validation.md`](./native-push-device-validation.md). A checklist item is not passed merely because the implementation exists or a simulator succeeds.

- On the first authenticated customer app or installed PWA open, confirm the LIA notification explanation appears once before the system permission dialog.
- Test both first-open choices. “Not now” must leave notification controls available in Profile; “Allow notifications” must register the current installation on the server before showing the enabled confirmation.
- In Profile > Notifications, verify the server-confirmed registration time appears. Use “Send test notification” and confirm the push-service acceptance time updates.
- Run the test notification on an installed iPhone PWA, Android PWA, native iOS app, and native Android app in each state: foreground, background, device locked, and app fully closed.
- For the foreground test, keep LIA visible. For the remaining tests, send the test from another signed-in session so closing or backgrounding the target installation does not prevent initiating the test.
- Confirm an expired or deleted server registration changes the profile state to “not registered” rather than “enabled.”
- Tap each push type from background and terminated states: store, product, order, claim, refund, and promotion.
- Verify each opens only an internal LIA path and the correct account type; sign out, switch account, and confirm the old account no longer receives pushes.
- Test denied permission, later enabling it in system Settings, a token refresh, and reinstalling the app.

## Stripe / 3DS tests

- Test an ordinary card payment in iOS and Android.
- Test a Stripe 3D Secure card and at least one redirect-based payment method enabled for the account.
- Verify the return route is `/checkout/payment-result`, waits for the verified webhook, then opens the confirmed LIA order.
- Leave a test payment in processing for more than 90 seconds. Verify the screen stops showing an indefinite loader, warns against another payment, and offers Retry verification, Check order status, and Contact LIA Support.
- Background the app during authorization, return to it, and verify no duplicate pending order or duplicate payment intent is created.
- Test decline, cancellation, slow webhook, and lost-network paths. The cart must remain intact until the webhook confirms payment.

## Device and store review

- Test current iOS and Android versions on physical devices, not only simulators.
- Check safe-area spacing, keyboard behavior, browser back behavior, offline screen, image loading, location permission, and checkout at small screen sizes.
- Run the same smoke suite after every Capacitor, Firebase, Stripe, or OS SDK upgrade.
