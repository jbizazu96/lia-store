# LIA Customer Android App — Google Play Data Safety Worksheet

Last audited: August 20, 2026  
Package scope: the **customer-only** Capacitor Android application planned from `com.liamarketplace.customer`. Store, driver, and admin workspaces are excluded from this Google Play listing and are blocked by the native customer route allowlist.

## Governing Google Play requirements

This is the repository source of truth for the answers entered in Play Console. It describes the current implemented customer application and its integrated SDKs and services, not planned features.

- Google Play Data Safety guidance: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google account-deletion guidance: https://support.google.com/googleplay/android-developer/answer/13327111
- Privacy policy URL: `https://www.liamarketplace.com/legal/privacy`
- Account deletion URL: `https://www.liamarketplace.com/legal/account-deletion`

Google defines **collected** data as data transmitted off the device, including transmission by SDKs. A processor acting on LIA’s instructions is a service provider: its processing is collection but is not automatically “sharing.” Google also excludes certain transfers from “sharing,” including a user-initiated transfer to a third party that the user reasonably expects, legal disclosures, and fully anonymized data.

The form must cover every currently distributed version, region, and user flow for the package. Third-party SDK behavior must be included.

## Data collection and security answers

Use these answers in the opening Play Console section:

| Play Console question | LIA answer | Basis |
|---|---|---|
| Does the app collect or share required user data types? | **Yes** | Customer accounts, addresses, payments, orders, uploads, searches, device registrations, and diagnostics are transmitted off-device. |
| Is all collected user data encrypted in transit? | **Yes** | The customer app, Firebase, Google APIs, Stripe, Shipday, Resend, Vercel, and Cloudflare production paths use HTTPS/TLS. This answer must be rechecked against the final Android network-security configuration. |
| Can users request deletion of their data? | **Yes** | In-app Profile deletion flow and public deletion URL exist. Some transaction, fraud, tax, legal, refund, security, and audit records may be retained for legitimate purposes disclosed in the Privacy Policy. |
| Does the app support account creation? | **Yes** | Email/password, Google, and Apple customer account creation/sign-in are supported. |
| Independent security review completed? | **No**, unless LIA later completes a Google-recognized independent review | Automated tests and internal review do not qualify automatically for this optional badge. |

## Data types to select

Select the following Google Play data types:

1. **Location**
   - Precise location
2. **Personal info**
   - Name
   - Email address
   - User IDs
   - Address
   - Phone number
3. **Financial info**
   - User payment info
   - Purchase history
4. **Photos and videos**
   - Photos
5. **App activity**
   - App interactions
   - In-app search history
   - Other user-generated content
6. **App info and performance**
   - Crash logs
   - Diagnostics
   - Other app performance data
7. **Device or other IDs**
   - Device or other IDs

## Exact data handling answers

For every row below, **Collected = Yes**. “Shared” uses Google’s Data Safety definition, not the ordinary-language meaning of sending data to a processor.

