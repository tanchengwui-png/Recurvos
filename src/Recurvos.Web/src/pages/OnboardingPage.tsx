import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { InlineLink } from "../components/ui/InlineLink";
import { PasswordInput } from "../components/ui/PasswordInput";
import { TextInput } from "../components/ui/TextInput";
import { api } from "../lib/api";
import { getPackageDisplayName, getPackageMarketingContent } from "../lib/packages";
import type { PlatformPackage, RegisterResult } from "../types";

export function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedCode = searchParams.get("package") ?? "starter";
  const [packages, setPackages] = useState<PlatformPackage[]>([]);
  const selectedPackage = useMemo(
    () => packages.find((item) => item.code === selectedCode) ?? packages[0],
    [packages, selectedCode]);
  const [form, setForm] = useState({
    website: "",
    packageCode: selectedCode,
    companyName: "",
    registrationNumber: "",
    companyEmail: "",
    billingAddress: "",
    fullName: "",
    email: "",
    password: "",
    acceptLegalTerms: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);
  const selectedPackageMarketing = selectedPackage ? getPackageMarketingContent(selectedPackage.code) : null;
  const selectedPackageDisplayName = selectedPackage ? getPackageDisplayName(selectedPackage.code, selectedPackage.name) : "";

  useEffect(() => {
    api.get<PlatformPackage[]>("/public/packages")
      .then((items) => setPackages(items))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load packages."));
  }, []);

  useEffect(() => {
    setForm((current) => ({ ...current, packageCode: selectedPackage?.code ?? selectedCode }));
  }, [selectedCode, selectedPackage?.code]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await api.post<RegisterResult>("/auth/register", form);
      setRegisterResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Recurring billing for Malaysian businesses">
      {registerResult ? (
        <div className="form-stack">
          <div className="selected-package-banner">
            <p className="eyebrow">Check your email</p>
            <strong>{registerResult.email}</strong>
            <p className="muted">{registerResult.message}</p>
            <p className="muted">Open the verification link in your inbox to activate your account and sign in.</p>
          </div>
          <div className="button-stack">
            <Button type="button" onClick={() => navigate("/login")}>
              Go to sign in
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await api.post("/auth/resend-verification", { email: registerResult.email });
                  setError("");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Unable to resend verification email");
                }
              }}
            >
              Resend verification email
            </Button>
          </div>
          {error ? <HelperText tone="error">{error}</HelperText> : null}
        </div>
      ) : (
      <form className="form-stack" onSubmit={submit}>
        {selectedPackage ? (
          <div className="selected-package-banner">
            <p className="eyebrow">Selected package</p>
            <div className="row">
              <div>
                <div className="selected-package-heading">
                  <strong>{selectedPackageDisplayName}</strong>
                  {selectedPackage.code === "growth" ? <span className="pricing-badge">Most popular</span> : null}
                </div>
                <p className="muted">{selectedPackage.priceLabel}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => navigate("/pricing")}>
                Change
              </Button>
            </div>
            <div className="selected-package-story">
              <p className="pricing-fit-line">{selectedPackageMarketing?.fit}</p>
              <p className="selected-package-story-lead">{selectedPackageMarketing?.lead}</p>
              <div className="selected-package-list">
                {selectedPackageMarketing?.highlights.map((highlight) => (
                  <p key={highlight}>{highlight}</p>
                ))}
              </div>
            </div>
            <div className="selected-package-note">
              <p>{selectedPackageMarketing?.note}</p>
            </div>
          </div>
        ) : null}

        <FormLabel htmlFor="companyName">
          Business name
          <TextInput
            id="companyName"
            placeholder="Example Sdn Bhd"
            value={form.companyName}
            onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
          />
        </FormLabel>

        <div style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }} aria-hidden="true">
          <FormLabel htmlFor="website">
            Website
            <TextInput
              id="website"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
            />
          </FormLabel>
        </div>

        <FormLabel htmlFor="registrationNumber">
          Company registration number
          <TextInput
            id="registrationNumber"
            placeholder="202401234567"
            value={form.registrationNumber}
            onChange={(event) => setForm((current) => ({ ...current, registrationNumber: event.target.value }))}
          />
        </FormLabel>

        <FormLabel htmlFor="companyEmail">
          Company billing email
          <>
            <TextInput
              id="companyEmail"
              type="email"
              placeholder="billing@company.com"
              value={form.companyEmail}
              onChange={(event) => setForm((current) => ({ ...current, companyEmail: event.target.value }))}
            />
            <small className="muted">Used on invoices and billing communication for the business.</small>
          </>
        </FormLabel>

        <FormLabel htmlFor="billingAddress">
          Billing address
          <>
            <textarea
              id="billingAddress"
              className="text-input"
              rows={3}
              placeholder="Street, city, postcode, state"
              value={form.billingAddress}
              onChange={(event) => setForm((current) => ({ ...current, billingAddress: event.target.value }))}
            />
            <small className="muted">Shown on invoices and receipts for your subscribers.</small>
          </>
        </FormLabel>

        <FormLabel htmlFor="fullName">
          Your full name
          <TextInput
            id="fullName"
            placeholder="Aisyah Rahman"
            value={form.fullName}
            onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
          />
        </FormLabel>

        <FormLabel htmlFor="email">
          Your login email
          <>
            <TextInput
              id="email"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
            <small className="muted">Used to sign in, verify your account, and reset your password.</small>
          </>
        </FormLabel>

        <FormLabel htmlFor="password">
          Password
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Create a secure password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
        </FormLabel>

        <label className="checkbox-row auth-consent-row">
          <input
            type="checkbox"
            checked={form.acceptLegalTerms}
            onChange={(event) => setForm((current) => ({ ...current, acceptLegalTerms: event.target.checked }))}
          />
          <span>
            I agree to the{" "}
            <Link className="inline-link" to="/terms" state={{ backgroundLocation: location }}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link className="inline-link" to="/privacy" state={{ backgroundLocation: location }}>
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error ? <HelperText tone="error">{error}</HelperText> : <HelperText>Need help? Contact support</HelperText>}

        <div className="button-stack">
          <Button type="submit" disabled={isSubmitting || !selectedPackage || !form.acceptLegalTerms}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate("/login")}>
            Sign in
          </Button>
        </div>

        <p className="auth-meta centered">
          Already have an account? <InlineLink href="/login">Sign in</InlineLink>
        </p>
      </form>
      )}
    </AuthLayout>
  );
}
