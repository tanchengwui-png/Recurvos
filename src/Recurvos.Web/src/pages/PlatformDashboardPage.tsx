import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataCard } from "../components/DataCard";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PlatformDashboardSummary, SubscriberCompany } from "../types";

export function PlatformDashboardPage() {
  const [summary, setSummary] = useState<PlatformDashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  function buildFallbackSummary(subscriberList: SubscriberCompany[]): PlatformDashboardSummary {
    const now = new Date();

    return {
      totalSubscribers: subscriberList.length,
      subscribersPaid: subscriberList.filter((item) => (item.packageStatus ?? "").toLowerCase() === "active").length,
      subscribersPendingPayment: subscriberList.filter((item) => {
        const status = (item.packageStatus ?? "").toLowerCase();
        return status === "pending_payment" || status === "reactivation_pending_payment";
      }).length,
      subscribersInGracePeriod: subscriberList.filter((item) => {
        const status = (item.packageStatus ?? "").toLowerCase();
        return status === "grace_period"
          || (status === "pending_payment" && Boolean(item.packageGracePeriodEndsAtUtc) && new Date(item.packageGracePeriodEndsAtUtc!) >= now);
      }).length,
      subscribersOnTrial: subscriberList.filter((item) => item.trialEndsAtUtc && new Date(item.trialEndsAtUtc) >= now).length,
      billingProfiles: 0,
      products: 0,
      customers: subscriberList.reduce((total, item) => total + item.customerCount, 0),
      subscriptions: subscriberList.reduce((total, item) => total + item.subscriptionCount, 0),
      openInvoices: subscriberList.reduce((total, item) => total + item.openInvoiceCount, 0),
      outstandingAmount: 0,
      whatsAppSentThisMonth: 0,
      companiesUsingWhatsAppThisMonth: 0,
    };
  }

  async function load() {
    setError("");

    const [summaryResult, subscribersResult] = await Promise.allSettled([
      api.get<PlatformDashboardSummary>("/platform/summary"),
      api.get<SubscriberCompany[]>("/platform/subscribers"),
    ]);

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
      return;
    }

    if (subscribersResult.status === "fulfilled") {
      setSummary(buildFallbackSummary(subscribersResult.value));
      setError("Owner metrics are partially loaded. Some advanced counts are temporarily unavailable.");
      return;
    }

    setSummary(null);
    setError("Unable to load the platform dashboard.");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Platform overview</p>
          <h2>Owner dashboard</h2>
          <p className="muted">Track subscriber health, billing exposure, and overall platform usage from one place.</p>
        </div>
        <div className="button-stack">
          <Link to="/platform/documents" className="button button-secondary">Document Preview</Link>
          <Link to="/platform/settings" className="button button-primary">Platform Settings</Link>
        </div>
      </header>

      {error ? <HelperText tone={summary ? undefined : "error"}>{error}</HelperText> : null}

      {summary ? (
        <>
          <section className="card platform-dashboard-hero-card">
            <div className="metrics-grid">
              <DataCard title="Total Subscribers" value={String(summary.totalSubscribers)} />
              <DataCard title="Subscribed and Paid" value={String(summary.subscribersPaid)} />
              <DataCard title="Subscribed Not Paid" value={String(summary.subscribersPendingPayment)} />
              <DataCard title="Outstanding Amount" value={formatCurrency(summary.outstandingAmount, "MYR")} />
            </div>
          </section>

          <div className="grid-two platform-dashboard-grid">
            <section className="card subtle-card platform-dashboard-panel">
              <div className="card-section-header">
                <div>
                  <p className="eyebrow">Subscriber health</p>
                  <h3 className="section-title">Package and payment status</h3>
                </div>
              </div>
              <div className="platform-dashboard-stat-list">
                <div className="platform-dashboard-stat-row">
                  <span>Subscribers in grace period</span>
                  <strong>{summary.subscribersInGracePeriod}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Subscribers on trial</span>
                  <strong>{summary.subscribersOnTrial}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Open invoices across subscribers</span>
                  <strong>{summary.openInvoices}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Average outstanding per subscriber</span>
                  <strong>{summary.totalSubscribers > 0 ? formatCurrency(summary.outstandingAmount / summary.totalSubscribers, "MYR") : formatCurrency(0, "MYR")}</strong>
                </div>
              </div>
            </section>

            <section className="card subtle-card platform-dashboard-panel">
              <div className="card-section-header">
                <div>
                  <p className="eyebrow">Usage footprint</p>
                  <h3 className="section-title">How subscriber accounts are using Recurvo</h3>
                </div>
              </div>
              <div className="platform-dashboard-stat-list">
                <div className="platform-dashboard-stat-row">
                  <span>Billing profiles ready</span>
                  <strong>{summary.billingProfiles}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Products created</span>
                  <strong>{summary.products}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Customers managed</span>
                  <strong>{summary.customers}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Subscriptions running</span>
                  <strong>{summary.subscriptions}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>WhatsApp sent this month</span>
                  <strong>{summary.whatsAppSentThisMonth}</strong>
                </div>
                <div className="platform-dashboard-stat-row">
                  <span>Companies using WhatsApp this month</span>
                  <strong>{summary.companiesUsingWhatsAppThisMonth}</strong>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
