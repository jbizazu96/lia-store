import {expect, test} from "@playwright/test";

test("public marketplace loads on a mobile viewport", async ({page}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/LIA/i);
  await expect(page.locator("body")).toBeVisible();
});

test("an unauthenticated customer route does not expose order data", async ({page}) => {
  await page.goto("/orders");
  await expect(page.getByRole("heading", {name: "Verifying account access"})).toBeVisible();
  await expect(page.getByText(/order history|past orders/i)).not.toBeVisible();
});

test("an unauthenticated admin route does not expose the workspace", async ({page}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", {name: "Verifying administrator access"})).toBeVisible();
  await expect(page.getByText(/platform overview/i)).not.toBeVisible();
});
