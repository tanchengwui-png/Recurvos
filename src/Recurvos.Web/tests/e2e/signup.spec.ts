import { expect, test } from "@playwright/test";

const signupEmail = process.env.PLAYWRIGHT_SIGNUP_EMAIL ?? "tanchengwui@hotmail.com";
const signupPassword = process.env.PLAYWRIGHT_SIGNUP_PASSWORD ?? "P@ssw0rd!123";
const packageCode = process.env.PLAYWRIGHT_SIGNUP_PACKAGE ?? "starter";
const companyNamePrefix = process.env.PLAYWRIGHT_SIGNUP_COMPANY_PREFIX ?? "Playwright Signup";
const companyBillingEmail = process.env.PLAYWRIGHT_SIGNUP_COMPANY_EMAIL ?? signupEmail;

test("signup flow submits successfully", async ({ page }) => {
  const runId = Date.now();
  const companyName = `${companyNamePrefix} ${runId}`;
  const registrationNumber = `PW${runId}`;

  await page.goto(`/onboarding?package=${packageCode}`);

  await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();

  await page.getByLabel(/business name/i).fill(companyName);
  await page.getByLabel(/company registration number/i).fill(registrationNumber);
  await page.getByLabel(/company billing email/i).fill(companyBillingEmail);
  await page.getByLabel(/billing address/i).fill("Level 10, Jalan Sultan Ismail, 50250 Kuala Lumpur");
  await page.getByLabel(/your full name/i).fill("Tan Cheng Wui");
  await page.getByLabel(/your login email/i).fill(signupEmail);
  await page.getByPlaceholder(/create a secure password/i).fill(signupPassword);
  await page.getByRole("checkbox", { name: /i agree to the/i }).check();

  const submitButton = page.getByRole("button", { name: /create account/i });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  const successHeading = page.getByText(/check your email/i);
  const duplicateEmailError = page.getByText(/a user with this email already exists/i);

  const outcome = await Promise.race([
    successHeading.waitFor({ state: "visible", timeout: 15000 }).then(() => "success"),
    duplicateEmailError.waitFor({ state: "visible", timeout: 15000 }).then(() => "duplicate-email"),
  ]).catch(() => "unknown");

  if (outcome === "duplicate-email") {
    throw new Error(
      `Signup failed because ${signupEmail} already exists in this environment. Use PLAYWRIGHT_SIGNUP_EMAIL with a new email, or remove the existing account before rerunning.`,
    );
  }

  if (outcome !== "success") {
    const visibleErrors = await page.locator(".helper-text.error, .helper-text--error, [role='alert']").allInnerTexts().catch(() => []);
    throw new Error(
      `Signup did not reach the success state. Visible errors: ${visibleErrors.join(" | ") || "none captured"}`,
    );
  }

  await expect(successHeading).toBeVisible();
  await expect(page.getByText(signupEmail, { exact: false })).toBeVisible();
  await expect(page.getByText(/verification link/i)).toBeVisible();
});
