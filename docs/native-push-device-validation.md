# Native and PWA push-notification device validation

This is the required physical-device acceptance test for LIA notifications. A
row is not complete until the result and evidence have been recorded from a
real device. Simulator success does not replace physical-device validation.

## Test release

Record these values before starting:

- Release/build:
- Hosted application version:
- Firebase project:
- Tester/date:
- iPhone model and iOS version:
- Android model and Android version:
- Installed iPhone PWA iOS version:
- Installed Android PWA browser/version:

Use a dedicated test customer and non-production orders. Confirm the device
registration shown in **Profile > Notifications** belongs to that customer.

## State matrix

Run every row on native iOS, native Android, installed iPhone PWA, and installed
Android PWA. Record `Pass`, `Fail`, or `Not supported` with a screenshot or
screen recording and the server registration timestamp.

| Scenario | iOS native | Android native | iPhone PWA | Android PWA |
| --- | --- | --- | --- | --- |
| Foreground test notification appears as designed | Not run | Not run | Not run | Not run |
| Background notification arrives and opens `/notifications` | Not run | Not run | Not run | Not run |
| Locked-device notification arrives | Not run | Not run | Not run | Not run |
| Terminated app notification arrives and launches safely | Not run | Not run | Not run | Not run |
| Order notification opens the correct `/orders/{orderId}` | Not run | Not run | Not run | Not run |
| Refund/claim notification opens the correct order/help destination | Not run | Not run | Not run | Not run |
| Badge and in-app unread count reconcile after opening | Not run | Not run | Not run | Not run |

## Lifecycle and account tests

1. **First registration:** install fresh, accept the LIA explanation and OS
   prompt, then confirm server status and `lastRegisteredAt` in Profile.
2. **Permission denied:** reinstall or reset permission, deny it, and confirm
   Profile does not claim that the installation is registered.
3. **Enabled later:** enable notifications in system Settings, resume LIA, and
   confirm automatic registration without another sign-in.
4. **Token refresh:** record the current token fingerprint/server registration
   time, trigger the platform-supported token refresh, resume LIA, and verify
   `lastRegisteredAt` advances and a test push succeeds.
5. **Reinstall:** delete and reinstall LIA. The old registration must stop being
   used; the new installation must create a new device registration after
   permission is granted.
6. **Logout cleanup:** sign out, verify the current registration is inactive,
   and send an order/refund event for the old account. That device must not
   receive it. Sign in as another test customer and verify registrations do not
   cross accounts.
7. **Invalid registration:** delete or invalidate the server registration. The
   Profile state must show not registered and offer recovery, not show enabled.
8. **Deep-link authorization:** while signed out and while signed in as a
   different customer, tap an old order notification. LIA must require the
   proper account and must not reveal order data.

## Evidence to retain

- Firebase device-registration document before and after each lifecycle test.
- Firebase Messaging send result and `lastPushAcceptedAt`/`lastPushErrorAt`.
- Screenshots or recordings for each application state.
- Crashlytics issue link if a native failure occurs.
- Failure description, OS/app version, reproduction steps, owner, and retest.

Do not mark push notifications release-ready until every supported cell passes
on the release candidate distributed through TestFlight and an Android internal
testing track.
