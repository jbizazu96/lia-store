import {expect, type Page, test} from "@playwright/test";

const email = process.env.E2E_CUSTOMER_EMAIL;
const password = process.env.E2E_CUSTOMER_PASSWORD;

async function signInCustomer(page: Page) {
  if (!email || !password) {
    throw new Error("Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD.");
  }

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", {name: /sign in|log in/i}).click();
  await expect(page).toHaveURL(/\/home(?:\?|$)/, {timeout: 30_000});
}

test.describe("authenticated customer journey", () => {
  test.skip(!email || !password, "Set dedicated E2E customer credentials.");

  test("customer can traverse every primary workspace destination", async ({page}) => {
    await signInCustomer(page);

    await expect(page.getByRole("link", {name: "Home"})).toBeVisible();

    await page.getByRole("link", {name: "Orders"}).click();
    await expect(page).toHaveURL(/\/orders(?:\?|$)/);
    await expect(page.getByRole("heading", {name: "Orders"})).toBeVisible();

    await page.getByRole("link", {name: "Support"}).click();
    await expect(page).toHaveURL(/\/help(?:\?|$)/);
    await expect(page.getByRole("heading", {name: /help|support/i}).first()).toBeVisible();

    await page.getByRole("link", {name: "Profile"}).click();
    await expect(page).toHaveURL(/\/profile(?:\?|$)/);
    await expect(page.getByRole("heading", {name: "Profile"})).toBeVisible();
  });

  test("protected checkout does not expose a blank or crashed screen", async ({page}) => {
    await signInCustomer(page);
    await page.goto("/checkout");

    await expect(page.locator("body")).not.toContainText(/application route error|something went wrong/i);
    await expect(
      page.getByText(/checkout|cart is empty|accept the current legal documents/i).first(),
    ).toBeVisible({timeout: 30_000});
  });

  test("customer search stays usable after authentication", async ({page}) => {
    await signInCustomer(page);
    await page.goto("/search");

    const search = page.getByRole("textbox").first();
    await expect(search).toBeVisible();
    await search.fill("market");
    await expect(search).toHaveValue("market");
    await expect(page.locator("body")).not.toContainText(/application route error|something went wrong/i);
  });
});
