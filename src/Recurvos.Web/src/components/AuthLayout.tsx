import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { packageTrustSummary } from "../lib/packages";

export function AuthLayout({
  title,
  subtitle,
  wide = false,
  compactTrust = false,
  children,
}: {
  title: string;
  subtitle: string;
  wide?: boolean;
  compactTrust?: boolean;
  children: ReactNode;
}) {
  const location = useLocation();

  return (
    <div className="auth-page">
      <div className={`auth-stack ${wide ? "auth-stack-wide" : ""}`.trim()}>
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="eyebrow">Recurvo Billing</p>
            <h1 className="brand-title">Recurvo</h1>
          </div>
        </div>

        <section className="card auth-card auth-card-surface">
          <header className="auth-header">
            <h2>{title}</h2>
            <p className="auth-subtitle">{subtitle}</p>
          </header>

          {children}

          <div className={`auth-trust ${compactTrust ? "auth-trust-compact" : ""}`.trim()}>
            {compactTrust ? (
              packageTrustSummary.map((point) => (
                <span key={point} className="auth-trust-chip">{point}</span>
              ))
            ) : (
              packageTrustSummary.map((point) => (
                <p key={point}>{point}</p>
              ))
            )}
          </div>
        </section>

        <footer className="auth-footer">
          <Link className="inline-link" to="/privacy" state={{ backgroundLocation: location }}>Privacy Policy</Link>
          <Link className="inline-link" to="/terms" state={{ backgroundLocation: location }}>Terms</Link>
          <Link className="inline-link" to="/support" state={{ backgroundLocation: location }}>Support</Link>
        </footer>
      </div>
    </div>
  );
}
