# CSP production enforcement

LIA defaults to `Content-Security-Policy-Report-Only`. This is deliberate: an
unreviewed enforced policy can disable Firebase authentication, App Check,
Stripe Elements, Google Maps, or image delivery.

## Review before enforcement

1. Deploy report-only mode and exercise public, customer, store, driver, and
   admin journeys in production for at least seven representative days.
2. In Vercel runtime logs, search for `CSP report-only violation`.
3. Group violations by `directive` and `blocked`. Allow only origins that are
   required and owned by an integration LIA intentionally uses. Do not add a
   wildcard merely to silence a report.
4. Retest login (email, Google, Apple), reCAPTCHA Enterprise App Check, Stripe
   checkout/3DS, Maps, Storage images, push registration, support, and legal
   pages after every policy adjustment.
5. Verify browser-extension violations separately; they do not belong in the
   site policy.

## Turn enforcement on

Set this Production environment variable in Vercel and redeploy:

```text
CSP_ENFORCEMENT_MODE=enforce
```

Confirm the response contains `Content-Security-Policy` and no longer contains
`Content-Security-Policy-Report-Only`. Keep watching reports and application
error telemetry during rollout. To roll back immediately, change the variable
to `report-only` (or remove it) and redeploy.
