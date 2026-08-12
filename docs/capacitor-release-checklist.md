# LIA customer app: Capacitor release checklist

Complete these checks during native development and repeat them on release candidates. They require real iOS and Android projects, so they cannot be completed from the Next.js web workspace alone.

## Native configuration

- Choose the final unique app identifier before creating the iOS and Android projects.
- Set `CAPACITOR_SERVER_URL` to the deployed HTTPS customer app before running Capacitor sync.
- Generate the Android and iOS splash assets from the approved LIA launch artwork after creating the native projects. The shared native splash behavior is already configured in `capacitor.config.ts`; verify the white native screen hands off cleanly to the branded customer loader without a blank or flashing frame.
- Register the `lia://` deep-link scheme and configure Universal Links (iOS) and App Links (Android) for the production HTTPS domain.
- Set `NEXT_PUBLIC_APP_URL` in the native build to that HTTPS origin. Stripe redirect returns must never use `capacitor://localhost`.
- Configure Firebase Android (`google-services.json`) and iOS (`GoogleService-Info.plist`) applications separately from the web app.
- Enable Google as a Firebase Authentication provider. Add the Android SHA-1 fingerprint and enable the plugin's Google dependencies in `android/variables.gradle` after creating Android.
- Add the reversed Google client ID URL scheme and the Firebase Authentication Google pod configuration after creating iOS.
- Configure APNs credentials in Firebase for iOS, then confirm that FCM tokens can receive an APNs notification.
- After creating each native project, run `npx cap sync`. Confirm that `@capacitor-firebase/messaging` and `capacitor-native-settings` appear in the synchronized plugin list.
- Follow the Firebase Messaging iOS setup in the plugin documentation: forward remote-notification registration and receipt callbacks from `AppDelegate.swift`. Do not reinstall `@capacitor/push-notifications`; it conflicts with the Firebase Messaging plugin used to obtain iOS FCM tokens.
- Add the recommended Android monochrome notification icon metadata after the Android project is created.

## Push and deep-link tests

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
- Background the app during authorization, return to it, and verify no duplicate pending order or duplicate payment intent is created.
- Test decline, cancellation, slow webhook, and lost-network paths. The cart must remain intact until the webhook confirms payment.

## Device and store review

- Test current iOS and Android versions on physical devices, not only simulators.
- Check safe-area spacing, keyboard behavior, browser back behavior, offline screen, image loading, location permission, and checkout at small screen sizes.
- Run the same smoke suite after every Capacitor, Firebase, Stripe, or OS SDK upgrade.