| Google data type | Shared? | Required or optional? | Ephemeral? | Purposes to select | Current implementation |
|---|---:|---|---:|---|---|
| Precise location | No | Required | No | App functionality; Personalization; Fraud prevention, security, and compliance | LIA does not currently request Android device GPS. Customer-entered addresses are geocoded and precise latitude/longitude is retained for nearby stores, zone access, routes, pricing, checkout, delivery, and reporting. Google’s definition includes inferred precise location. |
| Name | No | Required | No | App functionality; Account management | Account/profile, checkout contact, Stripe customer, order fulfillment, Shipday recipient and support. |
| Email address | No | Required | No | App functionality; Developer communications; Fraud prevention, security, and compliance; Account management | Firebase Authentication, verification/reset, transactional email, Stripe customer, support and security. Current Resend email is transactional, not marketing. |
| User IDs | No | Required | No | App functionality; Developer communications; Advertising or marketing; Fraud prevention, security, and compliance; Personalization; Account management | Firebase UID, Stripe customer ID, order/support/legal records, favorites, notification routing and security. Customer-opted store/product/offer promotion push uses account/device routing. |
| Address | No | Required | No | App functionality; Personalization; Fraud prevention, security, and compliance | Saved delivery address, zone/store eligibility, checkout and Shipday fulfillment. |
| Phone number | No | Required | No | App functionality; Developer communications; Fraud prevention, security, and compliance; Account management | Profile, checkout, delivery contact, Shipday and support. |
| User payment info | No | Required for purchase | No | App functionality; Fraud prevention, security, and compliance | Stripe Elements receives card/payment data in checkout. LIA retains limited method display/status and Stripe IDs, never full card number or security code. Stripe is treated as a payment service provider. |
| Purchase history | No | Required | No | App functionality; Analytics; Fraud prevention, security, and compliance | Products, quantities, prices, tax, fees, tip, order/payment/delivery/refund state and historical records. |
| Photos | No | Optional | No | App functionality | Optional profile image and optional/required-by-claim-type refund evidence. Firebase Storage and LIA image processing handle uploads. |
| App interactions | No | Required | No | App functionality; Analytics; Advertising or marketing; Personalization | Server-backed cart, favorite stores, notification preferences, reviews and bounded operational interaction data. Favorites/preferences may determine opted-in store/product/promotional notifications. LIA does not retain a general tap-and-scroll clickstream. |
| In-app search history | No | Optional | No | App functionality; Personalization | Up to ten recent searches are stored on the customer profile and may also be cached locally. A customer can use LIA without searching. |
| Other user-generated content | No | Optional | No | App functionality | Delivery instructions, reviews/comments, support messages, refund-claim descriptions and other voluntarily entered order content. |
| Crash logs | No | Required/automatic when a reportable failure occurs | No | Analytics; App functionality | Native Android process crashes and handled client failures can be sent to Firebase Crashlytics and may contain a sanitized stack, route path, platform/build versions and authenticated UID. Web/PWA failures continue to use LIA’s Firebase-backed browser reporter. |
| Diagnostics | No | Required/automatic | No | Analytics; App functionality; Fraud prevention, security, and compliance | Error area/message, online state, App Check status, safe metadata, abuse-control and security events. |
| Other app performance data | No | Required/automatic | No | Analytics; App functionality | Firebase Performance and LIA timing reports measure customer page load, route calculation and slow operations. |
| Device or other IDs | No | Required | No | App functionality; Developer communications; Advertising or marketing; Fraud prevention, security, and compliance; Account management | Firebase installation/device identifiers, stable LIA installation ID, FCM token, platform and user agent. Push permission is optional, but Firebase/service/security installation identifiers may be collected automatically, so the combined data type is declared required conservatively. |

## Why the worksheet currently says “not shared”

The following off-device transfers are still declared as **collection**:

- Firebase/Google Cloud, Vercel, Cloudflare, Resend and operational image processing act as infrastructure/service providers.
- Stripe acts as LIA’s payment and fraud-processing provider.
- Google Maps, Geocoding and Routes process addresses/coordinates to provide LIA functionality.
- Shipday processes delivery information on LIA’s behalf.
- A customer deliberately orders from a selected independent store; operational order information sent to that store is a user-initiated transfer the customer reasonably expects.

Under Google’s published exceptions, these do not need to be marked as “shared” when the parties use the data only for those purposes. This conclusion must be changed if any recipient:

- uses customer data for its own unrelated advertising or marketing;
- sells data or combines it for an unrelated independent purpose;
- receives more information than needed for the user-requested transaction;
- is not contractually or operationally restricted to the disclosed purpose; or
- no longer qualifies as a service provider or user-initiated recipient.

LIA’s current Privacy Policy states that stores and delivery providers may use customer information only for fulfillment, support, and safety and are not authorized to use it for unrelated marketing or solicitation. Keep that restriction in merchant and provider agreements.

## Data types not currently selected

Do not select these unless the customer Android implementation changes:

- Approximate location as a distinct collection practice
- Race and ethnicity
- Political or religious beliefs
- Sexual orientation
- Other personal info
- Credit score
- Other financial info
- Health information
- Fitness information
- Emails
- SMS or MMS
- Other in-app messages (support and claim submissions are classified as other user-generated content, not peer-to-peer messaging)
- Videos
- Voice or sound recordings
- Music files
- Files and documents
- Calendar events
- Contacts
- Web browsing history
- Installed apps
- Any other app activity not described above

## Optional versus required rationale

Google permits “optional” only when all users can choose not to provide the data and can still use the app. For LIA:

- Photos, search history, reviews, delivery instructions, support and claim content are optional customer actions.
- Account identity, contact details, delivery address/location, payment data for purchase, order history, basic app interactions, device/security identifiers, and diagnostics support the primary authenticated shopping/delivery service or operate automatically, so they are marked required conservatively.
- Push permission itself is optional. The combined Device or other IDs category is still marked required because Firebase and security infrastructure may create installation-level identifiers independently of customer push consent.

## Processor and SDK audit

