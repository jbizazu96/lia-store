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

- Choose the final unique app identifier before creating the iOS and Android projects.
- Set `CAPACITOR_SERVER_URL=https://www.liamarketplace.com` before running Capacitor sync. A safe committed template is provided in `.env.capacitor.example`; configure it explicitly in each native build environment.
- Generate the Android and iOS splash assets from the approved LIA launch artwork after creating the native projects. The shared native splash behavior is already configured in `capacitor.config.ts`; verify the white native screen hands off cleanly to the branded customer loader without a blank or flashing frame.
- Register the `lia://` deep-link scheme and configure Universal Links (iOS) and App Links (Android) for the production HTTPS domain.
- Set `NEXT_PUBLIC_APP_URL=https://www.liamarketplace.com` in the hosted/native build environment. Stripe redirect returns must never use `capacitor://localhost`.
- Configure Firebase Android (`google-services.json`) and iOS (`GoogleService-Info.plist`) applications separately from the web app.
- Enable Google as a Firebase Authentication provider. Add the Android SHA-1 fingerprint and enable the plugin's Google dependencies in `android/variables.gradle` after creating Android.
- Add the reversed Google client ID URL scheme and the Firebase Authentication Google pod configuration after creating iOS.
- Configure Sign in with Apple in the Apple Developer portal and Firebase Authentication using the final App ID, Services ID, Team ID, Key ID, and private key.
- Add the Sign in with Apple capability to the iOS target. Verify Apple and Google are displayed as equivalent login choices and test Apple private-email relay accounts.
- Register the Firebase authentication email sender or custom email domain with Apple Private Email Relay so verification and account emails reach customers using Hide My Email.
- Test Apple reauthentication and access-token revocation as part of the in-app account deletion release flow before App Store submission.
- Configure APNs credentials in Firebase for iOS, then confirm that FCM tokens can receive an APNs notification.
- After creating each native project, run `npx cap sync`. Confirm that `@capacitor-firebase/messaging` and `capacitor-native-settings` appear in the synchronized plugin list.
- Follow the Firebase Messaging iOS setup in the plugin documentation: forward remote-notification registration and receipt callbacks from `AppDelegate.swift`. Do not reinstall `@capacitor/push-notifications`; it conflicts with the Firebase Messaging plugin used to obtain iOS FCM tokens.
- Add the recommended Android monochrome notification icon metadata after the Android project is created.

## Native crash reporting

- `@capacitor-firebase/crashlytics` is connected to the customer shell. The existing Firestore reporter remains responsible for web/PWA diagnostics; native builds additionally send process crashes and handled client failures to Firebase Crashlytics.
- After creating Android, add the Firebase Crashlytics Gradle plugin to the project and app Gradle files, then run `npx cap sync android`.
- After creating iOS, run `npx cap sync ios`; the required Swift Package Manager symlink option is already declared in `capacitor.config.ts`.
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
