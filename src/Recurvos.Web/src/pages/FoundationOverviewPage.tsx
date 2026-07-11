import { Link } from "react-router-dom";
import { priorityFoundationModules } from "./foundationModules";

export function FoundationOverviewPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Foundation</h2>
          <p className="page-subtitle">Master modules for accounting, tax, due-date defaults, warehouse control, currencies, and pricing foundations.</p>
        </div>
      </header>
      <section className="card">
        <div className="invoice-detail-list invoice-detail-list-spacious">
          {priorityFoundationModules.map((module) => (
            <div key={module.key} className="invoice-detail-list-row invoice-detail-list-row-top">
              <div>
                <strong>{module.label}</strong>
                <p className="muted">{module.description}</p>
              </div>
              <Link className="button button-secondary button-compact" to={module.path}>Open</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
