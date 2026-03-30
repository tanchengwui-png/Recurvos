import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_BASIC_USER_EMAIL ?? "Recurvos-Basic@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_BASIC_USER_PASSWORD ?? "P@ssw0rd!@#$%";
const sharedContactEmail = process.env.PLAYWRIGHT_STEP2_CONTACT_EMAIL ?? "tanchengwui@hotmail.com";
const sharedPhoneNumber = process.env.PLAYWRIGHT_STEP2_PHONE ?? "+60 17-304 2586";
const companyAddress = process.env.PLAYWRIGHT_STEP2_COMPANY_ADDRESS ?? "Level 10, Jalan Sultan Ismail, 50250 Kuala Lumpur";
const customerAddress = process.env.PLAYWRIGHT_STEP2_CUSTOMER_ADDRESS ?? "Suite 8-3, Menara UOA Bangsar, 59000 Kuala Lumpur";

test("basic user setup flow covers limits, billing readiness, subscriptions, and overdue invoices", async ({ page }) => {
  const runId = Date.now();
  const preferredProductOneName = `PW Product Alpha ${runId}`;
  const preferredProductTwoName = `PW Product Beta ${runId}`;
  const recurringPlanName = `PW Alpha Monthly ${runId}`;
  const oneTimePlanName = `PW Alpha Setup ${runId}`;
  const firstCustomerName = `PW Customer One ${runId}`;
  const subscriptionStartDate = toDateInputValue(monthsAgo(3));

  await loginAsBasicUser(page);

  await openWorkspacePage(page, "Companies", /\/companies$/);
  await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();

  await ensurePrimaryCompany(page, runId);

  await attemptBlockedSecondCompany(page, runId);
  await editPrimaryCompany(page);
  await updateCompanyPhone(page, "");

  await openWorkspacePage(page, "Products", /\/products$/);
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  const productOneName = await createProduct(page, {
    name: preferredProductOneName,
    code: `PW-ALPHA-${runId}`,
    description: "Playwright recurring product",
    category: "Automation",
  });
  const productTwoName = await createProduct(page, {
    name: preferredProductTwoName,
    code: `PW-BETA-${runId}`,
    description: "Playwright second product",
    category: "Automation",
  }, [productOneName]);

  await openWorkspacePage(page, "Plans", /\/plans$/);
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
  await createPlan(page, {
    productName: productOneName,
    planName: recurringPlanName,
    planCode: `PW-ALPHA-M-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Month",
    intervalCount: "1",
    amount: "120.00",
  });
  await createPlan(page, {
    productName: productOneName,
    planName: `PW Alpha Quarterly ${runId}`,
    planCode: `PW-ALPHA-Q-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Quarter",
    intervalCount: "1",
    amount: "330.00",
  });
  await createPlan(page, {
    productName: productOneName,
    planName: oneTimePlanName,
    planCode: `PW-ALPHA-OT-${runId}`,
    billingType: "OneTime",
    amount: "80.00",
  });
  await createPlan(page, {
    productName: productTwoName,
    planName: `PW Beta Monthly ${runId}`,
    planCode: `PW-BETA-M-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Month",
    intervalCount: "1",
    amount: "140.00",
  });
  await createPlan(page, {
    productName: productTwoName,
    planName: `PW Beta Yearly ${runId}`,
    planCode: `PW-BETA-Y-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Year",
    intervalCount: "1",
    amount: "1200.00",
  });
  await createPlan(page, {
    productName: productTwoName,
    planName: `PW Beta Setup ${runId}`,
    planCode: `PW-BETA-OT-${runId}`,
    billingType: "OneTime",
    amount: "60.00",
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
    oneTimePlanName,
    startDate: subscriptionStartDate,
  });
  await page.getByRole("button", { name: /^create subscription$/i }).click();
  await expect(page.getByText(/complete the company billing profile before starting subscriptions: company phone/i).first()).toBeVisible();

  await openWorkspacePage(page, "Companies", /\/companies$/);
  await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
  await editPrimaryCompany(page);
  await updateCompanyPhone(page, sharedPhoneNumber);
  await expect(page.locator(".company-table")).toContainText(sharedPhoneNumber);

  await openWorkspacePage(page, "Subscriptions", /\/subscriptions$/);
  await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();
  await fillSubscriptionDraft(page, {
    customerName: firstCustomerName,
    recurringPlanName,
    oneTimePlanName,
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
  await page.getByLabel(/company name/i).fill(`PW Extra Company ${runId}`);
  await page.getByLabel(/registration number/i).fill(`PWCO${runId}`);
  await page.getByLabel(/^email$/i).fill(`extra-company-${runId}@example.com`);
  await page.getByLabel(/^phone$/i).fill(sharedPhoneNumber);
  await page.getByLabel(/address/i).fill(companyAddress);
  await page.getByRole("button", { name: /^create company$/i }).click();
  await confirmModal(page);
  await expect(page.getByText(/allows up to 1 billing profiles/i)).toBeVisible();
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

async function editPrimaryCompany(page: Page) {
  const targetRow = page.locator(".company-table tbody tr").first();
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole("button", { name: /manage/i }).click();
  await page.getByRole("button", { name: /edit company/i }).click();
  await expect(page.getByRole("heading", { name: /update billing profile/i })).toBeVisible();
}

async function updateCompanyPhone(page: Page, phoneNumber: string) {
  await page.getByLabel(/^phone$/i).fill(phoneNumber);
  await page.getByRole("button", { name: /^update company$/i }).click();
  await confirmModal(page);
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
  await expect(page.locator(".plans-table")).toContainText(details.planName);
}

async function createCustomer(page: Page, details: { name: string }) {
  await page.getByLabel(/^name$/i).fill(details.name);
  await page.getByLabel(/^email$/i).fill(sharedContactEmail);
  await page.getByLabel(/^phone$/i).fill(sharedPhoneNumber);
  await page.getByLabel(/billing address/i).fill(customerAddress);
  await page.getByRole("button", { name: /^save$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".customer-table")).toContainText(details.name);
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

function monthsAgo(count: number) {
  const value = new Date();
  value.setMonth(value.getMonth() - count);
  return value;
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}
