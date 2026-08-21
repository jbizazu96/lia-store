# LIA Customer Android App — Google Play Account Deletion Audit

Last audited: August 20, 2026  
Scope: customer-only Android application and its associated customer account data.

## Official requirements

- Google Play account-deletion guidance: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Public deletion resource: `https://www.liamarketplace.com/legal/account-deletion`
- Privacy policy: `https://www.liamarketplace.com/legal/privacy`

Google requires an app that supports account creation to provide both a readily discoverable in-app deletion path and a functional external web resource. Deleting an account must delete associated data rather than merely disable the account. Legitimate retained data must be disclosed, and service providers should also receive appropriate deletion requests.

## Compliance result

| Requirement | Result | LIA implementation |
|---|---|---|
| Customer accounts can be created in the app | Yes | Email/password, Google and Apple authentication are available. |
| Readily discoverable in-app deletion path | Pass | Customer Profile → Account access → Delete account. |
| External deletion resource works without installing the app | Pass, verify in production | The public page offers an email request for customers who cannot sign in. |
| External page identifies the app/developer | Pass | The page explicitly identifies LIA Marketplace and the customer app. |
| User can initiate deletion through the external resource | Pass | A customer may email `info@liamarketplace.com` from the account email. |
| Identity is verified securely | Pass | In-app requests require recent Firebase authentication; external requests require ownership verification and warn against sending passwords/card details. |
| Deletion means deletion, not temporary deactivation | Pass | The engine deletes Firebase Auth, customer profile, addresses, cart, checkout sessions, push registrations, Storage prefix, and Stripe customer. Retained historical records are anonymized/minimized. |
| Associated service-provider data is addressed | Pass with operational monitoring | Stripe customer data and Firebase-hosted account files/documents are explicitly deleted. Delivery/order records sent to Shipday remain subject to fulfillment, dispute and legal retention practices. |
| Retention practices are disclosed | Pass | The public page and Privacy Policy identify transaction, tax, accounting, refund, chargeback, fraud, security, legal, regulatory and audit retention. |
| Expected timing is disclosed | Pass | The page states the normal 30-day grace period, 90-day maximum scheduled period after approval, and unresolved-obligation review. |
| User is informed of blockers or extra steps | Pass | Active orders, refunds, disputes and unresolved obligations are identified as potential blockers; LIA must communicate the next step. |
| Deletion completion is verified | Pass | The deletion engine verifies Auth, Firestore, Storage, product/store/driver records and notification/checkout artifacts before marking completion. |
| Failed deletion can resume/retry | Pass | Atomic leases, saved workflow context, completed steps, scheduled automatic retry and admin retry exist. |

## Code and content reviewed

- Public resource: `src/app/legal/account-deletion/page.tsx`
- In-app entry: `src/app/(customer)/profile/page.tsx`
- Recent-authentication modal: `src/components/customer/profile/DeleteAccountModal.tsx`
- Protected request/cancellation callable: `functions/src/callable/requestAccountDeletion.ts`
- Request locking and duplicate prevention: `functions/src/accountDeletion/accountDeletionRequestService.ts`
- Grace-period policy: `functions/src/accountDeletion/accountDeletionPolicy.ts`
- Eligibility checks and customer deletion: `functions/src/accountDeletion/customerAccountDeletionService.ts`
- Resumable workflow and completion verification: `functions/src/accountDeletion/accountDeletionEngine.ts`
- Scheduler and atomic claiming: `functions/src/accountDeletion/accountDeletionScheduler.ts`
- Deletion lock rules: `firestore.rules`
- Retention disclosure: `src/content/legal/customerPrivacy.ts`

## Required Play Console answers

In **Policy and programs → App content → Data safety → Data deletion**:

1. Confirm that the app allows users to create an account.
2. Confirm that LIA provides a way to request deletion of the account and associated data.
3. Enter `https://www.liamarketplace.com/legal/account-deletion` as the account-deletion URL.
4. Confirm that LIA provides a mechanism to request deletion of some or all data without deleting the account only if the shipped app exposes such a separate mechanism. Do not claim this based solely on the full account-deletion workflow.
5. Keep the answers aligned with `docs/google-play-data-safety-worksheet.md`.

## Release-candidate verification

Before submitting the Android release:

- Open the public URL in a signed-out/private browser on mobile and desktop.
- Confirm it does not redirect to login and that the email request remains available without installing LIA.
- Confirm the page is not geographically restricted and is rendered as HTML, not a PDF.
- Confirm the Play listing name matches “LIA Marketplace,” or update the page to match the final listing name.
- Submit one in-app deletion request from a test customer and verify immediate account lock.
- Submit one external email request and document the ownership-verification and admin-processing procedure.
- Approve a test deletion, shorten the test schedule safely in the emulator/test project, and verify Auth, profile, address, cart, push devices, uploads, Stripe customer and eligible customer data are removed.
- Verify retained order/refund/audit documents contain the anonymous customer identifier and no customer email, phone, address, coordinates, uploaded evidence or live Firebase UID.
- Exercise an engine failure and verify automatic/admin retry finishes deletion without duplicating destructive external calls.
- Confirm administrators cannot reject a verified request merely to retain the customer account. Rejection should be limited to an unverifiable/invalid request; unresolved obligations should delay processing with a clear explanation rather than permanently deny deletion.

## Ongoing change controls

Repeat this audit if LIA adds subscriptions, loyalty balances, a new payment/delivery provider, new customer uploads, an additional identity provider, a separate partial-data deletion control, or changes its retention schedule.
