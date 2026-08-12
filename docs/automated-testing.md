# Automated testing

LIA now has three application-owned test layers. None of these commands deploys or writes production data.

## Commands and results

- `npm test` runs fast Vitest unit tests for delivery pricing, zone access, payment allocation, refunds, navigation safety, and address normalization. Results print in the terminal.
- `npm run test:coverage` runs the unit suite and writes the browsable report to `coverage/unit/index.html`.
- `npm run test:rules` starts an isolated Firestore emulator, loads `firestore.rules`, runs access-control tests, and stops the emulator. It uses the demo project `demo-lia-store-tests`, so it cannot connect to the production Firebase project. Java 21 or newer must be installed locally.
- `npm run test:e2e` starts the local Next.js app and runs Playwright browser tests. Results print in the terminal; failures create traces and screenshots under `test-results/`.
- `npm run test:e2e:report` opens the last Playwright HTML report.
- `npm run test:all` runs all three layers.

## Authenticated role tests

Public and unauthenticated browser tests always run. Authenticated customer, store, driver, and admin tests are skipped until dedicated test accounts are supplied as environment variables:

```text
E2E_CUSTOMER_EMAIL=
E2E_CUSTOMER_PASSWORD=
E2E_STORE_EMAIL=
E2E_STORE_PASSWORD=
E2E_DRIVER_EMAIL=
E2E_DRIVER_PASSWORD=
E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
```

Use test-only accounts and a non-production Firebase project for automated checkout/order scenarios. Never put live credentials in source control.

## Continuous integration

Run `npm test`, `npm run test:rules`, TypeScript, and the Functions build for every pull request. Run Playwright after installing Chromium with `npx playwright install chromium`. A CI provider such as GitHub Actions shows pass/fail status in each workflow run and can retain coverage, screenshots, videos, and Playwright traces as downloadable artifacts.
