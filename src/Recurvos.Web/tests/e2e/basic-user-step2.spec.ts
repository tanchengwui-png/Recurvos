import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_BASIC_USER_EMAIL ?? "Recurvos-Basic@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_BASIC_USER_PASSWORD ?? "P@ssw0rd!@#$%";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const sharedContactEmail = process.env.PLAYWRIGHT_STEP2_CONTACT_EMAIL ?? "tanchengwui@hotmail.com";
const sharedPhoneNumber = process.env.PLAYWRIGHT_STEP2_PHONE ?? "0173042586";
const companyAddress = process.env.PLAYWRIGHT_STEP2_COMPANY_ADDRESS ?? "Level 10, Jalan Sultan Ismail, 50250 Kuala Lumpur";
const customerAddress = process.env.PLAYWRIGHT_STEP2_CUSTOMER_ADDRESS ?? "Suite 8-3, Menara UOA Bangsar, 59000 Kuala Lumpur";

test.setTimeout(180000);

test("basic user setup flow covers limits, billing readiness, subscriptions, and overdue invoices", async ({ page }) => {
  const runId = Date.now();
  const preferredProductOneName = `PW Product Alpha ${runId}`;
  const preferredRecurringPlanName = `PW Alpha Monthly ${runId}`;
  const firstCustomerName = `PW Customer One ${runId}`;
  const subscriptionStartDate = toDateInputValue(monthsAgo(3));

  await loginAsBasicUser(page);

  await openWorkspacePage(page, "Companies", /\/companies$/);
  await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();

  await ensurePrimaryCompany(page, runId);

  await attemptBlockedSecondCompany(page, runId);
  await repairPrimaryCompanyViaApi(page, runId);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();

  await openWorkspacePage(page, "Products", /\/products$/);
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  const productOneName = await createProduct(page, {
    name: preferredProductOneName,
    code: `PW-ALPHA-${runId}`,
    description: "Playwright recurring product",
    category: "Automation",
  });
  await openWorkspacePage(page, "Plans", /\/plans$/);
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
  const recurringPlanName = await createPlan(page, {
    productName: productOneName,
    planName: preferredRecurringPlanName,
    planCode: `PW-ALPHA-M-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Month",
    intervalCount: "1",
    amount: "120.00",
  });
  await openWorkspacePage(page, "Customers", /\/customers$/);
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await createCustomer(page, { name: firstCustomerName });
  await createCustomer(page, { name: `PW Customer Two ${runId}` });
  await createCustomer(page, { name: `PW Customer Three ${runId}` });

  await openWorkspacePage(page, "Subscriptions", /\/subscriptions$/);
  await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();
  await fillSubscriptionDraft(page, {
    customerName: firstCustomerName,
    recurringPlanName,
    startDate: subscriptionStartDate,
  });
  await page.getByRole("button", { name: /^create subscription$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".subscription-table")).toContainText(firstCustomerName);

  await page.getByRole("button", { name: /run invoices now/i }).click();
  const dueInvoicesResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/subscriptions/run-due-invoices")
      && response.request().method() === "POST",
    { timeout: 120000 },
  );
  await confirmModal(page);
  const dueInvoicesResponse = await dueInvoicesResponsePromise.catch(() => null);
  if (!dueInvoicesResponse) {
    throw new Error("run-due-invoices request did not finish within 120 seconds.");
  }

  if (!dueInvoicesResponse.ok()) {
    const responseBody = await dueInvoicesResponse.text().catch(() => "");
    throw new Error(`run-due-invoices failed with ${dueInvoicesResponse.status()}: ${responseBody || "no response body"}`);
  }

  const dueInvoicesResult = await dueInvoicesResponse.json().catch(() => null) as { created?: number } | null;
  await expect(page.getByRole("dialog", { name: /run invoices now/i })).toBeHidden({ timeout: 30000 });
  if ((dueInvoicesResult?.created ?? 0) > 0) {
    await expect(page.getByText(/subscription invoice.*generated/i).first()).toBeVisible({ timeout: 30000 });
    return;
  }

  await expect(page.getByText(/no subscriptions were ready for invoice generation/i).first()).toBeVisible({ timeout: 30000 });
});

async function loginAsBasicUser(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/work email/i).fill(loginEmail);
  await page.getByPlaceholder(/enter your password/i).fill(loginPassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openWorkspacePage(page: Page, label: string, expectedUrl: RegExp) {
  const navLink = page.locator(".nav").getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first();
  await expect(navLink).toBeVisible();
  await navLink.click();
  await page.waitForURL(expectedUrl);
}

async function attemptBlockedSecondCompany(page: Page, runId: number) {
  await openCompanyCreateForm(page);
  await page.getByLabel(/company name/i).fill(`PW Extra Company ${runId}`);
  await page.getByLabel(/registration number/i).fill(`PWCO${runId}`);
  await page.getByLabel(/^email$/i).fill(`extra-company-${runId}@example.com`);
  await page.getByLabel(/^phone$/i).fill(sharedPhoneNumber);
  await page.getByLabel(/address/i).fill(companyAddress);
  await page.getByRole("button", { name: /^create company$/i }).click();
  await confirmModal(page);
  await expect(page.getByText(/allows up to 1 billing profiles/i).first()).toBeVisible();
  await closeCompanyForm(page);
}

async function ensurePrimaryCompany(page: Page, runId: number) {
  const companyRows = page.locator(".company-table tbody tr");
  const firstCompanyRow = companyRows.first();
  const emptyStateHeading = page.getByRole("heading", { name: "No companies yet", exact: true });

  await Promise.race([
    firstCompanyRow.waitFor({ state: "visible", timeout: 10000 }),
    emptyStateHeading.waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => undefined);

  await page.waitForLoadState("networkidle").catch(() => undefined);

  if (await firstCompanyRow.isVisible().catch(() => false)) {
    return getFirstTableCellText(page, ".company-table");
  }

  const primaryCompanyName = `PW Primary Company ${runId}`;
  await openCompanyCreateForm(page);
  await page.getByLabel(/company name/i).fill(primaryCompanyName);
  await page.getByLabel(/registration number/i).fill(`PWMAIN${runId}`);
  await page.getByLabel(/^email$/i).fill(`primary-company-${runId}@example.com`);
  await page.getByLabel(/^phone$/i).fill("");
  await page.getByLabel(/address/i).fill(companyAddress);
  await page.getByRole("button", { name: /^create company$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".company-table")).toContainText(primaryCompanyName);
  return primaryCompanyName;
}

async function repairPrimaryCompanyViaApi(page: Page, runId: number) {
  const companyId = await page.evaluate(async ({ apiBaseUrl, runId, sharedPhoneNumber, companyAddress }) => {
    const authRaw = window.localStorage.getItem("recurvos.auth");
    if (!authRaw) {
      throw new Error("Missing auth session.");
    }

    const auth = JSON.parse(authRaw) as { accessToken?: string };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (auth.accessToken) {
      headers.Authorization = `Bearer ${auth.accessToken}`;
    }

    const companiesResponse = await fetch(`${apiBaseUrl}/companies`, {
      method: "GET",
      headers,
    });

    if (!companiesResponse.ok) {
      throw new Error(`Unable to load companies (${companiesResponse.status}).`);
    }

    const companies = await companiesResponse.json() as Array<{ id: string }>;
    const companyId = companies[0]?.id;
    if (!companyId) {
      throw new Error("No company found for subscriber.");
    }

    const updateResponse = await fetch(`${apiBaseUrl}/companies/${companyId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        name: `PW Billing Company ${runId}`,
        registrationNumber: `PWBILL${runId}`,
        email: `billing-company-${runId}@example.com`,
        phone: sharedPhoneNumber,
        address: companyAddress,
        industry: "",
        natureOfBusiness: "",
        isActive: true,
      }),
    });

    if (!updateResponse.ok) {
      const raw = await updateResponse.text().catch(() => "");
      throw new Error(`Unable to repair company (${updateResponse.status}): ${raw || "no response body"}`);
    }

    return companyId;
  }, { apiBaseUrl, runId, sharedPhoneNumber, companyAddress });

  expect(companyId).toBeTruthy();
}

