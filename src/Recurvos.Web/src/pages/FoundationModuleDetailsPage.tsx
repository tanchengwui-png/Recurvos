import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { foundationModules, renderFoundationDate, renderFoundationValue, type FoundationModuleConfig, type FoundationRecord } from "./foundationModules";

export function FoundationModuleDetailsPage({ moduleKey }: { moduleKey: string }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const module = useMemo(() => foundationModules.find((item) => item.key === moduleKey) as FoundationModuleConfig | undefined, [moduleKey]);
  const [item, setItem] = useState<FoundationRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!module || !id) {
      return;
    }

    const moduleConfig = module;

    async function load() {
      try {
        setError("");
        const result = await api.get<FoundationRecord>(`${moduleConfig.apiPath}/${id}`);
        setItem(result);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : `Unable to load ${moduleConfig.singularLabel}.`);
      }
    }

    void load();
  }, [id, module]);

  if (!module) {
    return <div className="page"><section className="card"><p className="muted">Foundation module not found.</p></section></div>;
  }

  const moduleConfig = module;

  if (!item) {
    return (
      <div className="page">
        {error ? <HelperText tone="error">{error}</HelperText> : null}
        <section className="card"><p className="muted">Loading {moduleConfig.singularLabel}...</p></section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{moduleConfig.label}</h2>
          <p className="muted">{item.code}</p>
        </div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate(moduleConfig.path)}>Back</button>
          <button type="button" className="button button-primary" onClick={() => navigate(`${moduleConfig.path}/${item.id}/edit`)}>Edit</button>
        </div>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{item.name}</h3>
            <p className="muted">{moduleConfig.singularLabel}</p>
          </div>
          <div className="invoice-detail-summary">
            <div className="invoice-detail-stat"><p>Code</p><strong>{item.code}</strong></div>
            <div className="invoice-detail-stat"><p>Created</p><strong>{renderFoundationDate(item.createdAtUtc)}</strong></div>
            <div className="invoice-detail-stat"><p>Updated</p><strong>{renderFoundationDate(item.updatedAtUtc)}</strong></div>
          </div>
        </div>
        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            {moduleConfig.detailSections.map((section) => (
              <div key={section.title} className="invoice-detail-block">
                <div className="invoice-detail-block-header"><h3>{section.title}</h3></div>
                <div className="invoice-detail-list">
                  {section.fields.map((field) => (
                    <div key={field.key} className="invoice-detail-list-row invoice-detail-list-row-top">
                      <span>{field.label}</span>
                      <strong className="invoice-detail-align-right">{field.render ? field.render(item[field.key], item) : renderFoundationValue(item[field.key])}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <aside className="invoice-detail-aside">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Audit</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Created</span><strong>{renderFoundationDate(item.createdAtUtc)}</strong></div>
                <div className="invoice-detail-list-row"><span>Updated</span><strong>{renderFoundationDate(item.updatedAtUtc)}</strong></div>
                <div className="invoice-detail-list-row"><span>Status</span><strong>{item.isActive ? "Active" : "Inactive"}</strong></div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
