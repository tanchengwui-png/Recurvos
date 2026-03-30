import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STEP3_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STEP3_PASSWORD ?? "P@ssw0rd!@#$%";
const contactEmail = process.env.PLAYWRIGHT_STEP3_CONTACT_EMAIL ?? loginEmail;
const contactPhone = process.env.PLAYWRIGHT_STEP3_PHONE ?? "+60 17-304 2586";
const bankName = process.env.PLAYWRIGHT_STEP3_BANK_NAME ?? "Maybank";
const bankAccountName = process.env.PLAYWRIGHT_STEP3_BANK_ACCOUNT_NAME ?? "Tan Cheng Wui";
const bankAccountNumber = process.env.PLAYWRIGHT_STEP3_BANK_ACCOUNT_NUMBER ?? "514029876543";
const companyAddress = process.env.PLAYWRIGHT_STEP3_COMPANY_ADDRESS ?? "Level 10, Jalan Sultan Ismail, 50250 Kuala Lumpur";
const customerAddress = process.env.PLAYWRIGHT_STEP3_CUSTOMER_ADDRESS ?? "Suite 8-3, Menara UOA Bangsar, 59000 Kuala Lumpur";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const companyLogoPath = path.resolve(currentDirPath, "assets/company-logo.png");
const paymentQrPath = path.resolve(currentDirPath, "assets/payment-qr.png");

test.setTimeout(240_000);

test("company logo, payment setup, and overdue subscription invoice flow", async ({ page }) => {
  const runId = Date.now();
  const companyName = `Playwright Billing ${runId}`;
  const customerName = `PW Billing Customer ${runId}`;
  const recurringPlanName = `PW Billing Monthly ${runId}`;
  const oneTimePlanName = `PW Billing Setup ${runId}`;
  const productName = `PW Billing Product ${runId}`;
  const subscriptionStartDate = toDateInputValue(monthsAgo(3));

  await login(page);

  await openWorkspacePage(page, "Companies", /\/companies$/);
  await ensureCompanyExists(page, companyName, runId);
  await editPrimaryCompany(page);
  await uploadCompanyLogo(page);

  await openWorkspacePage(page, "Settings", /\/settings$/);
  await configurePaymentSetup(page);

  await openWorkspacePage(page, "Products", /\/products$/);
  const selectedProductName = await createProduct(page, {
    name: productName,
    code: `PW-BILLING-${runId}`,
    description: "Playwright billing product",
    category: "Automation",
  });

  await openWorkspacePage(page, "Plans", /\/plans$/);
  await createPlan(page, {
    productName: selectedProductName,
    planName: recurringPlanName,
    planCode: `PW-BILL-M-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Month",
    intervalCount: "1",
    amount: "120.00",
  });
  await createPlan(page, {
    productName: selectedProductName,
    planName: oneTimePlanName,
    planCode: `PW-BILL-OT-${runId}`,
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
    const body = await dueInvoicesResponse.text().catch(() => "");
    throw new Error(`run-due-invoices failed with ${dueInvoicesResponse.status()}: ${body || "no response body"}`);
  }

  const dueInvoicesResult = await dueInvoicesResponse.json().catch(() => null) as { created?: number } | null;
  await expect(page.getByRole("dialog", { name: /run invoices now/i })).toBeHidden({ timeout: 30000 });
  if ((dueInvoicesResult?.created ?? 0) > 0) {
    await expect(page.getByText(/subscription invoice.*generated/i).first()).toBeVisible({ timeout: 30000 });
    return;
  }

  await expect(page.getByText(/no subscriptions were ready for invoice generation/i).first()).toBeVisible({ timeout: 30000 });
});

async function login(page: Page) {
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
  await page.getByLabel(/registration number/i).fill(`PWBILL${runId}`);
  await page.getByLabel(/^email$/i).fill(contactEmail);
  await page.getByLabel(/^phone$/i).fill(contactPhone);
  await page.getByLabel(/address/i).fill(companyAddress);
  await page.getByRole("button", { name: /^create company$/i }).click();
  await confirmModal(page);
  await expect(page.locator(".company-table tbody tr").first()).toBeVisible();
}

async function editPrimaryCompany(page: Page) {
  const firstRow = page.locator(".company-table tbody tr").first();
  await expect(firstRow).toBeVisible();
  await firstRow.getByRole("button", { name: /manage/i }).click();
  await page.getByRole("button", { name: /edit company/i }).click();
  await expect(page.getByRole("heading", { name: /update billing profile/i })).toBeVisible();
}

async function uploadCompanyLogo(page: Page) {
  await page.getByLabel(/logo file/i).setInputFiles(companyLogoPath);
  await page.getByRole("button", { name: /upload logo/i }).click();
  await confirmModal(page);
  await expect(page.getByText(/logo uploaded/i).first()).toBeVisible({ timeout: 30000 });
}

async function configurePaymentSetup(page: Page) {
  await page.getByRole("button", { name: /^payment$/i }).click();
  await page.getByRole("button", { name: /^manual$/i }).click();
  await page.getByLabel(/bank name/i).fill(bankName);
  await page.getByLabel(/account name/i).fill(bankAccountName);
  await page.getByLabel(/account number/i).fill(bankAccountNumber);
  await page.getByLabel(/payment due days/i).fill("14");

  await page.getByRole("button", { name: /^qr$/i }).click();
  await page.locator("#payment-qr-upload").setInputFiles(paymentQrPath);
  await page.getByRole("checkbox", { name: /i acknowledge that this payment qr code/i }).check();

  await page.getByRole("button", { name: /save payment setup/i }).click();
  await confirmModal(page);
  await expect(page.getByText(/qr uploaded and ready to print on invoices/i).first()).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /^manual$/i }).click();
  await expect(page.getByLabel(/bank name/i)).toHaveValue(bankName);
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

async function confirmModal(page: Page) {
  const confirmButton = page.getByRole("button", { name: /^confirm$/i });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
}

function monthsAgo(count: number) {
  const value = new Date();
  value.setMonth(value.getMonth() - count);
  return value;
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}