| Processor/SDK | Data processed | Role for Data Safety | Current purpose |
|---|---|---|---|
| Firebase Authentication | Email, name, user ID, provider tokens and security data | Service provider; collected, not shared | Authentication and account security |
| Google and Apple Sign In | Provider user ID, name/email when returned, authentication tokens | User-requested authentication provider processing | Account creation/sign-in |
| Firestore, Cloud Functions and Firebase Storage | Customer/account, address, location, shopping, orders, uploads, support and diagnostics | Service provider; collected, not shared | Core backend |
| Firebase Cloud Messaging | FCM token, installation/device ID, platform, preferences and delivery status | Service provider; collected, not shared | Transactional/developer communications and opted-in promotions |
| Firebase Performance | Installation/app/device/network and timing information according to final SDK behavior | Service provider; collected, not shared | Analytics and reliability |
| Stripe / Stripe Elements | Payment method, transaction, contact and fraud signals | Payment service provider; collected, not shared | Checkout, refunds and fraud prevention |
| Google Maps, Geocoding and Routes | Address, coordinates, route endpoints and results | Service provider; collected, not shared | Address verification, availability, routing and price calculation |
| Shipday | Recipient/contact, delivery address, order identifier/instructions/status | Delivery service provider; collected, not shared | Dispatch and tracking |
| Resend | Email, name, transaction/order reference and email contents | Service provider; collected, not shared | Authentication and selected transactional email |
| Vercel / Cloudflare | Request, IP/network, hosting and security data according to configuration | Service provider; collected, not shared | Hosting, delivery, DNS and security |
| Participating store | Items, recipient and operationally necessary order/contact/instruction data | User-initiated expected recipient; sharing exception | Complete the customer’s selected-store order |

## Code evidence reviewed

- Customer privacy policy: `src/content/legal/customerPrivacy.ts`
- Profile, contact, address, coordinates and search history: `functions/src/callable/customerProfile.ts`
- Checkout and Stripe customer: `functions/src/payment/checkout/prepareCheckoutPayment.ts`
- Orders/cart: `functions/src/callable/customerCart.ts`, `functions/src/payment/checkout/checkoutPaymentTypes.ts`
- Push/device registrations: `functions/src/callable/notificationDevice.ts`, `src/services/notification/firebaseMessaging.ts`
- Diagnostics and retention: `src/services/monitoring/clientErrorReporter.ts`, `functions/src/callable/clientErrorReports.ts`
- Performance data: `src/services/performance/customerPerformanceService.ts`
- Support, claims and evidence: `functions/src/callable/orderSupport.ts`, `functions/src/callable/refundClaims.ts`
- Customer reviews: `functions/src/callable/customerStoreReviews.ts`
- Authentication: `src/services/auth/googleAuthenticationService.ts`, `src/services/auth/appleAuthenticationService.ts`
- Customer-only native route boundary: `src/services/navigation/nativeCustomerRoutes.ts`
- Declared Capacitor/Firebase dependencies: `package.json`, `capacitor.config.ts`

## Play Console entry procedure

1. Open the LIA app in Play Console.
2. Go to **Policy and programs → App content → Data safety**.
3. Enter the privacy policy URL if it is not already configured.
4. Answer the collection/security questions from this worksheet.
5. Select every data type listed above.
6. For each selected data type, enter its collected/shared, required/optional, ephemeral and purpose answers.
7. Review the generated store-listing preview.
8. Save the form as a draft until the final Android App Bundle is audited.
9. Submit the form with the release candidate.

## Mandatory final Android audit

No Android native project exists in this repository yet. Before promoting LIA beyond an internal testing-only track:

1. Create/sync the Android project and build the exact release App Bundle.
2. Inspect the merged Android manifest and all requested permissions.
3. Confirm that no location permission was added unless LIA begins reading device location.
4. Inspect the Google Play SDK Index guidance for the exact Firebase, Stripe, Capacitor and transitive SDK versions in the bundle.
5. Review Firebase’s current Data Safety guidance for Authentication, Messaging and Performance.
6. Confirm no advertising ID, app-set advertising use, contact, microphone, camera-video, background-location or installed-app collection was added transitively.
7. Test HTTPS-only production traffic and confirm cleartext traffic is disabled for the release build.
8. Compare the release bundle’s behavior with this worksheet and update both the worksheet and Play Console when they differ.

## Change-control triggers

Re-audit before releasing any feature or dependency that adds:

- device GPS, approximate/background location, or a location permission;
- advertising, attribution, retargeting or behavioral analytics;
- contact/address-book, calendar, installed-app or browsing-history access;
- microphone, voice, video or general document uploads;
- health, age-restricted or sensitive customer information;
- a new payment, maps, messaging, support, analytics or crash SDK;
- independent merchant/provider use of customer information;
- store, driver or administrator access within this same Android package.
