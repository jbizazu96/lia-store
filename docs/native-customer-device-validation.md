# Native customer physical-device release test

This checklist must be run on a real iPhone and a real Android phone using the
release candidate. Automated browser tests cannot validate APNs, FCM, native
App Check attestation, OS permission prompts, universal links, or an app being
resumed after Stripe authentication.

Record `Pass`, `Fail`, or `Not run`, the build number, phone/OS, tester, date,
and screenshot or screen recording for every row.

| Journey | iOS | Android |
| --- | --- | --- |
| Fresh install reaches the customer login without a blank screen | Not run | Not run |
| Email/password login and logout cleanup | Not run | Not run |
| First-time Google customer login and onboarding | Not run | Not run |
| First-time Apple customer login and onboarding | Not run | Not run |
| App Check accepts calls in monitoring mode | Not run | Not run |
| App Check accepts calls after enforcement | Not run | Not run |
| Push permission accepted, denied, then enabled in Settings | Not run | Not run |
| Test push in foreground, background, locked, and terminated | Not run | Not run |
| Order/refund notification opens the correct order | Not run | Not run |
| Token refresh and reinstall create a valid new registration | Not run | Not run |
| `https://www.liamarketplace.com/orders/{id}` opens in LIA | Not run | Not run |
| Stripe redirect/3DS returns to payment result and confirms once | Not run | Not run |
| Delivery and pickup checkout complete in Stripe test mode | Not run | Not run |
| Offline state explains internet is required and Retry recovers | Not run | Not run |
| A controlled native test crash appears in Crashlytics | Not run | Not run |
| Text, keyboard, safe areas, and Android back navigation work | Not run | Not run |

Use a dedicated customer, store, and Stripe test payment. Retain Firebase App
Check metrics, notification-device records, Stripe PaymentIntent ID, Crashlytics
issue link, and any failed reproduction steps with the release evidence.

The detailed push lifecycle matrix remains in
[`native-push-device-validation.md`](./native-push-device-validation.md).
