import { useEffect, useMemo, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { FeedbackItem } from "../types";

const statusOptions = ["New", "InReview", "Planned", "Resolved", "Closed"] as const;

function formatFeedbackLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFeedbackMessage(message: string) {
  const [summaryPart, detailPart] = message.split("\n\n[Bug details]\n");
  const detailLines = (detailPart ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const detailMap = Object.fromEntries(
    detailLines.map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        return [line, ""];
      }

      return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
    }),
  );

  return {
    summary: summaryPart.trim(),
    details: [
      ["Steps to reproduce", detailMap["Steps to reproduce"]],
      ["Expected result", detailMap["Expected result"]],
      ["Actual result", detailMap["Actual result"]],
      ["Page", detailMap.Page],
      ["Browser", detailMap.Browser],
      ["Reported at", detailMap["Reported at"]],
    ].filter(([, value]) => Boolean(value)),
  };
}

function formatFeedbackDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function buildPreview(message: string) {
  const preview = parseFeedbackMessage(message).summary;
  return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
}

export function PlatformFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { status: string; adminNote: string }>>({});
  const [statusFilter, setStatusFilter] = useState("open");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const feedbackItems = await api.get<FeedbackItem[]>("/feedback/platform");
      setItems(feedbackItems);
      setDrafts(Object.fromEntries(feedbackItems.map((item) => [item.id, { status: item.status, adminNote: item.adminNote ?? "" }])));
      setActiveId((current) => current && feedbackItems.some((item) => item.id === current)
        ? current
        : feedbackItems.find((item) => item.status === "New" || item.status === "InReview")?.id ?? feedbackItems[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load subscriber feedback.");
      setItems([]);
      setDrafts({});
      setActiveId(null);
    } finally {
      setLoading(false);
    }
  }

  async function save(itemId: string) {
    const draft = drafts[itemId];
    if (!draft) {
      return;
    }

    setSavingId(itemId);
    setError("");

    try {
      const updated = await api.put<FeedbackItem>(`/feedback/platform/${itemId}`, draft);
      setItems((current) => current.map((item) => item.id === itemId ? updated : item));
      setDrafts((current) => ({ ...current, [itemId]: { status: updated.status, adminNote: updated.adminNote ?? "" } }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update feedback.");
    } finally {
      setSavingId(null);
    }
  }

  const companyOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.companyName))).sort((left, right) => left.localeCompare(right)),
    [items],
  );

  const filteredItems = useMemo(() => {
    const activeStatuses = new Set(["New", "InReview", "Planned"]);

    return items.filter((item) => {
      if (companyFilter !== "all" && item.companyName !== companyFilter) {
        return false;
      }

      if (statusFilter === "open") {
        return activeStatuses.has(item.status);
      }

      if (statusFilter === "resolved") {
        return item.status === "Resolved" || item.status === "Closed";
      }

      if (statusFilter === "all") {
        return true;
      }

      return item.status === statusFilter;
    });
  }, [companyFilter, items, statusFilter]);

  const activeQueue = useMemo(
    () => filteredItems.filter((item) => item.status !== "Resolved" && item.status !== "Closed"),
    [filteredItems],
  );
  const resolvedQueue = useMemo(
    () => filteredItems.filter((item) => item.status === "Resolved" || item.status === "Closed"),
    [filteredItems],
  );
  const activeItem = useMemo(
    () => filteredItems.find((item) => item.id === activeId) ?? activeQueue[0] ?? resolvedQueue[0] ?? null,
    [activeId, activeQueue, filteredItems, resolvedQueue],
  );
  const activeDraft = activeItem ? drafts[activeItem.id] ?? { status: activeItem.status, adminNote: activeItem.adminNote ?? "" } : null;
  const activeDirty = activeItem && activeDraft
    ? activeDraft.status !== activeItem.status || activeDraft.adminNote !== (activeItem.adminNote ?? "")
    : false;
  const parsedActive = activeItem ? parseFeedbackMessage(activeItem.message) : null;

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Platform</p>
          <h2>Subscriber feedback</h2>
          <p className="muted">Review incoming issues and requests as a queue, then open one item at a time for a cleaner update workflow.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card feedback-owner-summary">
        <div className="management-summary-grid">
          <div className="management-summary-card">
            <p className="eyebrow">Needs attention</p>
            <h3>{items.filter((item) => item.status === "New" || item.status === "InReview").length}</h3>
            <p className="muted">New and in review</p>
          </div>
          <div className="management-summary-card">
            <p className="eyebrow">Planned or waiting</p>
            <h3>{items.filter((item) => item.status === "Planned").length}</h3>
            <p className="muted">Work acknowledged</p>
          </div>
          <div className="management-summary-card">
            <p className="eyebrow">Resolved</p>
            <h3>{items.filter((item) => item.status === "Resolved" || item.status === "Closed").length}</h3>
            <p className="muted">Past feedback history</p>
          </div>
        </div>
      </section>

      <section className="card feedback-owner-filters">
        <div className="feedback-owner-filter-bar">
          <label className="form-label">
            View
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="open">Open queue</option>
              <option value="resolved">Resolved only</option>
              <option value="all">All feedback</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{formatFeedbackLabel(status)}</option>
              ))}
            </select>
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
        </div>
      </section>

      <section className="feedback-owner-layout">
        <aside className="card feedback-owner-queue-card">
          <div className="feedback-owner-queue-header">
            <div>
              <p className="eyebrow">Queue</p>
              <h3 className="section-title">Active feedback</h3>
            </div>
            <strong>{activeQueue.length}</strong>
          </div>

          {loading ? (
            <HelperText>Loading subscriber feedback...</HelperText>
          ) : activeQueue.length === 0 ? (
            <HelperText>No active feedback found for this filter.</HelperText>
          ) : (
            <div className="feedback-owner-queue-list">
              {activeQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`feedback-owner-queue-item ${activeItem?.id === item.id ? "active" : ""}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div className="feedback-owner-queue-topline">
                    <strong>{item.subject}</strong>
                    <span className={`status-pill ${item.status === "New" ? "status-pill-inactive" : "status-pill-active"}`}>
                      {formatFeedbackLabel(item.status)}
                    </span>
                  </div>
                  <p className="muted">{item.companyName} | {formatFeedbackLabel(item.category)} | {item.priority}</p>
                  <p>{buildPreview(item.message)}</p>
                  <span className="feedback-owner-queue-date">{formatFeedbackDate(item.createdAtUtc)}</span>
                </button>
              ))}
            </div>
          )}

          {resolvedQueue.length > 0 ? (
            <div className="feedback-owner-history">
              <button type="button" className="button button-secondary" onClick={() => setShowResolved((current) => !current)}>
                {showResolved ? "Hide past feedback" : `View past feedback (${resolvedQueue.length})`}
              </button>
              {showResolved ? (
                <div className="feedback-owner-queue-list">
                  {resolvedQueue.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`feedback-owner-queue-item feedback-owner-queue-item-past ${activeItem?.id === item.id ? "active" : ""}`}
                      onClick={() => setActiveId(item.id)}
                    >
                      <div className="feedback-owner-queue-topline">
                        <strong>{item.subject}</strong>
                        <span className="status-pill status-pill-active">{formatFeedbackLabel(item.status)}</span>
                      </div>
                      <p className="muted">{item.companyName} | {formatFeedbackLabel(item.category)}</p>
                      <p>{buildPreview(item.message)}</p>
                      <span className="feedback-owner-queue-date">{formatFeedbackDate(item.reviewedAtUtc ?? item.createdAtUtc)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section className="card feedback-owner-detail-card">
          {!activeItem || !activeDraft || !parsedActive ? (
            <HelperText>Select a feedback item to review and reply.</HelperText>
          ) : (
            <div className="feedback-owner-detail">
              <div className="feedback-owner-detail-header">
                <div>
                  <p className="eyebrow">Feedback details</p>
                  <h3 className="section-title">{activeItem.subject}</h3>
                  <div className="table-meta">
                    <span className="table-meta-item">{activeItem.companyName}</span>
                    <span className="table-meta-item">{activeItem.submittedByName}</span>
                    <span className="table-meta-item">{formatFeedbackLabel(activeItem.category)}</span>
                    <span className="table-meta-item">{activeItem.priority}</span>
                  </div>
                </div>
                <span className={`status-pill ${activeItem.status === "Resolved" || activeItem.status === "Closed" ? "status-pill-active" : activeItem.status === "New" ? "status-pill-inactive" : ""}`}>
                  {formatFeedbackLabel(activeItem.status)}
                </span>
              </div>

              <div className="feedback-owner-summary-card">
                <p>{parsedActive.summary}</p>
              </div>

              {parsedActive.details.length > 0 ? (
                <div className="feedback-detail-grid">
                  {parsedActive.details.map(([label, value]) => (
                    <div key={label} className="feedback-detail-item">
                      <p className="eyebrow">{label}</p>
                      <p>{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="inline-fields settings-inline-fields-wide">
                <label className="form-label">
                  Status
                  <select value={activeDraft.status} onChange={(event) => setDrafts((current) => ({ ...current, [activeItem.id]: { ...activeDraft, status: event.target.value } }))}>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{formatFeedbackLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Subscriber email
                  <input className="text-input" value={activeItem.submittedByEmail} readOnly />
                </label>
              </div>

              <label className="form-label">
                Platform note
                <textarea
                  className="text-input settings-message-template"
                  rows={6}
                  value={activeDraft.adminNote}
                  onChange={(event) => setDrafts((current) => ({ ...current, [activeItem.id]: { ...activeDraft, adminNote: event.target.value } }))}
                  placeholder="Visible to the subscriber."
                />
              </label>

              <div className="feedback-card-footer">
                <p className="muted">Submitted {formatFeedbackDate(activeItem.createdAtUtc)}{activeItem.reviewedAtUtc ? ` | Updated ${formatFeedbackDate(activeItem.reviewedAtUtc)}` : ""}</p>
                <button type="button" className="button button-primary" disabled={!activeDirty || savingId === activeItem.id} onClick={() => void save(activeItem.id)}>
                  {savingId === activeItem.id ? "Saving..." : "Save update"}
                </button>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
