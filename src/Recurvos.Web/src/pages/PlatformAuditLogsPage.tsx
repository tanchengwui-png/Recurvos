import { useMemo, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import type { AuditLogEntry } from "../types";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-MY");
}

function formatActionLabel(value: string) {
  return value
    .split(".")
    .map((part) => part.replace(/[-_]+/g, " "))
    .map((part) => part.replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" / ");
}

function buildModuleLabel(action: string) {
  const [module] = action.split(".");
  return module
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PlatformAuditLogsPage() {
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [take, setTake] = useState("100");
  const [selectedItem, setSelectedItem] = useState<AuditLogEntry | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    try {
      setItems(await api.get<AuditLogEntry[]>(`/platform/audit-logs?take=${encodeURIComponent(take)}`));
      setHasLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load audit logs.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const companyOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.companyName))).sort((left, right) => left.localeCompare(right)),
    [items],
  );

  const moduleOptions = useMemo(
    () => Array.from(new Set(items.map((item) => buildModuleLabel(item.action)))).sort((left, right) => left.localeCompare(right)),
    [items],
  );

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      if (companyFilter !== "all" && item.companyName !== companyFilter) {
        return false;
      }

      if (moduleFilter !== "all" && buildModuleLabel(item.action) !== moduleFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.companyName,
        item.userEmail ?? "",
        item.action,
        item.entityName,
        item.entityId,
        item.metadata ?? "",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [companyFilter, items, moduleFilter, search]);

  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([
    hasLoaded,
    items.length,
    filteredItems.length,
    companyFilter,
    moduleFilter,
    search,
  ]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Platform</p>
          <h2>Audit logs</h2>
          <p className="muted">Review what changed, who triggered it, and which subscriber company was affected before investigating a reported bug.</p>
        </div>
        <div className="inline-actions">
          <label className="form-label">
            Load
            <select value={take} onChange={(event) => setTake(event.target.value)}>
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
              <option value="250">250 rows</option>
              <option value="500">500 rows</option>
            </select>
          </label>
          <button type="button" className="button button-secondary" onClick={() => void load()}>
            {hasLoaded ? "Refresh" : "Load audit logs"}
          </button>
        </div>
      </header>

      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card feedback-owner-summary">
        <div className="management-summary-grid">
          <div className="management-summary-card">
            <p className="eyebrow">Total</p>
            <h3>{items.length}</h3>
            <p className="muted">{hasLoaded ? "Loaded audit entries" : "Not loaded yet"}</p>
          </div>
          <div className="management-summary-card">
            <p className="eyebrow">Companies</p>
            <h3>{companyOptions.length}</h3>
            <p className="muted">Companies in current result</p>
          </div>
          <div className="management-summary-card">
            <p className="eyebrow">Modules</p>
            <h3>{moduleOptions.length}</h3>
            <p className="muted">Modules in current result</p>
          </div>
        </div>
      </section>

      <section className="card feedback-owner-filters">
        <div className="feedback-owner-filter-bar">
          <label className="form-label">
            Search
            <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, user, action, entity, or metadata" />
          </label>
          <label className="form-label">
            Company
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">All companies</option>
              {companyOptions.map((companyName) => (
                <option key={companyName} value={companyName}>{companyName}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Module
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {moduleOptions.map((moduleName) => (
                <option key={moduleName} value={moduleName}>{moduleName}</option>
              ))}
            </select>
          </label>
        </div>
        <HelperText>
          {hasLoaded
            ? `${filteredItems.length} audit ${filteredItems.length === 1 ? "entry" : "entries"} match the current filters.`
            : "Audit logs are not loaded automatically. Choose how many rows you want, then click Load audit logs."}
        </HelperText>
      </section>

      <section className="audit-log-layout">
        <div className="card audit-log-main-card">
          {loading ? (
            <HelperText>Loading audit logs...</HelperText>
          ) : !hasLoaded ? (
            <HelperText>Load audit logs when you need them. This keeps the page lighter when there is a lot of history.</HelperText>
          ) : filteredItems.length === 0 ? (
            <HelperText>No audit logs match the current filters.</HelperText>
          ) : (
            <>
              <div ref={topScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
                <div ref={topInnerRef} />
              </div>
              <div
                ref={(node) => {
                  tableScrollRef.current = node;
                  contentScrollRef.current = node;
                }}
                className="table-scroll table-scroll-bounded table-scroll-draggable"
              >
                <table className="catalog-table audit-log-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Company</th>
                      <th>User</th>
                      <th>Module</th>
                      <th>Action</th>
                      <th>Record</th>
                      <th>Summary</th>
                      <th className="audit-log-sticky-action-cell">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id} className={selectedItem?.id === item.id ? "audit-log-row-active" : ""}>
                        <td>{formatDateTime(item.createdAtUtc)}</td>
                        <td>{item.companyName}</td>
                        <td>{item.userEmail ?? "System"}</td>
                        <td>{buildModuleLabel(item.action)}</td>
                        <td>{formatActionLabel(item.action)}</td>
                        <td>{`${item.entityName} ${item.entityId}`}</td>
                        <td className="audit-log-summary-cell">{item.metadata ?? "-"}</td>
                        <td className="actions-cell audit-log-sticky-action-cell">
                          <button type="button" className="button button-secondary" onClick={() => setSelectedItem(item)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
                <div ref={bottomInnerRef} />
              </div>
            </>
          )}
        </div>

        <aside className="card audit-log-detail-card">
          {!selectedItem ? (
            <HelperText>Select an audit entry to inspect the full details without leaving the table.</HelperText>
          ) : (
            <div className="audit-log-detail">
              <div className="feedback-owner-detail-header">
                <div>
                  <p className="eyebrow">Audit details</p>
                  <h3 className="section-title">{formatActionLabel(selectedItem.action)}</h3>
                  <div className="table-meta">
                    <span className="table-meta-item">{selectedItem.companyName}</span>
                    <span className="table-meta-item">{selectedItem.userEmail ?? "System"}</span>
                    <span className="table-meta-item">{buildModuleLabel(selectedItem.action)}</span>
                  </div>
                </div>
                <button type="button" className="button button-secondary button-compact" onClick={() => setSelectedItem(null)}>
                  Clear
                </button>
              </div>

              <div className="feedback-detail-grid">
                <div className="feedback-detail-item">
                  <p className="eyebrow">When</p>
                  <p>{formatDateTime(selectedItem.createdAtUtc)}</p>
                </div>
                <div className="feedback-detail-item">
                  <p className="eyebrow">Record</p>
                  <p>{selectedItem.entityName} {selectedItem.entityId}</p>
                </div>
              </div>

              <div className="feedback-owner-summary-card">
                <p>{selectedItem.metadata ?? "No additional metadata was recorded for this audit entry."}</p>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
