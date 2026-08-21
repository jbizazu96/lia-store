# LIA Customer iOS App — Apple App Privacy Worksheet

Last audited: August 20, 2026  
Scope: the **customer-only** Capacitor iOS application (`com.liamarketplace.customer`) and the hosted customer experience it loads. Store, driver, and admin workspaces are excluded from this App Store listing.

## Status and governing Apple definitions

This worksheet is the repository source of truth for the answers entered in App Store Connect. It is based on the current production code, not planned features.

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- App Store Connect instructions: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Privacy policy URL: `https://www.liamarketplace.com/legal/privacy`
- Suggested optional privacy choices URL: `https://www.liamarketplace.com/legal/account-deletion`

Apple defines collection broadly enough to include data transmitted off the device and retained by LIA or an integrated third party. App Store answers must include third-party SDK and service behavior. Data is considered linked when it remains associated with a customer account, user ID, device ID, order, or another identifying record.

## App Store Connect summary

Answer **Yes, we collect data from this app**.

Based on the current implementation, select these data types:

1. Contact Info
   - Name
   - Email Address
   - Phone Number
   - Physical Address
2. Financial Info
   - Payment Info
3. Location
   - Precise Location
4. User Content
   - Photos or Videos
   - Customer Support
   - Other User Content
5. Search History
6. Identifiers
   - User ID
   - Device ID
7. Purchases
   - Purchase History
8. Usage Data
   - Product Interaction
9. Diagnostics
   - Crash Data
   - Performance Data
   - Other Diagnostic Data

Current tracking answer for every selected data type: **No, this data is not used for tracking**.

LIA currently has no advertising network, no data broker integration, no cross-app behavioral advertising, and no code requesting Apple’s advertising identifier. Do not add App Tracking Transparency merely for Firebase Authentication, push messaging, Stripe, mapping, or operational diagnostics. Re-audit before adding any advertising, attribution, cross-context retargeting, or third-party behavioral analytics SDK.

## Exact data-type answers

| Apple data type | Collected? | Linked to identity? | Tracking? | Purposes to select | Current evidence and processing |
|---|---:|---:|---:|---|---|
| Name | Yes | Yes | No | App Functionality | Customer registration/profile, checkout contact, Stripe customer, order fulfillment, Shipday recipient, support. |
| Email Address | Yes | Yes | No | App Functionality | Firebase Authentication, verification/reset, customer account, Stripe customer, Resend transactional email, support. No marketing email workflow is currently enabled. |
| Phone Number | Yes | Yes | No | App Functionality | Customer profile, checkout, delivery contact, Shipday fulfillment, support and fraud prevention. |
| Physical Address | Yes | Yes | No | App Functionality; Product Personalization | Saved delivery address, checkout destination, delivery-zone eligibility, store availability, Shipday delivery. |
| Payment Info | Yes | Yes | No | App Functionality | Card/payment details are entered through Stripe Elements in the LIA checkout. Stripe receives the payment information. LIA retains limited payment method display/status and Stripe identifiers, but not full card numbers or security codes. This is disclosed conservatively because collection occurs inside the app experience rather than entirely outside it. |
| Precise Location | Yes | Yes | No | App Functionality; Product Personalization; Analytics | LIA does **not currently call iOS device GPS**. It geocodes the customer-entered delivery address and stores latitude/longitude precise enough to qualify under Apple’s definition. Coordinates are used for zones, routes, pricing, nearby stores, checkout, delivery, and aggregate route reporting. |
| Photos or Videos | Yes | Yes | No | App Functionality | Optional customer profile photo and refund-claim photo evidence. Current customer flow accepts images, not customer video; Apple combines these in one data type. Firebase Storage and image-processing services process uploads. |
| Customer Support | Yes | Yes | No | App Functionality | Order-help requests, support reason/message, admin responses, refund claims, and supporting order information. |
| Other User Content | Yes | Yes | No | App Functionality | Delivery instructions, refund/claim descriptions, store review ratings and comments, and other customer-entered order content. |
| Search History | Yes | Yes | No | App Functionality; Product Personalization | The latest customer searches are stored on the customer profile and also may be cached locally for the search experience. |
| User ID | Yes | Yes | No | App Functionality; Product Personalization; Developer’s Advertising or Marketing | Firebase UID, Stripe customer ID, order/customer identifiers, legal acceptance, support, favorites, notifications, security, and fraud controls. User IDs also route customer-opted product, store, offer, and promotion push notifications. |
| Device ID | Yes | Yes | No | App Functionality; Developer’s Advertising or Marketing | A stable LIA installation ID, Firebase messaging token, platform, and user agent are registered to the signed-in account for private push delivery and customer-controlled promotional notifications. This is not Apple’s advertising identifier. |
| Purchase History | Yes | Yes | No | App Functionality; Analytics | Products, quantities, store, prices, tax, fees, tip, order and payment status, delivery, refunds, claims, and order history. Authoritative order data also supports reporting and settlement reconciliation. |
| Product Interaction | Yes | Yes | No | App Functionality; Product Personalization; Developer’s Advertising or Marketing | Server-backed cart, favorite stores, recent searches, notification preferences, reviews, and customer interaction needed to restore and personalize shopping. Favorites/preferences may affect opted-in store/product/promotional notifications. LIA does not currently collect a general clickstream of every tap or scroll. |
| Crash Data | Yes | Yes | No | App Functionality | Production client failures can be sent to LIA’s Firebase-backed error reporter with authenticated user ID, route path, sanitized stack, platform, and app version. |
| Performance Data | Yes | Potentially yes | No | App Functionality; Analytics | Firebase Performance traces and LIA timing reports measure customer route/load and route-calculation latency. Slow-operation reports can be associated with an authenticated user through the LIA error reporter, so answer linked conservatively. |
| Other Diagnostic Data | Yes | Yes | No | App Functionality | Error area/message, sanitized stack, route pathname without query text, native/web platform, version, online status, safe metadata, App Check state, and security/abuse-control records. |

