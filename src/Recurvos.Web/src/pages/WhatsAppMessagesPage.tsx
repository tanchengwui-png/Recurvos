import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { api } from "../lib/api";
import type { SubscriberWhatsAppMessageItem, SubscriberWhatsAppMessagePage } from "../types";

function formatMessageStatus(status: string) {
  switch (status.toLowerCase()) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "deferred":
      return "Deferred";
    case "sending":
      return "Sending";
    case "cancelled":
      return "Cancelled";
    default:
      return "Queued";
  }
}

function getMessageStatusClassName(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "sent") {
    return "status-pill-active";
  }

  if (normalized === "failed" || normalized === "cancelled") {
    return "status-pill-danger";
  }

  return "status-pill-inactive";
}

function formatMessageSource(item: SubscriberWhatsAppMessageItem) {
  if (item.source === "invoice") {
    return "Invoice issued";
  }

  if (item.reminderName?.trim()) {
    return item.reminderName;
  }

  return "Payment reminder";
}

function formatReminderTiming(offsetDays?: number | null) {
  if (offsetDays === null || offsetDays === undefined) {
    return null;
  }

  if (offsetDays === 0) {
    return "Due date";
  }

  if (offsetDays < 0) {
    const absoluteDays = Math.abs(offsetDays);
    return `${absoluteDays} day${absoluteDays === 1 ? "" : "s"} before due`;
  }

  return `${offsetDays} day${offsetDays === 1 ? "" : "s"} after due`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function WhatsAppMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [data, setData] = useState<SubscriberWhatsAppMessagePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "sent" | "failed" | "cancelled">(() => {
    const value = searchParams.get("status");
    return value === "queued" || value === "sent" || value === "failed" || value === "cancelled" ? value : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<"all" | "invoice" | "reminder">(() => {
    const value = searchParams.get("source");
    return value === "invoice" || value === "reminder" ? value : "all";
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const value = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize") ?? "20");
    return Number.isFinite(value) && value > 0 ? value : 20;
  });

  const selectedMessage = selectedId ? data?.items.find((item) => item.id === selectedId) ?? null : null;
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize));
  const rangeStart = (data?.totalCount ?? 0) === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = (data?.totalCount ?? 0) === 0 ? 0 : Math.min(data?.totalCount ?? 0, currentPage * pageSize);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result = await api.get<SubscriberWhatsAppMessagePage>(
        `/settings/whatsapp-messages?status=${statusFilter}&source=${sourceFilter}&page=${currentPage}&pageSize=${pageSize}`);
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load WhatsApp messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter, sourceFilter, currentPage, pageSize]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    if (sourceFilter !== "all") {
      nextParams.set("source", sourceFilter);
    } else {
      nextParams.delete("source");
    }

    if (currentPage > 1) {
      nextParams.set("page", String(currentPage));
    } else {
      nextParams.delete("page");
    }

    if (pageSize !== 20) {
      nextParams.set("pageSize", String(pageSize));
    } else {
      nextParams.delete("pageSize");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [currentPage, pageSize, searchParams, setSearchParams, sourceFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    if (!selectedMessage) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMessage]);

  useEffect(() => {
    if (!selectedMessage) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedMessage]);

  const queuedCount = data?.items.filter((item) => ["pending", "deferred", "sending"].includes(item.status.toLowerCase())).length ?? 0;
  const sentCount = data?.items.filter((item) => item.status.toLowerCase() === "sent").length ?? 0;
  const failedCount = data?.items.filter((item) => ["failed", "cancelled"].includes(item.status.toLowerCase())).length ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Notifications</p>
          <h2>WhatsApp Messages</h2>
          <p className="muted">Track queued, sent, and failed WhatsApp messages for subscriber billing communication.</p>
        </div>
      </header>

      <section className="card whatsapp-message-overview">
        <div className="whatsapp-message-overview-grid">
          <div className="whatsapp-message-stat">
            <span className="eyebrow">Queued</span>
            <strong>{queuedCount}</strong>
          </div>
          <div className="whatsapp-message-stat">
            <span className="eyebrow">Sent</span>
            <strong>{sentCount}</strong>
          </div>
          <div className="whatsapp-message-stat">
            <span className="eyebrow">Failed or cancelled</span>
            <strong>{failedCount}</strong>
          </div>
        </div>
      </section>

      <div className="catalog-toolbar card subtle-card pwa-filter-bar">
        <select aria-label="Filter WhatsApp messages by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "queued" | "sent" | "failed" | "cancelled")}>
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select aria-label="Filter WhatsApp messages by source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | "invoice" | "reminder")}>
          <option value="all">All sources</option>
          <option value="invoice">Invoice issued</option>
          <option value="reminder">Payment reminder</option>
        </select>
      </div>

      <section className="card">
        {error ? <HelperText tone="error">{error}</HelperText> : null}
        {loading ? <HelperText>Loading WhatsApp messages...</HelperText> : null}

        <div className="subscription-mobile-list">
          {data?.items.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.invoiceNumber}</strong>
                  <div className="eyebrow">{item.customerName}</div>
                </div>
                <button type="button" className="button button-secondary button-compact" onClick={() => setSelectedId(item.id)}>View</button>
              </div>
              <div className="subscription-mobile-card-topline">
                <span className={`status-pill ${getMessageStatusClassName(item.status)}`}>{formatMessageStatus(item.status)}</span>
                <span className="subscription-mobile-inline-note">{formatMessageSource(item)}</span>
                {formatReminderTiming(item.reminderOffsetDays) ? <span className="subscription-mobile-inline-note">{formatReminderTiming(item.reminderOffsetDays)}</span> : null}
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Phone</span>
                  <span className="subscription-mobile-meta-value">{item.recipientPhoneNumber}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Queued</span>
                  <span className="subscription-mobile-meta-value">{formatDateTime(item.createdAtUtc)}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Attempts</span>
                  <span className="subscription-mobile-meta-value">{item.attemptCount}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div ref={tableScrollRef} className="table-scroll table-scroll-bounded table-scroll-draggable">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Source</th>
                <th>Status</th>
                <th>Queued</th>
                <th>Next attempt</th>
                <th>Attempts</th>
                <th>Error</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id}>
                  <td className="table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <div>
                        <strong className="table-primary-title">{item.invoiceNumber}</strong>
                        <div className="table-meta">
                          <span className="table-meta-item">{item.recipientPhoneNumber}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{item.customerName}</td>
                  <td>
                    <div>{formatMessageSource(item)}</div>
                    {formatReminderTiming(item.reminderOffsetDays) ? <div className="eyebrow">{formatReminderTiming(item.reminderOffsetDays)}</div> : null}
                  </td>
                  <td>
                    <span className={`status-pill ${getMessageStatusClassName(item.status)}`}>{formatMessageStatus(item.status)}</span>
                  </td>
                  <td>{formatDateTime(item.createdAtUtc)}</td>
                  <td>{formatDateTime(item.nextAttemptAtUtc)}</td>
                  <td>{item.attemptCount}</td>
                  <td className="whatsapp-message-error-cell">{item.errorMessage?.trim() || "-"}</td>
                  <td>
                    <button type="button" className="button button-secondary button-small" onClick={() => setSelectedId(item.id)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && (data?.items.length ?? 0) === 0 ? (
          <div className="empty-state">
            <h3>No WhatsApp messages yet</h3>
            <p className="muted">Queued, sent, and failed WhatsApp billing messages will appear here once subscriber notifications start flowing.</p>
          </div>
        ) : null}

        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={data?.totalCount ?? 0}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>

      {selectedMessage ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setSelectedId(null)}>
          <div className="card invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="whatsapp-message-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">WhatsApp message</p>
                <h3 id="whatsapp-message-detail-title">{selectedMessage.invoiceNumber}</h3>
                <p className="muted">{selectedMessage.customerName}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setSelectedId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Status</p>
                    <strong>{formatMessageStatus(selectedMessage.status)}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Source</p>
                    <strong>{formatMessageSource(selectedMessage)}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Queued</p>
                    <strong>{formatDateTime(selectedMessage.createdAtUtc)}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Attempts</p>
                    <strong>{selectedMessage.attemptCount}</strong>
                  </div>
                </div>

                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header">
                        <p className="eyebrow">Message body</p>
                      </div>
                      <pre className="whatsapp-message-body">{selectedMessage.message}</pre>
                    </div>
                  </div>

                  <div className="invoice-detail-aside">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header">
                        <p className="eyebrow">Delivery</p>
                      </div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row">
                          <span>Phone</span>
                          <strong>{selectedMessage.recipientPhoneNumber}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>Next attempt</span>
                          <strong>{formatDateTime(selectedMessage.nextAttemptAtUtc)}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>Last attempt</span>
                          <strong>{formatDateTime(selectedMessage.lastAttemptAtUtc)}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>External message ID</span>
                          <strong>{selectedMessage.externalMessageId?.trim() || "-"}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header">
                        <p className="eyebrow">Source detail</p>
                      </div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row">
                          <span>Type</span>
                          <strong>{formatMessageSource(selectedMessage)}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>Timing</span>
                          <strong>{formatReminderTiming(selectedMessage.reminderOffsetDays) ?? "-"}</strong>
                        </div>
                        <div className="invoice-detail-list-row invoice-detail-list-row-top">
                          <span>Error</span>
                          <strong className="invoice-detail-align-right">{selectedMessage.errorMessage?.trim() || "-"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
