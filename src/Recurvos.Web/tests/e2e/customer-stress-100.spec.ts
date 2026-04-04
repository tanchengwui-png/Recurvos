import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STRESS_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STRESS_PASSWORD ?? "P@ssw0rd!@#$%";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const customerCount = Math.max(1, Number.parseInt(process.env.PLAYWRIGHT_STRESS_CUSTOMER_COUNT ?? "100", 10) || 100);
const customerPhone = process.env.PLAYWRIGHT_STRESS_CUSTOMER_PHONE ?? "+60 17-304 2586";
const customerAddress = process.env.PLAYWRIGHT_STRESS_CUSTOMER_ADDRESS ?? "Suite 8-3, Menara UOA Bangsar, 59000 Kuala Lumpur";

type AuthPayload = { accessToken: string };
type Customer = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  externalReference: string;
  billingAddress: string;
};

test.setTimeout(300_000);

test(`create ${customerCount} customers`, async ({ page }) => {
  const runId = Date.now();

  await login(page);
  const auth = await getAuthPayload(page);
  const createdCustomerNames: string[] = [];

  for (let index = 1; index <= customerCount; index += 1) {
    const customerName = `PW Stress Customer ${runId}-${index}`;
    const customerEmail = `tanchengwui+pw-customer-${runId}-${index}@hotmail.com`;

    const customer = await postJson<Customer>(page.request, auth, "/customers", {
      name: customerName,
      email: customerEmail,
      phoneNumber: customerPhone,
      externalReference: `PW-CUST-${runId}-${index}`,
      billingAddress: customerAddress,
    });

    createdCustomerNames.push(customer.name);
  }

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: /customers/i })).toBeVisible();
  await expect(page.locator(".customer-table tbody tr")).toHaveCount(Math.min(customerCount, 20));
  await expect(page.locator(".customer-table")).toContainText(createdCustomerNames[0]);
  await expect(page.locator(".customer-table")).toContainText(createdCustomerNames[createdCustomerNames.length - 1]);
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