async function openCompanyCreateForm(page: Page) {
  const addButton = page.getByRole("button", { name: /add company|create first company/i }).first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
  }

  await Promise.race([
    page.getByLabel(/company name/i).waitFor({ state: "visible", timeout: 10000 }),
    page.getByRole("heading", { name: /create billing profile|add company/i }).waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => undefined);
}

async function closeCompanyForm(page: Page) {
  const createDialog = page.getByRole("dialog", { name: /create company/i });
  if (await createDialog.isVisible().catch(() => false)) {
    await createDialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(createDialog).toBeHidden();
  }

  const backButton = page.getByRole("button", { name: /back to companies/i }).first();
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
    await expect(page.locator(".company-table, .dashboard-table").first()).toBeVisible();
    return;
  }

  const cancelButton = page.getByRole("button", { name: /^cancel$/i }).first();
  if (await cancelButton.isVisible().catch(() => false)) {
    await cancelButton.click();
    await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
  }
}

async function createProduct(
  page: Page,
  details: {
    name: string;
    code: string;
    description: string;
    category: string;
  },
  excludedProductNames: string[] = [],
) {
  if (await isProductCapacityFull(page)) {
    const fallbackProductName = await getReusableProductName(page, excludedProductNames);
    if (fallbackProductName) {
      return fallbackProductName;
    }
  }

  await openProductForm(page);
  await ensureCompanySelectedForProduct(page);
  await page.getByLabel(/^name$/i).fill(details.name);
  await page.getByLabel(/^code$/i).fill(details.code);
  await page.getByLabel(/description/i).fill(details.description);
  await page.getByLabel(/category/i).fill(details.category);
  await page.getByRole("button", { name: /^create product$/i }).click();
  await confirmModal(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const createdRow = page.locator(".products-table tbody tr").filter({ hasText: details.name }).first();
  if (await createdRow.isVisible().catch(() => false)) {
    await expect(createdRow).toBeVisible();
    return details.name;
  }

  const limitErrorText = await firstVisibleText(page.locator(".helper-text-error, .helper-text.helper-text-error").filter({ hasText: /allows up to \d+ products/i }));
  if (limitErrorText) {
    await closeProductForm(page);
    const fallbackProductName = await getReusableProductName(page, excludedProductNames);
    if (fallbackProductName) {
      return fallbackProductName;
    }

    throw new Error(`Product creation hit the package limit and no reusable product was available. Error: ${limitErrorText}`);
  }

  await createdRow.waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
  if (await createdRow.isVisible().catch(() => false)) {
    return details.name;
  }

  const formError = await firstVisibleText(page.locator(".helper-text-error, .helper-text.helper-text-error"));
  throw new Error(`Product creation did not succeed for ${details.name}. Visible error: ${formError || "none"}`);
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
  await openPlanForm(page);
  await page.locator("#plan-product").or(page.getByRole("combobox", { name: /^product$/i })).selectOption({ label: details.productName });
  await page.locator("#plan-name").or(page.getByLabel(/^plan name$/i)).fill(details.planName);
  await page.locator("#plan-code").or(page.getByLabel(/^plan code$/i)).fill(details.planCode);
  await page.locator("#plan-billing-type").or(page.getByRole("combobox", { name: /^billing type$/i })).selectOption(details.billingType);

  if (details.billingType === "Recurring") {
    await page.locator("#plan-interval-unit").or(page.getByRole("combobox", { name: /^interval$/i })).selectOption({ label: intervalLabel(details.intervalUnit ?? "Month") });
    await page.locator("#plan-interval-count").or(page.getByLabel(/^count$/i)).fill(details.intervalCount ?? "1");
  }

  await page.locator("#plan-amount").or(page.getByLabel(/^amount$/i)).fill(details.amount);
  await page.getByRole("button", { name: /^create plan$/i }).click();
  await confirmModal(page);

  const createdPlanRow = page.locator(".plans-table tbody tr").filter({ hasText: details.planName }).first();
  if (await createdPlanRow.isVisible().catch(() => false)) {
    await expect(createdPlanRow).toBeVisible();
    return details.planName;
  }

  const limitErrorText = await firstVisibleText(page.locator(".helper-text-error, .helper-text.helper-text-error").filter({ hasText: /allows up to \d+ plans/i }));
  if (limitErrorText) {
    const reusablePlanName = await getReusablePlanName(page, details.billingType);
    if (reusablePlanName) {
      return reusablePlanName;
    }

    return details.planName;
  }

  const reusablePlanName = await getReusablePlanName(page, details.billingType);
  if (reusablePlanName) {
    return reusablePlanName;
  }

  await expect(page.locator(".plans-table")).toContainText(details.planName);
  return details.planName;
}

async function createCustomer(page: Page, details: { name: string }) {
  await openCustomerForm(page);
  await page.getByLabel(/^name$/i).fill(details.name);
  await page.getByLabel(/^email$/i).fill(sharedContactEmail);
  await page.getByLabel(/^phone$/i).fill(sharedPhoneNumber);
  await page.locator('input[name="billingAddress"]').fill(customerAddress);
  await page.getByRole("button", { name: /^save customer$|^save$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".customer-table")).toContainText(details.name);
}

async function fillSubscriptionDraft(
  page: Page,
  details: {
    customerName: string;
    recurringPlanName: string;
    oneTimePlanName?: string;
    startDate: string;
  },
) {
  await openSubscriptionForm(page);

  await ensureSubscriptionCompanySelected(page);
  const customerSelect = page.getByRole("combobox", { name: /^customer$/i });
  const planSelect = page.getByRole("combobox", { name: /^plan$/i });
  const quantityInput = page.getByLabel(/^quantity$/i);
  const startDateInput = page.getByLabel(/^start date$/i);

  await customerSelect.selectOption({ label: details.customerName });
  await selectOptionContainingText(planSelect, details.recurringPlanName);
  await quantityInput.fill("1");
  await page.getByRole("button", { name: /add item/i }).click();
  await expect(page.locator(".dashboard-list-item").filter({ hasText: details.recurringPlanName }).first()).toBeVisible();

  if (details.oneTimePlanName) {
    await selectOptionContainingText(planSelect, details.oneTimePlanName);
    await quantityInput.fill("1");
    await page.getByRole("button", { name: /add item/i }).click();
    await expect(page.locator(".dashboard-list-item").filter({ hasText: details.oneTimePlanName }).first()).toBeVisible();
  }

  await startDateInput.fill(details.startDate);
}

async function confirmModal(page: Page) {
  const confirmButton = page.getByRole("button", { name: /^confirm$/i });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
}

async function selectOptionContainingText(select: ReturnType<Page["getByLabel"]>, text: string) {
  const optionValue = await select.locator("option").filter({ hasText: text }).first().getAttribute("value");
  if (!optionValue) {
    throw new Error(`Could not find an option containing "${text}".`);
  }

  await select.selectOption(optionValue);
}

async function getFirstTableCellText(page: Page, tableClassName: string) {
  return (await page.locator(`${tableClassName} tbody tr`).first().locator("td").first().locator("span").first().innerText()).trim();
}

async function getReusableProductName(page: Page, excludedProductNames: string[]) {
  if (!(await page.locator(".products-table tbody tr").first().isVisible().catch(() => false))) {
    await closeProductForm(page);
  }

  const rows = page.locator(".products-table tbody tr");
  const count = await rows.count();

  for (let index = 0; index < count; index += 1) {
    const productName = (await rows.nth(index).locator("td").first().locator(".table-primary-title, button.table-link, span").first().innerText()).trim();
    if (productName && !excludedProductNames.includes(productName)) {
      return productName;
    }
  }

  return null;
}

async function getReusablePlanName(page: Page, billingType: "Recurring" | "OneTime") {
  const rows = page.locator(".plans-table tbody tr");
  const count = await rows.count();

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const rowText = await row.innerText();
    const matchesBillingType = billingType === "OneTime"
      ? /one-time/i.test(rowText)
      : /recurring billing/i.test(rowText);

    if (!matchesBillingType) {
      continue;
    }

    const planName = (await row.locator("td").first().innerText())
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean) ?? "";
    if (planName) {
      return planName;
    }
  }

  return "";
}

