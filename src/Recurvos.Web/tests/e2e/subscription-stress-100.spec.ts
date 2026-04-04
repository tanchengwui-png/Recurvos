import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STRESS_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STRESS_PASSWORD ?? "P@ssw0rd!@#$%";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const subscriptionCount = Math.max(1, Number.parseInt(process.env.PLAYWRIGHT_STRESS_SUBSCRIPTION_COUNT ?? "100", 10) || 100);
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
type Product = {
  id: string;
  companyId: string;
  name: string;
  code: string;
};
type Customer = {
  id: string;
  name: string;
  email: string;
};
type ProductPlan = {
  id: string;
  planName: string;
  planCode: string;
};
type Subscription = {
  id: string;
  customerName: string;
};

test.setTimeout(300_000);

test(`create ${subscriptionCount} subscriptions`, async ({ page }) => {
  const runId = Date.now();
  const productName = `PW Stress Subscription Product ${runId}`;
  const planName = `PW Stress Subscription Monthly ${runId}`;
  const startDateUtc = new Date().toISOString();

  await login(page);
  const auth = await getAuthPayload(page);
  const company = await ensurePrimaryCompanyReady(page.request, auth);

  const product = await postJson<Product>(page.request, auth, "/products", {
    companyId: company.id,
    name: productName,
    code: `PW-STRESS-SUB-PRODUCT-${runId}`,
    description: "Playwright subscription stress product",
    category: "Automation",
    productType: "Service",
    isSubscriptionProduct: true,
    isActive: true,
  });

  const recurringPlan = await postJson<ProductPlan>(page.request, auth, `/products/${product.id}/plans`, {
    productId: product.id,
    planName,
    planCode: `PW-STRESS-SUB-PLAN-${runId}`,
    billingType: "Recurring",
    intervalUnit: "Month",
    intervalCount: 1,
    currency: "MYR",
    unitAmount: 29.9,
    taxBehavior: "Unspecified",
    isDefault: true,
    isActive: true,
    sortOrder: 1,
  });

  const createdCustomerNames: string[] = [];
  for (let index = 1; index <= subscriptionCount; index += 1) {
    const customer = await postJson<Customer>(page.request, auth, "/customers", {
      name: `PW Stress Subscription Customer ${runId}-${index}`,
      email: `tanchengwui+pw-sub-${runId}-${index}@hotmail.com`,
      phoneNumber: customerPhone,
      externalReference: `PW-SUB-CUST-${runId}-${index}`,
      billingAddress: customerAddress,
    });

    const subscription = await postJson<Subscription>(page.request, auth, "/subscriptions", {
      customerId: customer.id,
      items: [
        {
          productPlanId: recurringPlan.id,
          quantity: 1,
        },
      ],
      startDateUtc,
      trialDays: 0,
      notes: `Playwright stress subscription ${index}`,
    });

    createdCustomerNames.push(subscription.customerName);
  }

  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: /subscriptions/i })).toBeVisible();
  await expect(page.locator(".subscription-table tbody tr")).toHaveCount(20);
  await expect(page.locator(".subscription-table")).toContainText(createdCustomerNames[0]);
  await expect(page.locator(".subscription-table")).toContainText(createdCustomerNames[createdCustomerNames.length - 1]);
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

async function ensurePrimaryCompanyReady(request: APIRequestContext, auth: AuthPayload) {
  const companies = await getJson<CompanyLookup[]>(request, auth, "/companies");
  if (companies.length === 0) {
    throw new Error("No company exists for this account. Create a company first before running the subscription stress script.");
  }

  const company = companies[0];
  if (company.address?.trim()) {
    return company;
  }

  return await putJson<CompanyLookup>(request, auth, `/companies/${company.id}`, {
    name: company.name,
    registrationNumber: company.registrationNumber,
    email: company.email,
    phone: company.phone || customerPhone,
    address: companyAddress,
    industry: company.industry ?? "",
    natureOfBusiness: company.natureOfBusiness ?? "",
    isActive: company.isActive,
  });
}

async function getJson<T>(request: APIRequestContext, auth: AuthPayload, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await request.fetch(`${apiBaseUrl}${normalizedPath}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
    },
  });

  if (!response.ok()) {
    const raw = await response.text().catch(() => "");
    throw new Error(`GET ${normalizedPath} failed with ${response.status()}: ${raw || "no response body"}`);
  }

  return await response.json() as T;
}

async function postJson<T>(request: APIRequestContext, auth: AuthPayload, path: string, body: unknown) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await request.fetch(`${apiBaseUrl}${normalizedPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    data: JSON.stringify(body),
  });

  if (!response.ok()) {
    const raw = await response.text().catch(() => "");
    throw new Error(`POST ${normalizedPath} failed with ${response.status()}: ${raw || "no response body"}`);
  }

  return await response.json() as T;
}

async function putJson<T>(request: APIRequestContext, auth: AuthPayload, path: string, body: unknown) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await request.fetch(`${apiBaseUrl}${normalizedPath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    data: JSON.stringify(body),
  });

  if (!response.ok()) {
    const raw = await response.text().catch(() => "");
    throw new Error(`PUT ${normalizedPath} failed with ${response.status()}: ${raw || "no response body"}`);
  }

  return await response.json() as T;
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
