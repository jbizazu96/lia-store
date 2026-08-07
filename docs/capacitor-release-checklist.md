# LIA customer app: Capacitor release checklist

Complete these checks during native development and repeat them on release candidates. They require real iOS and Android projects, so they cannot be completed from the Next.js web workspace alone.

## Native configuration

- Choose the final unique app identifier before creating the iOS and Android projects.
- Register the `lia://` deep-link scheme and configure Universal Links (iOS) and App Links (Android) for the production HTTPS domain.
- Set `NEXT_PUBLIC_APP_URL` in the native build to that HTTPS origin. Stripe redirect returns must never use `capacitor://localhost`.
- Configure Firebase Android (`google-services.json`) and iOS (`GoogleService-Info.plist`) applications separately from the web app.
- Configure APNs credentials in Firebase for iOS, then confirm that FCM tokens can receive an APNs notification.

## Push and deep-link tests

- Opt in from Profile > Notifications. Confirm no permission prompt appears immediately after sign-in.
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
