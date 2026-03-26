import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { InlineLink } from "../components/ui/InlineLink";
import { PasswordInput } from "../components/ui/PasswordInput";
import { TextInput } from "../components/ui/TextInput";
import { api } from "../lib/api";
import { setAuth } from "../lib/auth";
import { buildPublicSiteUrl } from "../lib/siteUrls";
import type { AuthResponse, PlatformRuntimeProfile } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showStagingQuickLogin, setShowStagingQuickLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);
  const isVerificationError = error.toLowerCase().includes("verify your email");
  const verificationHelpMessage = isVerificationError
    ? "Your account already exists, but the email address is not verified yet. Resend the verification email below to continue."
    : "";

  useEffect(() => {
    let cancelled = false;

    api.get<PlatformRuntimeProfile>("/public/app/runtime-profile")
      .then((result) => {
        if (cancelled) return;
        const isStaging = result.activeEnvironment === "staging";
        setShowStagingQuickLogin(isStaging);
        if (isStaging) {
          setEmail((current) => current || "Recurvos-Basic@hotmail.com");
          setPassword((current) => current || "P@ssw0rd!@#$%");
        }
      })
      .catch(() => {
        if (cancelled) return;
        const allowDevQuickLogin = import.meta.env.DEV;
        setShowStagingQuickLogin(allowDevQuickLogin);
        if (allowDevQuickLogin) {
          setEmail((current) => current || "Recurvos-Basic@hotmail.com");
          setPassword((current) => current || "P@ssw0rd!@#$%");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function loginWithCredentials(nextEmail: string, nextPassword: string) {
    setIsSubmitting(true);
    setError("");
    setVerificationResent(false);

    try {
      const response = await api.post<AuthResponse>("/auth/login", { email: nextEmail, password: nextPassword });
      setAuth(response);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to login");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await loginWithCredentials(email, password);
  }

  async function quickLogin(nextEmail: string, nextPassword: string) {
    setEmail(nextEmail);
    setPassword(nextPassword);
    await loginWithCredentials(nextEmail, nextPassword);
  }

  return (
    <div className="auth-page login-page-shell">
      <div className="login-layout">
        <section className="login-showcase card subtle-card">
          <a className="login-showcase-brand" href={buildPublicSiteUrl("/")}>
            <div className="brand-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <p className="eyebrow">Recurvo Billing</p>
              <h1 className="brand-title">Automate invoices, subscriptions, and recurring billing for Malaysian businesses.</h1>
            </div>
          </a>

          <div className="login-showcase-copy">
            <p className="login-lead">
              Keep customers, subscriptions, invoices, reminders, and payment tracking connected in one focused workspace.
            </p>
            <div className="login-pill-row">
              <span className="login-pill">No contract</span>
              <span className="login-pill">Cancel anytime</span>
              <span className="login-pill">Your data stays yours</span>
            </div>
          </div>

          <div className="login-highlight-grid">
            <article className="login-highlight-card">
              <p className="eyebrow">Simple billing flow</p>
              <h3>One connected workspace</h3>
              <p className="muted">Customers, plans, subscriptions, invoices, and payments stay connected.</p>
            </article>
            <article className="login-highlight-card">
              <p className="eyebrow">Made for Malaysian billing workflows</p>
              <h3>Ready to issue invoices</h3>
              <p className="muted">Issuer details, branded invoices, bank transfer instructions, and payment QR support.</p>
            </article>
            <article className="login-highlight-card">
              <p className="eyebrow">Always portable</p>
              <h3>Export anytime</h3>
              <p className="muted">Take your invoices, customers, and subscriptions with you whenever needed.</p>
            </article>
          </div>
        </section>

        <section className="card auth-card auth-card-surface login-panel">
          <header className="auth-header login-panel-header">
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in</h2>
            <p className="auth-subtitle">Access your billing workspace and continue where you left off.</p>
          </header>

          <form className="form-stack" onSubmit={onSubmit}>
            {showStagingQuickLogin ? (
              <div className="quick-login-grid">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => quickLogin("owner@recurvo.com", "P@ssw0rd!@#$%")}
                >
                  Login as Platform Owner
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => quickLogin("Recurvos-Basic@hotmail.com", "P@ssw0rd!@#$%")}
                >
                  Login as Subscriber
                </Button>
              </div>
            ) : null}

            <FormLabel htmlFor="email">
              Work email
              <TextInput
                id="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormLabel>

            <FormLabel htmlFor="password">
              Password
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormLabel>

            <div className="auth-meta">
              <InlineLink href="/forgot-password">Forgot password?</InlineLink>
            </div>

            {isVerificationError ? <HelperText tone="error">{verificationHelpMessage}</HelperText> : null}
            {error && !isVerificationError ? <HelperText tone="error">{error}</HelperText> : null}
            {verificationResent ? <HelperText>Verification email sent. Please check your inbox.</HelperText> : null}
            <div className="button-stack">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
              {isVerificationError ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting || !email}
                  onClick={async () => {
                    try {
                      await api.post("/auth/resend-verification", { email });
                      setVerificationResent(true);
                      setError("");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Unable to resend verification email");
                    }
                  }}
                >
                  Resend verification email
                </Button>
              ) : null}
              {isVerificationError ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => navigate("/pricing")}
                >
                  Create account with another email
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => navigate("/pricing")}>
                Create account
              </Button>
            </div>
          </form>

          <div className="login-panel-footer">
            <div className="login-panel-trust">
              <span>No contract</span>
              <span>Cancel anytime</span>
              <span>Export anytime</span>
            </div>
            <div className="auth-footer login-footer-links">
              <Link className="inline-link" to="/privacy" state={{ backgroundLocation: location }}>Privacy Policy</Link>
              <Link className="inline-link" to="/terms" state={{ backgroundLocation: location }}>Terms</Link>
              <Link className="inline-link" to="/support" state={{ backgroundLocation: location }}>Support</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
