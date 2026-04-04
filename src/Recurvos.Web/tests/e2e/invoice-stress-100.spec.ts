import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STRESS_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STRESS_PASSWORD ?? "P@ssw0rd!@#$%";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const invoiceCount = Math.max(1, Number.parseInt(process.env.PLAYWRIGHT_STRESS_INVOICE_COUNT ?? "100", 10) || 100);
const customerEmail = process.env.PLAYWRIGHT_STRESS_CUSTOMER_EMAIL ?? loginEmail;
const customerPhone = process.env.PLAYWRIGHT_STRESS_CUSTOMER_PHONE ?? "+60 17-304 2586";
const customerAddress = process.env.PLAYWRIGHT_STRESS_CUSTOMER_ADDRESS ?? "Suite 8-3, Menara UOA Bangsar, 59000 Kuala Lumpur";
const companyAddress = process.env.PLAYWRIGHT_STRESS_COMPANY_ADDRESS ?? "Level 10, Jalan Sultan Ismail, 50250 Kuala Lumpur";

type AuthPayload = { accessToken: string };
type CompanyLookup = {
  id: string;
  name: string;
  registrationNumber: string;
  email: string;
  phone: string;
  address: string;
  industry?: string | null;
  natureOfBusiness?: string | null;
  isActive: boolean;
};
type Customer = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  externalReference: string;
  billingAddress: string;
};
type Invoice = {
  id: string;
  invoiceNumber: string;
};

test.setTimeout(300_000);

test(`create ${invoiceCount} manual invoices`, async ({ page }) => {
  const runId = Date.now();
  const customerName = `PW Stress Customer ${runId}`;
  const dueDateUtc = toDateInputValue(daysFromNow(14));

  await login(page);
  const auth = await getAuthPayload(page);
  const companies = await getJson<CompanyLookup[]>(page.request, auth, "/companies");
  if (companies.length === 0) {
    throw new Error("No company exists for this account. Create a company first before running the invoice stress script.");
  }

  const primaryCompany = companies[0];
  if (!primaryCompany.address?.trim()) {
    await putJson<CompanyLookup>(page.request, auth, `/companies/${primaryCompany.id}`, {
      name: primaryCompany.name,
      registrationNumber: primaryCompany.registrationNumber,
      email: primaryCompany.email,
      phone: primaryCompany.phone || customerPhone,
      address: companyAddress,
      industry: primaryCompany.industry ?? "",
      natureOfBusiness: primaryCompany.natureOfBusiness ?? "",
      isActive: primaryCompany.isActive,
    });
  }

  const customer = await postJson<Customer>(page.request, auth, "/customers", {
    name: customerName,
    email: customerEmail,
    phoneNumber: customerPhone,
    externalReference: `PW-STRESS-${runId}`,
    billingAddress: customerAddress,
  });

  const createdInvoiceNumbers: string[] = [];
  for (let index = 1; index <= invoiceCount; index += 1) {
    const invoice = await postJson<Invoice>(page.request, auth, "/invoices", {
      customerId: customer.id,
      dueDateUtc,
      lineItems: [
        {
          description: `Playwright stress invoice ${index}`,
          quantity: 1,
          unitAmount: 10 + index,
        },
      ],
    });

    createdInvoiceNumbers.push(invoice.invoiceNumber);
  }

  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: /invoices/i })).toBeVisible();
  await expect(page.locator(".invoice-table tbody tr")).toHaveCount(Math.min(invoiceCount, 20));
  await expect(page.locator(".invoice-table")).toContainText(createdInvoiceNumbers[0]);
  await expect(page.locator(".invoice-table")).toContainText(createdInvoiceNumbers[createdInvoiceNumbers.length - 1]);
});

async function login(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/work email/i).fill(loginEmail);
  await page.getByPlaceholder(/enter your password/i).fill(loginPassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function getAuthPayload(page: Page) {
  const raw = await page.evaluate(() => window.localStorage.getItem("recurvos.auth"));
  if (!raw) {
    throw new Error("Could not find auth payload in local storage after login.");
  }

  try {
    return JSON.parse(raw) as AuthPayload;
  } catch {
    throw new Error("Could not parse auth payload from local storage.");
  }
}

async function getJson<T>(request: APIRequestContext, auth: AuthPayload, path: string) {
  const response = await apiRequest(request, auth, path, "GET");
  return await response.json() as T;
}

async function postJson<T>(request: APIRequestContext, auth: AuthPayload, path: string, body: unknown) {
  const response = await apiRequest(request, auth, path, "POST", body);
  return await response.json() as T;
}

async function putJson<T>(request: APIRequestContext, auth: AuthPayload, path: string, body: unknown) {
  const response = await apiRequest(request, auth, path, "PUT", body);
  return await response.json() as T;
}

async function apiRequest(request: APIRequestContext, auth: AuthPayload, path: string, method: "GET" | "POST" | "PUT", body?: unknown) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await request.fetch(`${apiBaseUrl}${normalizedPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    data: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok()) {
    const raw = await response.text().catch(() => "");
    throw new Error(`${method} ${normalizedPath} failed with ${response.status()}: ${raw || "no response body"}`);
  }

  return response;
}

function daysFromNow(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value;
}

function toDateInputValue(value: Date) {
  return value.toISOString();
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