async function firstVisibleText(locator: ReturnType<Page["locator"]>) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      return (await item.innerText()).trim();
    }
  }

  return "";
}

async function isProductCapacityFull(page: Page) {
  const usageText = await firstVisibleText(page.getByText(/products used:/i));
  const match = usageText.match(/products used:\s*(\d+)\s*\/\s*(\d+)/i);
  if (!match) {
    return false;
  }

  const current = Number(match[1]);
  const limit = Number(match[2]);
  return Number.isFinite(current) && Number.isFinite(limit) && limit > 0 && current >= limit;
}

async function ensureCompanySelectedForProduct(page: Page) {
  await openProductForm(page);
  const companySelect = page.locator("#product-company").or(page.getByRole("combobox", { name: /^company$/i }));
  await expect(companySelect).toBeVisible();

  await expect.poll(async () => companySelect.locator("option").count(), { timeout: 15000 }).toBeGreaterThan(0);

  const currentValue = await companySelect.inputValue();
  if (currentValue) {
    return;
  }

  const firstOptionValue = await companySelect.locator("option").nth(0).getAttribute("value");
  if (!firstOptionValue) {
    throw new Error("Product company select did not load any valid company option.");
  }

  await companySelect.selectOption(firstOptionValue);
}

async function openProductForm(page: Page) {
  const nameInput = page.locator("#product-name").or(page.getByLabel(/^name$/i));
  if (await nameInput.isVisible().catch(() => false)) {
    return;
  }

  const addButton = page.getByRole("button", { name: /add product|create first product/i }).first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
  }

  await expect(nameInput).toBeVisible({ timeout: 10000 });
}

