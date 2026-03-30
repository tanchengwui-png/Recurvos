import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STRESS_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STRESS_PASSWORD ?? "P@ssw0rd!@#$%";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const planCount = Math.max(1, Number.parseInt(process.env.PLAYWRIGHT_STRESS_PLAN_COUNT ?? "100", 10) || 100);

type AuthPayload = { accessToken: string };
type Product = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  code: string;
};
type ProductPage = {
  items: Product[];
  totalCount: number;
};
type ProductPlan = {
  id: string;
  productId: string;
  productName: string;
  planName: string;
  planCode: string;
};

test.setTimeout(300_000);

test(`create ${planCount} plans`, async ({ page }) => {
  const runId = Date.now();
  const productName = `PW Stress Product ${runId}`;
  const productCode = `PW-STRESS-PRODUCT-${runId}`;

  await login(page);
  const auth = await getAuthPayload(page);

  const product = await postJson<Product>(page.request, auth, "/products", {
    companyId: await resolvePrimaryCompanyId(page.request, auth),
    name: productName,
    code: productCode,
    description: "Playwright stress plans product",
    category: "Automation",
    productType: "Service",
    isSubscriptionProduct: true,
    isActive: true,
  });

  const createdPlanNames: string[] = [];
  for (let index = 1; index <= planCount; index += 1) {
    const planName = `PW Stress Plan ${runId}-${index}`;
    const plan = await postJson<ProductPlan>(page.request, auth, `/products/${product.id}/plans`, {
      productId: product.id,
      planName,
      planCode: `PW-STRESS-PLAN-${runId}-${index}`,
      billingType: index % 2 === 0 ? "Recurring" : "OneTime",
      intervalUnit: index % 2 === 0 ? "Month" : "None",
      intervalCount: index % 2 === 0 ? 1 : 0,
      currency: "MYR",
      unitAmount: 10 + index,
      taxBehavior: "Unspecified",
      isDefault: index === 1,
      isActive: true,
      sortOrder: index,
    });

    createdPlanNames.push(plan.planName);
  }

  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: /plans/i })).toBeVisible();
  await expect(page.locator(".plans-table tbody tr")).toHaveCount(20);
  await expect(page.locator(".plans-table")).toContainText(createdPlanNames[0]);
  await expect(page.locator(".plans-table")).toContainText(createdPlanNames[createdPlanNames.length - 1]);
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

async function resolvePrimaryCompanyId(request: APIRequestContext, auth: AuthPayload) {
  const productsResponse = await getJson<ProductPage>(request, auth, "/products?page=1&pageSize=1");
  if (productsResponse.items.length > 0) {
    return productsResponse.items[0].companyId;
  }

  const companies = await getJson<Array<{ id: string }>>(request, auth, "/companies");
  if (companies.length === 0) {
    throw new Error("No company exists for this account. Create a company first before running the plan stress script.");
  }

  return companies[0].id;
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
