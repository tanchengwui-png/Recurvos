import { expect, test } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STRESS_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STRESS_PASSWORD ?? "P@ssw0rd!@#$%";

test("products table headers align with visible columns", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await page.getByLabel(/work email/i).fill(loginEmail);
  await page.getByPlaceholder(/enter your password/i).fill(loginPassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await page.getByRole("link", { name: /^products$/i }).click();
  await expect(page).toHaveURL(/\/products$/);

  const headerRow = page.locator(".products-table thead tr");
  await expect(headerRow).toContainText(["Product Name", "Company", "Status", "Catalog", "Default Plan"]);

  const headerCount = await page.locator(".products-table thead th").count();
  expect(headerCount).toBe(5);

  const firstRow = page.locator(".products-table tbody tr").first();
  await expect(firstRow).toBeVisible();

  const firstRowCellCount = await firstRow.locator("td").count();
  expect(firstRowCellCount).toBe(5);
});
