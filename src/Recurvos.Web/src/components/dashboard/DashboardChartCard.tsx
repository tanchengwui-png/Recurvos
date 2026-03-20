import type { ReactNode } from "react";

export function DashboardChartCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card dashboard-panel dashboard-panel-chart">
      <div className="row dashboard-widget-header">
        <div>
          <p className="eyebrow">Insights</p>
          <h3 className="section-title">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
