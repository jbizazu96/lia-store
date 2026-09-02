# Authenticated customer E2E tests

These Playwright tests exercise LIA through the browser exactly as a signed-in
customer does. They catch failures that unit tests cannot: redirects, route
guards, Firebase session setup, primary navigation, checkout rendering, and
search-page crashes.

## One-time test account setup

1. Create a dedicated customer through LIA's real signup flow. Do not reuse an
   owner, employee, or personal account.
2. Verify its email, complete its customer profile and address, and accept the
   current legal-document versions.
3. Keep the account out of real financial reporting and use Stripe test mode.
4. Copy `.env.e2e.example` to an ignored local file or export its values in the
   terminal. Never commit the password.

Playwright does not load `.env.local` automatically. Run locally with:

```bash
E2E_CUSTOMER_EMAIL='customer-e2e@example.com' \
E2E_CUSTOMER_PASSWORD='your-test-password' \
npm run test:e2e -- --project=mobile-chromium tests/e2e/customer-journey.spec.ts
```

The same variables should be encrypted repository secrets in CI. The test is
skipped when credentials are absent, so `npm run verify` remains safe for
contributors who do not have access to the account.

## Results

- Terminal: immediate pass, fail, or skip status.
- `playwright-report/`: the HTML report after a run.
- `test-results/`: screenshots, video, and traces retained for failures.

Open the report with `npx playwright show-report`. A test pass proves the web
journey works in the configured browser; it does not replace the physical
native-device checklist.
