import type { ReactNode } from "react";

export function DataCard({ title, value, children }: { title: string; value?: string; children?: ReactNode }) {
  return (
    <section className="card metric-card">
      <p className="eyebrow">{title}</p>
      {value ? <h3>{value}</h3> : null}
      {children}
    </section>
  );
}
