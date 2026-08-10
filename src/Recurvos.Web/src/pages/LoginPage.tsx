import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { HelperText } from "../components/ui/HelperText";
import { InlineLink } from "../components/ui/InlineLink";
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
  const [showPassword, setShowPassword] = useState(false);
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
        <section className="login-marketing-panel card subtle-card">
          <div className="login-marketing-content">
          <a className="login-marketing-brand" href={buildPublicSiteUrl("/")}>
            <BrandLogo className="login-marketing-logo" />
          </a>

          <h1 className="login-marketing-heading">Automate invoices, subscriptions,<br />and recurring billing for Malaysian<br />businesses.</h1>

          <div className="login-marketing-copy">
            <p className="login-marketing-description">
              Keep customers, subscriptions, invoices, reminders, and payment tracking connected in one focused workspace.
            </p>
            <div className="login-trust-list">
              <span className="login-trust-pill"><span className="login-trust-icon" aria-hidden="true">✓</span><span className="login-trust-text">No contract</span></span>
              <span className="login-trust-pill"><span className="login-trust-icon" aria-hidden="true">✓</span><span className="login-trust-text">Cancel anytime</span></span>
              <span className="login-trust-pill"><span className="login-trust-icon" aria-hidden="true">✓</span><span className="login-trust-text">Your data stays yours</span></span>
            </div>
          </div>

          <div className="login-feature-grid">
            <article className="login-feature-card">
              <div className="login-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19v-1.5A3.5 3.5 0 0 1 7.5 14h3A3.5 3.5 0 0 1 14 17.5V19" /><circle cx="9" cy="8" r="3" /><path d="M15 6h5M17.5 3.5v5" /></svg></div>
              <p className="login-feature-eyebrow">Simple billing</p>
              <h3 className="login-feature-title">One connected workspace</h3>
              <p className="login-feature-description">Manage customers, plans, subscriptions, invoices and payments together.</p>
            </article>
            <article className="login-feature-card">
              <div className="login-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg></div>
              <p className="login-feature-eyebrow">Malaysian ready</p>
              <h3 className="login-feature-title">Issue invoices confidently</h3>
              <p className="login-feature-description">Add issuer details, payment instructions and payment QR information.</p>
            </article>
            <article className="login-feature-card">
              <div className="login-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v11m0 0 4-4m-4 4-4-4" /><path d="M5 14v5h14v-5" /><path d="M7 21h10" /></svg></div>
              <p className="login-feature-eyebrow">Always portable</p>
              <h3 className="login-feature-title">Your data stays yours</h3>
              <p className="login-feature-description">Export invoices, customers and subscriptions whenever you need them.</p>
            </article>
          </div>
          </div>
          <div className="login-marketing-decoration" aria-hidden="true"><div className="login-wave" /></div>
        </section>

        <section className="card auth-card auth-card-surface login-panel">
          <div className="login-panel-content">
            <header className="auth-header login-panel-header">
              <p className="eyebrow">Welcome back</p>
              <h2>Sign In</h2>
              <p className="auth-subtitle">Access your billing workspace and continue where you left off.</p>
            </header>

            <form className="form-stack login-form" onSubmit={onSubmit}>
            {showStagingQuickLogin ? (
              <div className="quick-login-grid">
                <button
                  type="button"
                  className="login-quick-button"
                  disabled={isSubmitting}
                  onClick={() => quickLogin("owner@recurvo.com", "P@ssw0rd!@#$%")}
                >
                  Login as Platform Owner
                </button>
                <button
                  type="button"
                  className="login-quick-button"
                  disabled={isSubmitting}
                  onClick={() => quickLogin("Recurvos-Basic@hotmail.com", "P@ssw0rd!@#$%")}
                >
                  Login as Subscriber
                </button>
              </div>
            ) : null}

            <label className="login-field" htmlFor="email">
              <span>Work email</span>
              <div className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
                <input
                  className="text-input login-text-input"
                id="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </label>

            <label className="login-field login-password-field" htmlFor="password">
              <span>Password</span>
              <div className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                <input
                  className="text-input login-text-input login-password-input"
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                />
                <button type="button" className="login-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                </button>
              </div>
            </label>

            <div className="auth-meta">
              <InlineLink href="/forgot-password">Forgot password?</InlineLink>
            </div>

            {isVerificationError ? <HelperText tone="error">{verificationHelpMessage}</HelperText> : null}
            {error && !isVerificationError ? <HelperText tone="error">{error}</HelperText> : null}
            {verificationResent ? <HelperText>Verification email sent. Please check your inbox.</HelperText> : null}
            <div className="button-stack">
              <button className="login-submit-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
                {!isSubmitting ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg> : null}
              </button>
              {isVerificationError ? (
                <button
                  type="button"
                  className="login-secondary-action"
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
                </button>
              ) : null}
              {isVerificationError ? (
                <button
                  type="button"
                  className="login-secondary-action"
                  disabled={isSubmitting}
                  onClick={() => navigate("/pricing")}
                >
                  Create account with another email
                </button>
              ) : null}
              <button className="login-create-button" type="button" onClick={() => navigate("/pricing")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A3.5 3.5 0 0 1 7 15h4a3.5 3.5 0 0 1 3.5 3.5V20M18 8v6m-3-3h6" /></svg>Create account</button>
            </div>
            </form>
          </div>

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
