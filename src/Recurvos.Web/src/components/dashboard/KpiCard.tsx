export function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <section className="card metric-card dashboard-kpi-card dashboard-kpi-surface">
      <p className="eyebrow">{title}</p>
      <h3>{value}</h3>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </section>
  );
}
