import type { SubscriptionStatusSummary } from "../../types";

const statusItems: { key: keyof SubscriptionStatusSummary; label: string; tone: string }[] = [
  { key: "active", label: "Active", tone: "status-pill-active" },
  { key: "trialing", label: "Trialing", tone: "" },
  { key: "paused", label: "Paused", tone: "status-pill-inactive" },
  { key: "cancelingAtPeriodEnd", label: "Canceling", tone: "" },
  { key: "canceledOrEnded", label: "Canceled / Ended", tone: "status-pill-inactive" },
];

export function StatusSummaryCard({ summary }: { summary: SubscriptionStatusSummary }) {
  return (
    <section className="card dashboard-panel dashboard-status-card">
      <div className="row dashboard-widget-header">
        <div>
          <p className="eyebrow">Status</p>
          <h3 className="section-title">Subscription status summary</h3>
        </div>
      </div>
      <div className="dashboard-status-grid">
        {statusItems.map((item) => (
          <div key={item.key} className="dashboard-status-item">
            <span className={`status-pill ${item.tone}`.trim()}>{item.label}</span>
            <strong>{summary[item.key]}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
