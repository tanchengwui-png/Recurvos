import { expect, test } from "@playwright/test";

test("pwa manifest and service worker are available", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.webmanifest");
    return await response.json();
  });

  expect(manifest.name).toBe("Recurvos");
  expect(manifest.display).toBe("standalone");

  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active || registration?.installing || registration?.waiting);
  });
});
