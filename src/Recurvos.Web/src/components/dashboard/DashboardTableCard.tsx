import type { ReactNode } from "react";

export function DashboardTableCard({ title, emptyText, children }: { title: string; emptyText?: string; children: ReactNode }) {
  return (
    <section className="card dashboard-panel dashboard-panel-table">
      <div className="row dashboard-widget-header">
        <div>
          <p className="eyebrow">Actionable</p>
          <h3 className="section-title">{title}</h3>
        </div>
      </div>
      {children ?? (emptyText ? <p className="muted">{emptyText}</p> : null)}
    </section>
  );
}
