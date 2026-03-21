import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const operationalHighlights = [
  {
    title: "Recurring + one-time",
    text: "Charge monthly plans and one-time fees in the same customer flow.",
  },
  {
    title: "Invoice-ready",
    text: "Send proper invoices with due date, bank info, QR, and numbering.",
  },
  {
    title: "Follow-up built in",
    text: "Track payments, send reminders, and keep status clear.",
  },
];

const productAreas = [
  {
    number: "01",
    title: "Customers and billing records",
    text: "Keep customer details, invoice history, and payment status in one place.",
  },
  {
    number: "02",
    title: "Recurring and one-time charges",
    text: "Use monthly plans and one-time fees together without extra manual work.",
  },
  {
    number: "03",
    title: "Invoices and reminders",
    text: "Generate invoices, track due amounts, and follow up from the same workflow.",
  },
  {
    number: "04",
    title: "Malaysia-ready billing flow",
    text: "Support SST-ready workflow, payment link, QR, and invoice numbering.",
  },
];

export function LandingPage() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 640);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="landing-shell">
      <div className="landing-backdrop" aria-hidden="true">
        <div className="landing-orb landing-orb-left" />
        <div className="landing-orb landing-orb-right" />
        <div className="landing-orb landing-orb-bottom" />
      </div>

      <main id="top" className="landing-main">
        <header className="landing-topbar">
          <Link to="/" className="landing-brand">
            <span className="landing-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>
              <span className="eyebrow">Recurvos Billing</span>
              <strong>Billing software for Malaysian businesses</strong>
            </span>
          </Link>

          <div className="landing-topbar-actions">
            <Link className="button button-secondary" to="/login">Sign in</Link>
            <Link className="button button-primary" to="/pricing">Start free</Link>
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker">Made for Malaysian billing workflows</p>
            <h1>Stop chasing payments.</h1>
            <p className="landing-lead">
              Automate invoices, subscriptions, and recurring billing for Malaysian businesses.
            </p>
            <div className="landing-hero-actions">
              <Link className="button button-primary" to="/pricing">Start free for 7 days</Link>
              <Link className="button button-secondary" to="/login">View workspace</Link>
            </div>
            <div className="landing-trust-row">
              <span>SST-ready workflow</span>
              <span>Payment link and QR</span>
              <span>Auto billing</span>
            </div>
          </div>

          <section id="preview" className="landing-preview-card">
            <div className="landing-preview-header">
              <div>
                <p className="eyebrow">Operator preview</p>
                <h2>Simple billing flow your team can follow</h2>
              </div>
            </div>

            <div className="landing-preview-flow">
              <article className="landing-preview-panel">
                <div className="landing-preview-panel-head">
                  <strong>Subscription</strong>
                  <span>Active</span>
                </div>
                <div className="landing-preview-line">
                  <span>Math Monthly</span>
                  <strong>RM 120</strong>
                </div>
                <div className="landing-preview-line">
                  <span>Registration Fee</span>
                  <strong>RM 50</strong>
                </div>
                <p>First invoice includes both items.</p>
              </article>

              <article className="landing-preview-panel">
                <div className="landing-preview-panel-head">
                  <strong>Next cycle</strong>
                  <span>Auto</span>
                </div>
                <div className="landing-preview-line">
                  <span>Math Monthly</span>
                  <strong>RM 120</strong>
                </div>
                <div className="landing-preview-line landing-preview-line-muted">
                  <span>Registration Fee</span>
                  <strong>Completed</strong>
                </div>
                <p>Later invoice shows recurring item only.</p>
              </article>
            </div>

            <div className="landing-preview-foot">
              <span>Invoices</span>
              <span>Reminders</span>
              <span>Payment records</span>
            </div>

            <article className="landing-story-card landing-story-card-accent landing-example-card">
              <p className="eyebrow">Simple example</p>
              <h3>Registration fee + monthly plan</h3>
              <p>First month: registration fee + monthly fee. Next month: monthly fee only.</p>
            </article>
          </section>
        </section>

        <section className="landing-feature-strip">
          {operationalHighlights.map((item) => (
            <article key={item.title} className="landing-feature-row">
              <span className="landing-feature-index" aria-hidden="true" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section id="features" className="landing-section landing-feature-section">
          <div className="landing-section-heading">
            <p className="eyebrow">Everything you need to start billing</p>
            <h2>A focused billing workspace for recurring revenue.</h2>
            <p>
              Keep customers, subscriptions, invoices, reminders, and payment tracking connected without the weight of a full accounting suite.
            </p>
          </div>

          <div className="landing-grid-cards">
            {productAreas.map((item) => (
              <article key={item.title} className="landing-grid-card">
                <span className="landing-grid-card-index">{item.number}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="operators" className="landing-cta landing-cta-separated">
          <div>
            <p className="eyebrow">Still doing this manually?</p>
            <h2>Still using Excel for invoices?</h2>
            <p>
              Switch to automated billing in minutes and keep invoices, recurring charges, and reminders in one place.
            </p>
          </div>
          <div className="landing-cta-actions">
            <Link className="button button-primary" to="/pricing">Create account</Link>
            <Link className="button button-secondary" to="/login">Sign in</Link>
          </div>
        </section>

        <a
          className={`landing-back-to-top${showBackToTop ? " is-visible" : ""}`}
          href="#top"
          aria-label="Back to top"
        >
          <span aria-hidden="true">↑</span>
        </a>
      </main>
    </div>
  );
}