## Data types not currently selected

Do **not** select these for the current customer iOS build unless the implementation changes:

- Health or Fitness
- Credit Info or Other Financial Info
- Coarse Location as a separate collection practice
- Sensitive Info
- Contacts/address book
- Emails or Text Messages
- Audio Data
- Gameplay Content
- Browsing History outside LIA
- Advertising Data
- Environment Scanning
- Hands or Head data
- Other Data Types

Notes:

- User-created support messages belong under **Customer Support**, not Emails or Text Messages.
- LIA-generated transactional email does not mean the app collects the customer’s mailbox or email-message history.
- Store and driver onboarding documents, driver precise/live location, store financial payouts, and administrator activity are outside this customer-only App Store record because native route enforcement excludes those workspaces.

## Third-party processor audit

| Processor/SDK | Customer data it may process | Why | Tracking under Apple definition? |
|---|---|---|---:|
| Firebase Authentication | Email, name, user ID, authentication tokens, provider identity | Sign-in, verification, account security | No |
| Apple Sign In | Apple authentication identifier; name/email when Apple provides them | Authentication | No |
| Google Sign In | Google authentication identifier, name/email/profile information returned by the provider | Authentication | No based on current use; verify the final native SDK privacy manifest before submission |
| Firestore / Cloud Functions / Firebase Storage | Account, profile, address, coordinates, cart, favorites, searches, orders, uploads, support, claims, diagnostics | Core app backend | No |
| Firebase Cloud Messaging | Installation/device ID, push token, preferences, notification delivery state | Transactional and customer-opted promotional push | No |
| Firebase Performance | Performance timing, app/device/network context and installation-level information according to the SDK | Reliability and performance | No |
| Stripe / Stripe Elements | Payment details, billing/payment identifiers, customer contact, transaction and fraud signals | Payment processing, refunds, fraud prevention | No |
| Google Maps, Geocoding, and Routes | Customer-entered address, precise coordinates, store coordinates, routes | Address verification, delivery zones, distance and pricing | No |
| Shipday | Recipient/contact, delivery address, order and delivery identifiers/instructions/status | Dispatch and delivery tracking | No |
| Resend | Customer email, name, order reference and transactional email contents | Verification, reset and selected transactional email | No |
| Vercel / Cloudflare | Requests, IP/network and security/hosting information according to service configuration | Hosting, delivery, DNS and security | No |

## Code evidence reviewed

- Customer privacy disclosure: `src/content/legal/customerPrivacy.ts`
- Customer profile/address/search persistence: `functions/src/callable/customerProfile.ts`
- Checkout identity, address, coordinates and Stripe customer: `functions/src/payment/checkout/prepareCheckoutPayment.ts`
- Checkout input model: `functions/src/payment/checkout/checkoutPaymentTypes.ts`
- Push device registration: `functions/src/callable/notificationDevice.ts`
- Customer messaging client: `src/services/notification/firebaseMessaging.ts`
- Client diagnostic payload: `src/services/monitoring/clientErrorReporter.ts`
- Diagnostic storage/retention: `functions/src/callable/clientErrorReports.ts`
- Firebase Performance instrumentation: `src/services/performance/customerPerformanceService.ts`
- Customer support and claims: `functions/src/callable/orderSupport.ts`, `functions/src/callable/refundClaims.ts`
- Store reviews: `functions/src/callable/customerStoreReviews.ts`
- Native authentication: `src/services/auth/googleAuthenticationService.ts`, `src/services/auth/appleAuthenticationService.ts`
- Native customer-only route restriction: `src/services/navigation/nativeCustomerRoutes.ts`
- Capacitor plugin configuration: `capacitor.config.ts`

## Submission procedure

In App Store Connect:

1. Open the LIA app.
2. Choose **App Privacy**.
3. Enter `https://www.liamarketplace.com/legal/privacy` as the required Privacy Policy URL.
4. Optionally enter `https://www.liamarketplace.com/legal/account-deletion` as the User Privacy Choices URL.
5. Answer **Yes** to data collection.
6. Select the data types in the summary above.
7. For every selected type, enter the linked/tracking/purpose answers from the table.
8. Review the Product Page Preview.
9. Publish the privacy responses.

## Mandatory re-audit before submission

The native iOS project has not yet been created in this repository, so this worksheet covers application behavior and declared Capacitor dependencies but cannot yet inspect the final Xcode privacy report.

After `npx cap add ios` and native dependency installation:

1. Inspect every generated `PrivacyInfo.xcprivacy` file.
2. Generate and review Xcode’s privacy report/archive report.
3. Confirm the final versions of Firebase Authentication, Firebase Messaging, Firebase Performance, Stripe, Capacitor, and any transitive native SDKs.
4. Confirm no SDK declares tracking or advertising-ID access.
5. Compare the archive’s collected-data declarations with this worksheet.
6. Update this file and App Store Connect if the compiled build differs.

## Change-control triggers

Re-run this worksheet before releasing any feature that adds:

- device GPS or background location;
- advertising, attribution, retargeting, or behavioral analytics;
- contact/address-book import;
- microphone, voice, or video uploads;
- health, age-restricted, identity-document, or other sensitive customer data;
- a loyalty/profile model that infers purchase tendencies for marketing;
- a new payment, maps, messaging, support, analytics, or crash-reporting SDK;
- native driver/store/admin access in the same App Store app.
