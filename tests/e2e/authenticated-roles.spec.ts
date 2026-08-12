import {expect, Page, test} from "@playwright/test";

type RoleCredentials = {
  email?: string;
  password?: string;
};

async function signIn(page: Page, credentials: Required<RoleCredentials>) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.getByRole("button", {name: /sign in|log in/i}).click();
}

const customer = {
  email: process.env.E2E_CUSTOMER_EMAIL,
  password: process.env.E2E_CUSTOMER_PASSWORD,
};
const store = {
  email: process.env.E2E_STORE_EMAIL,
  password: process.env.E2E_STORE_PASSWORD,
};
const driver = {
  email: process.env.E2E_DRIVER_EMAIL,
  password: process.env.E2E_DRIVER_PASSWORD,
};
const admin = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};

test("customer account can enter the customer workspace", async ({page}) => {
  test.skip(!customer.email || !customer.password, "Set dedicated E2E customer credentials.");
  await signIn(page, customer as Required<RoleCredentials>);
  await expect(page).toHaveURL(/\/(home|profile|verify-email)(?:\?|$)/);
});

test("store account can enter only a store flow", async ({page}) => {
  test.skip(!store.email || !store.password, "Set dedicated E2E store credentials.");
  await signIn(page, store as Required<RoleCredentials>);
  await expect(page).toHaveURL(/\/store\/(dashboard|onboarding|pending-approval)(?:\?|$)/);
});

test("driver account can enter only a driver flow", async ({page}) => {
  test.skip(!driver.email || !driver.password, "Set dedicated E2E driver credentials.");
  await signIn(page, driver as Required<RoleCredentials>);
  await expect(page).toHaveURL(/\/driver\/(dashboard|onboarding|pending-approval)(?:\?|$)/);
});

test("admin account can enter the admin workspace", async ({page}) => {
  test.skip(!admin.email || !admin.password, "Set dedicated E2E admin credentials.");
  await signIn(page, admin as Required<RoleCredentials>);
  await expect(page).toHaveURL(/\/admin(?:\/|$)/);
});
