import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const subscriberEmail = process.env.PLAYWRIGHT_STEP4_EMAIL ?? "tanchengwui@hotmail.com";
const subscriberPassword = process.env.PLAYWRIGHT_STEP4_PASSWORD ?? "P@ssw0rd!@#$%";
const ownerEmail = process.env.PLAYWRIGHT_STEP4_OWNER_EMAIL ?? "owner@recurvo.com";
const ownerPassword = process.env.PLAYWRIGHT_STEP4_OWNER_PASSWORD ?? "P@ssw0rd!@#$%";
const skipUpgrade = /^(1|true|yes)$/i.test(process.env.PLAYWRIGHT_STEP4_SKIP_UPGRADE ?? "");
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const contactEmail = process.env.PLAYWRIGHT_STEP4_CONTACT_EMAIL ?? subscriberEmail;
const contactPhone = process.env.PLAYWRIGHT_STEP4_PHONE ?? "+60 17-304 2586";
const companyAddress = process.env.PLAYWRIGHT_STEP4_COMPANY_ADDRESS ?? "Level 10, Jalan Sultan Ismail, 50250 Kuala Lumpur";
const customerAddress = process.env.PLAYWRIGHT_STEP4_CUSTOMER_ADDRESS ?? "Suite 8-3, Menara UOA Bangsar, 59000 Kuala Lumpur";
let cachedAuthJson: string | null = null;

type SubscriberPackageBillingInvoice = {
  id: string;
  invoiceNumber: string;
  amountDue: number;
  paymentLinkUrl?: string | null;
};

type SubscriberPackageBillingSummary = {
  packageName?: string | null;
  packageStatus?: string | null;
  invoices: SubscriberPackageBillingInvoice[];
  availableUpgrades: { code: string; name: string }[];
};

test.setTimeout(300_000);