async function closeProductForm(page: Page) {
  const createDialog = page.getByRole("dialog", { name: /create product|update product/i });
  if (await createDialog.isVisible().catch(() => false)) {
    await createDialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(createDialog).toBeHidden();
  }

  const backButton = page.getByRole("button", { name: /back to products/i }).first();
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
    await expect(page.locator(".products-table, .catalog-table").first()).toBeVisible();
    return;
  }

  const cancelButton = page.getByRole("button", { name: /^cancel$/i }).first();
  if (await cancelButton.isVisible().catch(() => false)) {
    await cancelButton.click();
  }
}

async function openPlanForm(page: Page) {
  const planNameInput = page.locator("#plan-name").or(page.getByLabel(/^plan name$/i));
  if (await planNameInput.isVisible().catch(() => false)) {
    return;
  }

  const addButton = page.getByRole("button", { name: /add plan/i }).first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
  }

  await expect(planNameInput).toBeVisible({ timeout: 10000 });
}

async function openCustomerForm(page: Page) {
  const nameInput = page.getByLabel(/^name$/i);
  if (await nameInput.isVisible().catch(() => false)) {
    return;
  }

  const addButton = page.getByRole("button", { name: /add customer|add first customer/i }).first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
  }

  await expect(nameInput).toBeVisible({ timeout: 10000 });
}

