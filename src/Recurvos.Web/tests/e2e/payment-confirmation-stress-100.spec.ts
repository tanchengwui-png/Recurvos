import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const loginEmail = process.env.PLAYWRIGHT_STRESS_EMAIL ?? "tanchengwui@hotmail.com";
const loginPassword = process.env.PLAYWRIGHT_STRESS_PASSWORD ?? "P@ssw0rd!@#$%";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? deriveApiBaseUrl(configuredBaseUrl);
const confirmationCount = Math.max(1, Number.parseInt(process.env.PLAYWRIGHT_STRESS_PAYMENT_CONFIRMATION_COUNT ?? "100", 10) || 100);

type AuthPayload = { accessToken: string };
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  statusLabel: string;
  balanceAmount: number;
};
type PaymentConfirmationLink = {
  invoiceId: string;
  invoiceNumber: string;
  url: string;
};
type PendingPaymentConfirmation = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
};

test.setTimeout(600_000);

test(`submit ${confirmationCount} payment confirmations`, async ({ page }) => {
  await login(page);
  const auth = await getAuthPayload(page);
  const pendingBefore = await getJson<PendingPaymentConfirmation[]>(page.request, auth, "/payment-confirmations");
  const pendingInvoiceIds = new Set(
    pendingBefore
      .filter((item) => item.status.toLowerCase() === "pending")
      .map((item) => item.invoiceId),
  );
  const invoices = await getJson<Invoice[]>(page.request, auth, "/invoices");
  const candidateInvoices = invoices
    .filter((item) => item.balanceAmount > 0 && item.status !== "Voided" && !pendingInvoiceIds.has(item.id))
    .slice(0, confirmationCount);

  if (candidateInvoices.length === 0) {
    throw new Error("No existing open invoices are available for payment confirmation. Make sure there are unpaid invoices without a pending confirmation.");
  }

  if (candidateInvoices.length < confirmationCount) {
    throw new Error(`Only ${candidateInvoices.length} existing invoice(s) are available for confirmation, but ${confirmationCount} were requested.`);
  }

  const targetInvoices: Array<{ invoiceId: string; invoiceNumber: string; confirmationUrl: string }> = [];
  for (const invoice of candidateInvoices) {
    const link = await postJson<PaymentConfirmationLink>(page.request, auth, `/payment-confirmations/invoices/${invoice.id}/link`, {});
    targetInvoices.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, confirmationUrl: link.url });
  }

  for (let index = 0; index < targetInvoices.length; index += 1) {
    const item = targetInvoices[index];
    await submitPaymentConfirmation(page, item.confirmationUrl, index + 1);
  }

  const pending = await getJson<PendingPaymentConfirmation[]>(page.request, auth, "/payment-confirmations");
  const pendingInvoiceNumbers = new Set(
    pending
      .filter((item) => item.status.toLowerCase() === "pending")
      .map((item) => item.invoiceNumber),
  );

  expect(pendingInvoiceNumbers.has(targetInvoices[0].invoiceNumber)).toBeTruthy();
  expect(pendingInvoiceNumbers.has(targetInvoices[targetInvoices.length - 1].invoiceNumber)).toBeTruthy();

  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: /payments/i })).toBeVisible();
  await expect(page.locator(".payments-review-list, .payment-review-list, .stack")).toContainText(targetInvoices[0].invoiceNumber);
  await expect(page.locator(".payments-review-list, .payment-review-list, .stack")).toContainText(targetInvoices[targetInvoices.length - 1].invoiceNumber);
});

async function submitPaymentConfirmation(page: Page, confirmationUrl: string, sequence: number) {
  await page.goto(confirmationUrl);
  await expect(page.getByRole("heading", { name: /confirm your payment/i })).toBeVisible();
  await page.getByLabel(/your name/i).fill(`Playwright Payer ${sequence}`);
  await page.getByLabel(/paid date/i).fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel(/transaction reference/i).fill(`PW-CONFIRM-${Date.now()}-${sequence}`);
  await page.getByLabel(/notes/i).fill(`Stress confirmation ${sequence}`);
  await page.getByRole("button", { name: /submit payment confirmation/i }).click();
  await expect(page.getByText(/your payment confirmation has been submitted/i)).toBeVisible({ timeout: 30000 });
}

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

async function apiRequest(request: APIRequestContext, auth: AuthPayload, path: string, method: "GET" | "POST", body?: unknown) {
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