test("upgrade to growth, create backdated subscription, and queue owner invoice job", async ({ page }) => {
  const runId = Date.now();
  const companyName = `PW Step4 Company ${runId}`;
  const customerName = `PW Step4 Customer ${runId}`;
  const productName = `PW Step4 Product ${runId}`;
  const recurringPlanName = `PW Step4 Monthly ${runId}`;
  const oneTimePlanName = `PW Step4 Setup ${runId}`;
  const subscriptionStartDate = toDateInputValue(monthsAgo(3));

  await login(page, subscriberEmail, subscriberPassword);
  await openWorkspacePage(page, "Companies", /\/companies$/);
  await ensureCompanyExists(page, companyName, runId);
  await ensurePrimaryCompanyBillingProfile(page);

  if (skipUpgrade) {
    await openWorkspacePage(page, "My Plan", /\/package-billing$/);
    const packageSummary = await fetchSubscriberPackageSummary(page);
    if (!/^active$/i.test(packageSummary.packageStatus ?? "") || !/growth/i.test(packageSummary.packageName ?? "")) {
      throw new Error(`PLAYWRIGHT_STEP4_SKIP_UPGRADE is enabled, but the account is not Growth + Active. Current state: ${packageSummary.packageName ?? "unknown"} | ${packageSummary.packageStatus ?? "unknown"}`);
    }
  } else {
    await openWorkspacePage(page, "My Plan", /\/package-billing$/);
    await upgradeSubscriberToGrowth(page);
  }

  await openWorkspacePage(page, "Products", /\/products$/);
  const selectedProductName = await createProduct(page, {
    name: productName,
    code: `PW-STEP4-${runId}`,
    description: "Playwright step4 product",
    category: "Automation",
  });

  await openWorkspacePage(page, "Plans", /\/plans$/);
  await createPlan(page, {
    productName: selectedProductName,
    planName: recurringPlanName,
    planCode: `PW-STEP4-M-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Month",
    intervalCount: "1",
    amount: "120.00",
  });
  await createPlan(page, {
    productName: selectedProductName,
    planName: oneTimePlanName,
    planCode: `PW-STEP4-OT-${runId}`,
    billingType: "OneTime",
    amount: "80.00",
  });

  await openWorkspacePage(page, "Customers", /\/customers$/);
  await createCustomer(page, customerName);

  await openWorkspacePage(page, "Subscriptions", /\/subscriptions$/);
  await fillSubscriptionDraft(page, {
    customerName,
    recurringPlanName,
    oneTimePlanName,
    startDate: subscriptionStartDate,
  });
  await page.getByRole("button", { name: /^create subscription$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".subscription-table")).toContainText(customerName);

  await signOut(page);
  await login(page, ownerEmail, ownerPassword);
  await openWorkspacePage(page, "Settings", /\/platform\/settings$/);
  await page.getByRole("button", { name: /^jobs$/i }).click();

  const generateInvoicesCard = page.locator(".platform-job-card").filter({ hasText: "Generate invoices" }).first();
  await expect(generateInvoicesCard).toBeVisible();
  await generateInvoicesCard.getByRole("button", { name: /^run now$/i }).click();

  const triggerResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/platform/jobs/generate-invoices/trigger")
      && response.request().method() === "POST",
    { timeout: 120000 },
  );

  await confirmModal(page);

  const triggerResponse = await triggerResponsePromise;
  if (!triggerResponse.ok()) {
    const body = await triggerResponse.text().catch(() => "");
    throw new Error(`generate-invoices trigger failed with ${triggerResponse.status()}: ${body || "no response body"}`);
  }

  await expect(page.getByText(/generate invoices was queued in hangfire/i)).toBeVisible({ timeout: 30000 });
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/work email/i).fill(email);
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/app$/);
  await snapshotAuth(page);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /^sign out$/i }).click();
  await confirmModal(page, /^sign out$/i);
  await expect(page).toHaveURL(/\/login$/);
  cachedAuthJson = null;
}

async function openWorkspacePage(page: Page, label: string, expectedUrl: RegExp) {
  const navLink = page.locator(".nav").getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first();
  await expect(navLink).toBeVisible();
  await navLink.click();
  await page.waitForURL(expectedUrl);
}

async function ensureCompanyExists(page: Page, companyName: string, runId: number) {
  const firstRow = page.locator(".company-table tbody tr").first();
  const emptyState = page.getByRole("heading", { name: "No companies yet", exact: true });
  await Promise.race([
    firstRow.waitFor({ state: "visible", timeout: 10000 }),
    emptyState.waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  if (await firstRow.isVisible().catch(() => false)) {
    return;
  }

  await page.getByLabel(/company name/i).fill(companyName);
  await page.getByLabel(/registration number/i).fill(`PWSTEP4${runId}`);
  await page.getByLabel(/^email$/i).fill(contactEmail);
  await page.getByLabel(/^phone$/i).fill(contactPhone);
  await page.getByLabel(/address/i).fill(companyAddress);
  await page.getByRole("button", { name: /^create company$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".company-table tbody tr").first()).toBeVisible();
}

async function ensurePrimaryCompanyBillingProfile(page: Page) {
  const firstRow = page.locator(".company-table tbody tr").first();
  await expect(firstRow).toBeVisible();
  await firstRow.getByRole("button", { name: /manage/i }).click();
  await page.getByRole("button", { name: /edit company/i }).click();
  await expect(page.getByRole("heading", { name: /update billing profile/i })).toBeVisible();

  await page.getByLabel(/^phone$/i).fill(contactPhone);
  await page.getByLabel(/address/i).fill(companyAddress);
  await page.getByRole("button", { name: /^update company$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".company-table tbody tr").first()).toBeVisible({ timeout: 30000 });
}

async function upgradeSubscriberToGrowth(page: Page) {
  await expect(page.getByRole("heading", { name: /my plan/i })).toBeVisible();
  let summary = await fetchSubscriberPackageSummary(page);

  if (!/^active$/i.test(summary.packageStatus ?? "")) {
    const currentInvoice = summary.invoices.find((invoice) => invoice.amountDue > 0);
    if (!currentInvoice) {
      throw new Error(`Package is ${summary.packageStatus ?? "unknown"}, but there is no open package invoice to pay.`);
    }

    await payPackageInvoice(page, currentInvoice.id);
    summary = await waitForPackageState(page, (candidate) => /^active$/i.test(candidate.packageStatus ?? ""), "Expected current package to become active after payment.");
  }

  if (/growth/i.test(summary.packageName ?? "")) {
    await expect(page.locator(".subscriber-billing-hero h3").first()).toContainText(/growth/i);
    return;
  }

  const growthUpgradeCard = page.locator(".subscriber-upgrade-item").filter({ hasText: /growth/i }).first();
  await expect(growthUpgradeCard).toBeVisible({ timeout: 15000 });
  await growthUpgradeCard.getByRole("button", { name: /see upgrade price/i }).click();
  await expect(page.getByRole("dialog", { name: /upgrade quote/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /create upgrade invoice/i }).click();
  await expect(page.getByText(/upgrade invoice .* is ready/i).first()).toBeVisible({ timeout: 30000 });

  const summaryAfterInvoice = await fetchSubscriberPackageSummary(page);
  const openUpgradeInvoice = summaryAfterInvoice.invoices.find((invoice) => invoice.amountDue > 0);
  if (!openUpgradeInvoice) {
    throw new Error("Upgrade invoice was not created.");
  }

  await payPackageInvoice(page, openUpgradeInvoice.id);
  const growthSummary = await waitForPackageState(
    page,
    (candidate) => /^active$/i.test(candidate.packageStatus ?? "") && /growth/i.test(candidate.packageName ?? ""),
    "Expected package to become Growth and active after payment confirmation.",
  );

  await expect(page.locator(".subscriber-billing-hero h3").first()).toContainText(/growth/i);
  expect(growthSummary.packageStatus ?? "").toMatch(/^active$/i);
}

async function createProduct(
  page: Page,
  details: { name: string; code: string; description: string; category: string },
) {
  await ensureCompanySelectedForProduct(page);
  await page.getByLabel(/^name$/i).fill(details.name);
  await page.getByLabel(/^code$/i).fill(details.code);
  await page.getByLabel(/description/i).fill(details.description);
  await page.getByLabel(/category/i).fill(details.category);
  await page.getByRole("button", { name: /^create product$/i }).click();
  await confirmModal(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const createdRow = page.locator(".products-table tbody tr").filter({ hasText: details.name }).first();
  await expect(createdRow).toBeVisible({ timeout: 15000 });
  return details.name;
}

async function ensureCompanySelectedForProduct(page: Page) {
  const companySelect = page.locator("#product-company");
  await expect(companySelect).toBeVisible();
  await page.waitForFunction(
    (selector) => {
      const select = document.querySelector(selector) as HTMLSelectElement | null;
      return Boolean(select && select.options.length > 0 && select.value);
    },
    "#product-company",
    { timeout: 15000 },
  );
}

async function createPlan(
  page: Page,
  details: {
    productName: string;
    planName: string;
    planCode: string;
    billingType: "Recurring" | "OneTime";
    amount: string;
    intervalUnit?: "Month" | "Quarter" | "Year";
    intervalCount?: string;
  },
) {
  await page.locator("#plan-product").selectOption({ label: details.productName });
  await page.locator("#plan-name").fill(details.planName);
  await page.locator("#plan-code").fill(details.planCode);
  await page.locator("#plan-billing-type").selectOption(details.billingType);
  if (details.billingType === "Recurring") {
    await page.locator("#plan-interval-unit").selectOption(details.intervalUnit ?? "Month");
    await page.locator("#plan-interval-count").fill(details.intervalCount ?? "1");
  }
  await page.locator("#plan-amount").fill(details.amount);
  await page.getByRole("button", { name: /^create plan$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".plans-table tbody tr").filter({ hasText: details.planName }).first()).toBeVisible({ timeout: 15000 });
}

async function createCustomer(page: Page, customerName: string) {
  await page.getByLabel(/^name$/i).fill(customerName);
  await page.getByLabel(/^email$/i).fill(contactEmail);
  await page.getByLabel(/^phone$/i).fill(contactPhone);
  await page.getByLabel(/billing address/i).fill(customerAddress);
  await page.getByRole("button", { name: /^save$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".customer-table tbody tr").filter({ hasText: customerName }).first()).toBeVisible({ timeout: 15000 });
}

async function fillSubscriptionDraft(
  page: Page,
  details: {
    customerName: string;
    recurringPlanName: string;
    oneTimePlanName: string;
    startDate: string;
  },
) {
  const customerSelect = page.getByRole("combobox", { name: "Customer", exact: true });
  const planSelect = page.getByRole("combobox", { name: "Plan", exact: true });
  const quantityInput = page.getByRole("textbox", { name: "Quantity", exact: true });
  const startDateInput = page.getByRole("textbox", { name: "Start date", exact: true });

  await customerSelect.selectOption({ label: details.customerName });
  await selectOptionContainingText(planSelect, details.recurringPlanName);
  await quantityInput.fill("1");
  await page.getByRole("button", { name: /add item/i }).click();
  await expect(page.locator(".dashboard-list-item").filter({ hasText: details.recurringPlanName }).first()).toBeVisible();

  await selectOptionContainingText(planSelect, details.oneTimePlanName);
  await quantityInput.fill("1");
  await page.getByRole("button", { name: /add item/i }).click();
  await expect(page.locator(".dashboard-list-item").filter({ hasText: details.oneTimePlanName }).first()).toBeVisible();

  await startDateInput.fill(details.startDate);
}

async function selectOptionContainingText(select: Locator, text: string) {
  const optionValue = await select.locator("option").filter({ hasText: text }).first().getAttribute("value");
  if (!optionValue) {
    throw new Error(`Could not find an option containing "${text}".`);
  }

  await select.selectOption(optionValue);
}

async function confirmModal(page: Page, confirmName: RegExp = /^confirm$/i) {
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  const confirmButton = dialog.getByRole("button", { name: confirmName });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
}

async function fetchSubscriberPackageSummary(page: Page) {
  return await getJson<SubscriberPackageBillingSummary>(page, "/api/package-billing");
}

async function payPackageInvoice(page: Page, invoiceId: string) {
  const paymentLinkInvoice = await postJson<SubscriberPackageBillingInvoice>(
    page,
    `/api/package-billing/invoices/${invoiceId}/payment-link`,
    "POST",
  );

  if (!paymentLinkInvoice.paymentLinkUrl) {
    throw new Error("Package payment link was not returned.");
  }

  await completeGatewayPayment(page.request, page.url(), paymentLinkInvoice.paymentLinkUrl);
  await page.goto("/package-billing");
  await restoreAuthIfMissing(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function waitForPackageState(
  page: Page,
  predicate: (summary: SubscriberPackageBillingSummary) => boolean,
  message: string,
) {
  let lastSummary: SubscriberPackageBillingSummary | null = null;

  await expect.poll(
    async () => {
      lastSummary = await fetchSubscriberPackageSummary(page);
      return predicate(lastSummary);
    },
    {
      timeout: 120000,
      message,
    },
  ).toBe(true);

  if (!lastSummary) {
    throw new Error(message);
  }

  return lastSummary;
}

async function getJson<T>(page: Page, path: string) {
  const response = await apiRequest(page.request, await buildAbsoluteApiUrl(page, path), await buildAuthHeaders(page), "GET");
  return await response.json() as T;
}

async function postJson<T>(page: Page, path: string, method: "POST" | "PUT", body?: unknown) {
  const headers = await buildAuthHeaders(page);
  headers["Content-Type"] = "application/json";
  const response = await apiRequest(page.request, await buildAbsoluteApiUrl(page, path), headers, method, body === undefined ? undefined : JSON.stringify(body));
  return await response.json() as T;
}

async function apiRequest(request: APIRequestContext, url: string, headers: Record<string, string>, method: "GET" | "POST" | "PUT", data?: string) {
  const response = await request.fetch(url, { method, headers, data });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`${method} ${url} failed with ${response.status()}: ${body || "no response body"}`);
  }

  return response;
}

async function buildAuthHeaders(page: Page) {
  const raw = await page.evaluate(() => window.localStorage.getItem("recurvos.auth"));
  const resolvedRaw = raw ?? cachedAuthJson;
  const token = resolvedRaw
    ? extractAccessToken(resolvedRaw)
    : null;

  if (!token) {
    throw new Error("Could not resolve the current access token from local storage.");
  }

  return { Authorization: `Bearer ${token}` };
}

async function snapshotAuth(page: Page) {
  cachedAuthJson = await page.evaluate(() => window.localStorage.getItem("recurvos.auth"));
  if (!cachedAuthJson) {
    throw new Error("Login completed, but no auth payload was found in local storage.");
  }
}

async function restoreAuthIfMissing(page: Page) {
  const existing = await page.evaluate(() => window.localStorage.getItem("recurvos.auth"));
  if (existing || !cachedAuthJson) {
    return;
  }

  await page.goto("/login");
  await page.evaluate((value) => window.localStorage.setItem("recurvos.auth", value), cachedAuthJson);
  await page.goto("/package-billing");
}

function extractAccessToken(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

async function buildAbsoluteApiUrl(page: Page, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath.replace(/^\/api/, "")}`;
}

async function completeGatewayPayment(request: APIRequestContext, currentPageUrl: string, paymentLinkUrl: string) {
  const appOrigin = new URL(apiBaseUrl).origin;
  const parsedPaymentUrl = new URL(paymentLinkUrl);

  if (parsedPaymentUrl.hostname.includes("stripe.com")) {
    const sessionIdMatch = parsedPaymentUrl.pathname.match(/(cs_[A-Za-z0-9_]+)/);
    const sessionId = sessionIdMatch?.[1];
    if (!sessionId) {
      throw new Error(`Could not derive the Stripe checkout session id from ${paymentLinkUrl}.`);
    }

    const response = await request.post(`${appOrigin}/api/webhooks/stripe/complete?stripe_status=success&session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(`Stripe completion failed with ${response.status()}: ${body || "no response body"}`);
    }
    return;
  }

  const pathSegments = parsedPaymentUrl.pathname.split("/").filter(Boolean);
  const paymentId = pathSegments[pathSegments.length - 1];
  if (!paymentId) {
    throw new Error(`Could not derive the payment id from ${paymentLinkUrl}.`);
  }

  const response = await request.post(`${appOrigin}/api/webhooks/billplz/complete?billplz[id]=${encodeURIComponent(paymentId)}&billplz[paid]=true`);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Billplz completion failed with ${response.status()}: ${body || "no response body"}`);
  }
}

function monthsAgo(count: number) {
  const value = new Date();
  value.setMonth(value.getMonth() - count);
  return value;
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function deriveApiBaseUrl(baseUrl: string) {
  const origin = new URL(baseUrl);

  if (origin.hostname === "localhost" || origin.hostname === "127.0.0.1") {
    return "http://localhost:7001/api";
  }

  if (origin.hostname === "staging.recurvos.com") {
    return "https://staging-api.recurvos.com/api";
  }

  if (origin.hostname === "recurvos.com" || origin.hostname === "www.recurvos.com") {
    return "https://api.recurvos.com/api";
  }

  return `${origin.origin}/api`;
}