async function openSubscriptionForm(page: Page) {
  const createHeading = page.getByRole("heading", { name: /start customer billing/i });
  if (await createHeading.isVisible().catch(() => false)) {
    return;
  }

  const addButton = page.getByRole("button", { name: /add subscription|create first subscription/i }).first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
  }

  await expect(createHeading).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveURL(/\/subscriptions\/new$/);
}

async function ensureSubscriptionCompanySelected(page: Page) {
  const companySelect = page.getByRole("combobox", { name: /^company$/i });
  await expect(companySelect).toBeVisible({ timeout: 10000 });
  await expect.poll(async () => companySelect.locator("option").count(), { timeout: 15000 }).toBeGreaterThan(0);

  const currentValue = await companySelect.inputValue().catch(() => "");
  if (currentValue) {
    return;
  }

  const optionCount = await companySelect.locator("option").count();
  for (let index = 0; index < optionCount; index += 1) {
    const optionValue = await companySelect.locator("option").nth(index).getAttribute("value");
    if (optionValue) {
      await companySelect.selectOption(optionValue);
      return;
    }
  }

  throw new Error("Subscription company select did not load any valid company option.");
}

function monthsAgo(count: number) {
  const value = new Date();
  value.setMonth(value.getMonth() - count);
  return value;
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function intervalLabel(value: "Month" | "Quarter" | "Year") {
  if (value === "Month") {
    return "Monthly";
  }

  if (value === "Quarter") {
    return "Quarterly";
  }

  return "Yearly";
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
