import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_MOBILE_AUDIT_EMAIL ?? process.env.PLAYWRIGHT_STEP3_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_MOBILE_AUDIT_PASSWORD ?? process.env.PLAYWRIGHT_STEP3_PASSWORD ?? "P@ssw0rd!@#$%";

const routes = [
  "/app",
  "/companies",
  "/products",
  "/plans",
  "/customers",
  "/subscriptions",
  "/invoices",
  "/payments",
  "/finance",
  "/settings",
  "/help/quick-start",
] as const;

test("authenticated mobile routes do not overflow", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  const page = await context.newPage();
  await login(page);

  for (const route of routes) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`${escapeForRegex(route)}(?:\\?.*)?$`));
    await assertNoHorizontalOverflow(page, route);
    await page.screenshot({
      path: `test-results/mobile-auth-${route.replace(/\//g, "-") || "root"}.png`,
      fullPage: true,
    });
  }

  await context.close();
});

async function login(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/work email/i).fill(loginEmail);
  await page.getByPlaceholder(/enter your password/i).fill(loginPassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function assertNoHorizontalOverflow(page: Page, route: string) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right - window.innerWidth > 1 || rect.left < -1);
      })
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: (element.textContent ?? "").trim().slice(0, 80),
      })),
  }));

  expect(metrics.scrollWidth, `route ${route} has document overflow: ${JSON.stringify(metrics.overflowing)}`).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyScrollWidth, `route ${route} has body overflow: ${JSON.stringify(metrics.overflowing)}`).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
