import { expect, test } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(/Recurvo|Recurvos/i);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/work email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});
