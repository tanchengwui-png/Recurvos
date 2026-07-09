import { useEffect, useMemo, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { EmailDispatchLog } from "../types";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-MY");
}

export function PlatformEmailLogsPage() {
  const [items, setItems] = useState<EmailDispatchLog[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");

    try {
      setItems(await api.get<EmailDispatchLog[]>("/platform/email-logs"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load email logs.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(
    () => items.filter((item) => {
      if (statusFilter === "success" && !item.succeeded) {
        return false;
      }

      if (statusFilter === "failed" && item.succeeded) {
        return false;
      }

      if (modeFilter !== "all" && item.deliveryMode !== modeFilter) {
        return false;
      }

      return true;
    }),
    [items, modeFilter, statusFilter],
  );

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <h2>Email Logs</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <div className="page-meta-row" aria-label="Email log summary">
        <div className="page-meta-chips">
          <span className="page-meta-chip">
            <span className="page-meta-chip-label">Total</span>
            <strong className="page-meta-chip-value">{items.length}</strong>
          </span>
          <span className="page-meta-chip">
            <span className="page-meta-chip-label">Succeeded</span>
            <strong className="page-meta-chip-value">{items.filter((item) => item.succeeded).length}</strong>
          </span>
          <span className="page-meta-chip">
            <span className="page-meta-chip-label">Failed</span>
            <strong className="page-meta-chip-value">{items.filter((item) => !item.succeeded).length}</strong>
          </span>
          <span className="page-meta-chip">
            <span className="page-meta-chip-label">Redirected</span>
            <strong className="page-meta-chip-value">{items.filter((item) => item.wasRedirected).length}</strong>
          </span>
        </div>
      </div>

      <section className="card feedback-owner-filters">
        <div className="feedback-owner-filter-bar">
          <label className="form-label">
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="success">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="form-label">
            Delivery mode
            <select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="Smtp">SMTP</option>
              <option value="LocalFolder">Local folder</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        {loading ? (
          <HelperText>Loading email logs...</HelperText>
        ) : filteredItems.length === 0 ? (
          <HelperText>No email logs match the current filters.</HelperText>
        ) : (
          <div className="stack dashboard-list email-log-list">
            {filteredItems.map((item) => (
              <article key={item.id} className="dashboard-list-item email-log-item">
                <div>
                  <div className="feedback-owner-queue-topline">
                    <strong>{item.subject}</strong>
                    <span className={`status-pill ${item.succeeded ? "status-pill-active" : "status-pill-inactive"}`}>
                      {item.succeeded ? "Succeeded" : "Failed"}
                    </span>
                  </div>
                  <p className="muted">
                    {item.deliveryMode === "LocalFolder" ? "Local folder" : "SMTP"} | {formatDateTime(item.createdAtUtc)}
                  </p>
                  <p>To: {item.originalRecipient}</p>
                  {item.wasRedirected || item.originalRecipient !== item.effectiveRecipient ? (
                    <p className="muted">
                      Delivered to: {item.effectiveRecipient}
                      {item.redirectReason ? ` | ${item.redirectReason}` : ""}
                    </p>
                  ) : null}
                  {item.errorMessage ? <HelperText tone="error">{item.errorMessage}</HelperText> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
