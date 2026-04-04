import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import type { EmailDispatchLog, SubscriberWhatsAppMessageItem, SubscriberWhatsAppMessagePage } from "../types";

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

function formatEmailStatus(succeeded: boolean) {
  return succeeded ? "Sent" : "Failed";
}

function getEmailStatusClassName(succeeded: boolean) {
  return succeeded ? "status-pill-active" : "status-pill-danger";
}

function resolveEmailStatus(item: EmailDispatchLog) {
  return item.status?.trim() || formatEmailStatus(item.succeeded);
}

function formatEmailDeliveryMode(value: string) {
  return value === "LocalFolder" ? "Local folder" : "SMTP";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function buildEmailPreviewDocument(body: string) {
  const trimmed = body.trim();
  if (/^\s*(<!doctype html|<html[\s>])/i.test(trimmed)) {
    if (/<\/head>/i.test(trimmed)) {
      return trimmed.replace(
        /<\/head>/i,
        `<style>
          a, button, input, select, textarea, label, summary {
            pointer-events: none !important;
            cursor: default !important;
          }
        </style></head>`);
    }

    return trimmed;
  }

  const content = looksLikeHtml(trimmed)
    ? trimmed
    : `<pre>${escapeHtml(trimmed)}</pre>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 20px;
        font-family: Arial, sans-serif;
        line-height: 1.5;
        color: #0f172a;
        background: #ffffff;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font: inherit;
      }
      img, table {
        max-width: 100%;
      }
      table {
        border-collapse: collapse;
      }
      a, button, input, select, textarea, label, summary {
        pointer-events: none !important;
        cursor: default !important;
      }
    </style>
  </head>
  <body>${content}</body>
</html>`;
}

export function WhatsAppMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const emailTableScrollRef = useDragToScroll<HTMLDivElement>();
  const [data, setData] = useState<SubscriberWhatsAppMessagePage | null>(null);
  const [emailItems, setEmailItems] = useState<EmailDispatchLog[]>([]);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [channelTab, setChannelTab] = useState<"whatsapp" | "email">(() => {
    const value = searchParams.get("channel");
    return value === "email" ? value : "whatsapp";
  });
  const [emailStatusFilter, setEmailStatusFilter] = useState<"all" | "sent" | "failed">(() => {
    const value = searchParams.get("emailStatus");
    return value === "sent" || value === "failed" ? value : "all";
  });
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
  const {
    topScrollRef,
    topInnerRef,
    contentScrollRef,
    bottomScrollRef,
    bottomInnerRef,
  } = useSyncedHorizontalScroll([channelTab, statusFilter, sourceFilter, currentPage, pageSize, data?.items.length ?? 0]);

  const selectedMessage = selectedId ? data?.items.find((item) => item.id === selectedId) ?? null : null;
  const selectedEmail = selectedEmailId ? emailItems.find((item) => item.id === selectedEmailId) ?? null : null;
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

  async function loadEmailLogs() {
    setEmailLoading(true);
    setEmailError("");

    try {
      const result = await api.get<EmailDispatchLog[]>("/settings/email-logs");
      setEmailItems(result);
    } catch (loadError) {
      setEmailError(loadError instanceof Error ? loadError.message : "Unable to load email notification history.");
      setEmailItems([]);
    } finally {
      setEmailLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter, sourceFilter, currentPage, pageSize]);

  useEffect(() => {
    void loadEmailLogs();
  }, []);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (channelTab !== "whatsapp") {
      nextParams.set("channel", channelTab);
    } else {
      nextParams.delete("channel");
    }

    if (emailStatusFilter !== "all") {
      nextParams.set("emailStatus", emailStatusFilter);
    } else {
      nextParams.delete("emailStatus");
    }

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
  }, [channelTab, currentPage, emailStatusFilter, pageSize, searchParams, setSearchParams, sourceFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [channelTab, statusFilter, sourceFilter]);

  useEffect(() => {
    if (!selectedMessage && !selectedEmail) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
        setSelectedEmailId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEmail, selectedMessage]);

  useEffect(() => {
    if (!selectedMessage && !selectedEmail) {
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
  }, [selectedEmail, selectedMessage]);

  const queuedCount = data?.items.filter((item) => ["pending", "deferred", "sending"].includes(item.status.toLowerCase())).length ?? 0;
  const sentCount = data?.items.filter((item) => item.status.toLowerCase() === "sent").length ?? 0;
  const failedCount = data?.items.filter((item) => ["failed", "cancelled"].includes(item.status.toLowerCase())).length ?? 0;
  const emailSentCount = emailItems.filter((item) => item.succeeded).length;
  const emailFailedCount = emailItems.filter((item) => !item.succeeded).length;
  const filteredEmailItems = emailItems.filter((item) => {
    if (emailStatusFilter === "sent") {
      return item.succeeded;
    }

    if (emailStatusFilter === "failed") {
      return !item.succeeded;
    }

    return true;
  });
  const {
    topScrollRef: emailTopScrollRef,
    topInnerRef: emailTopInnerRef,
    contentScrollRef: emailContentScrollRef,
    bottomScrollRef: emailBottomScrollRef,
    bottomInnerRef: emailBottomInnerRef,
  } = useSyncedHorizontalScroll([channelTab, emailStatusFilter, filteredEmailItems.length]);
  const overviewQueuedCount = channelTab === "email" ? 0 : queuedCount;
  const overviewSentCount = channelTab === "email" ? emailSentCount : sentCount;
  const overviewFailedCount = channelTab === "email" ? emailFailedCount : failedCount;

  function renderWhatsAppSection() {
    return (
      <>
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

          <section className="card notification-history-table-card">
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

            <div className="subscription-table-shell notification-history-table-shell">
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
                <table className="catalog-table notification-history-table">
                  <thead>
                    <tr>
                      <th>Notification</th>
                      <th>Status</th>
                      <th>Queued</th>
                      <th>Next attempt</th>
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
                                <span className="table-meta-item">
                                  <span className="notification-history-channel-icon notification-history-channel-icon-whatsapp" aria-hidden="true">
                                    <span className="notification-history-channel-icon-letter">W</span>
                                  </span>
                                  WhatsApp
                                </span>
                                <span className="table-meta-item">
                                  <span className="notification-history-chip notification-history-chip-soft">{formatMessageSource(item)}</span>
                                </span>
                              </div>
                              <div className="table-meta notification-history-meta-spaced">
                                <span className="table-meta-item">{item.customerName}</span>
                                <span className="table-meta-item">{item.recipientPhoneNumber}</span>
                                <span className="table-meta-item">Attempts {item.attemptCount}</span>
                                {formatReminderTiming(item.reminderOffsetDays) ? <span className="table-meta-item">{formatReminderTiming(item.reminderOffsetDays)}</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${getMessageStatusClassName(item.status)}`}>{formatMessageStatus(item.status)}</span>
                        </td>
                        <td>{formatDateTime(item.createdAtUtc)}</td>
                        <td>{formatDateTime(item.nextAttemptAtUtc)}</td>
                        <td className="whatsapp-message-error-cell">{item.errorMessage?.trim() || "-"}</td>
                        <td>
                          <button type="button" className="button button-secondary button-small" onClick={() => setSelectedId(item.id)}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
                <div ref={bottomInnerRef} />
              </div>
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
      </>
    );
  }

  function renderEmailSection() {
    return (
      <>
        <div className="catalog-toolbar card subtle-card pwa-filter-bar">
          <select aria-label="Filter email history by status" value={emailStatusFilter} onChange={(event) => setEmailStatusFilter(event.target.value as "all" | "sent" | "failed")}>
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <section className="card notification-history-table-card">
          {emailError ? <HelperText tone="error">{emailError}</HelperText> : null}
          {emailLoading ? <HelperText>Loading email history...</HelperText> : null}

          <div className="subscription-mobile-list">
            {filteredEmailItems.map((item) => (
              <article key={item.id} className="subscription-mobile-card">
                <div className="subscription-mobile-card-header">
                  <div className="subscription-mobile-identity">
                    <strong>{item.subject}</strong>
                    <div className="eyebrow">{item.customerName?.trim() || item.originalRecipient}</div>
                  </div>
                  <button type="button" className="button button-secondary button-compact" onClick={() => setSelectedEmailId(item.id)}>View</button>
                </div>
                <div className="subscription-mobile-card-topline">
                  <span className={`status-pill ${getEmailStatusClassName(item.succeeded)}`}>{resolveEmailStatus(item)}</span>
                  <span className="subscription-mobile-inline-note">{item.notificationType?.trim() || "Email"}</span>
                </div>
                <div className="subscription-mobile-meta">
                  {item.invoiceNumber?.trim() ? (
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Invoice</span>
                      <span className="subscription-mobile-meta-value">{item.invoiceNumber}</span>
                    </div>
                  ) : null}
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Sent at</span>
                    <span className="subscription-mobile-meta-value">{formatDateTime(item.createdAtUtc)}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Recipient</span>
                    <span className="subscription-mobile-meta-value">{item.originalRecipient}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="subscription-table-shell notification-history-table-shell">
            <div ref={emailTopScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
              <div ref={emailTopInnerRef} />
            </div>
            <div
              ref={(node) => {
                emailTableScrollRef.current = node;
                emailContentScrollRef.current = node;
              }}
              className="table-scroll table-scroll-bounded table-scroll-draggable"
            >
              <table className="catalog-table notification-history-table">
                <thead>
                  <tr>
                    <th>Notification</th>
                    <th>Status</th>
                    <th>Sent at</th>
                    <th>Error</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredEmailItems.map((item) => (
                    <tr key={item.id}>
                      <td className="table-primary-cell">
                        <div className="table-primary-cell-stack">
                          <div>
                            <strong className="table-primary-title">{item.subject}</strong>
                            <div className="table-meta">
                              <span className="table-meta-item">
                                <span className="notification-history-channel-icon notification-history-channel-icon-email" aria-hidden="true">
                                  <span className="notification-history-channel-icon-letter">@</span>
                                </span>
                                Email
                              </span>
                              {item.notificationType?.trim() ? <span className="table-meta-item"><span className="notification-history-chip notification-history-chip-soft">{item.notificationType}</span></span> : null}
                              {item.invoiceNumber?.trim() ? <span className="table-meta-item">{item.invoiceNumber}</span> : null}
                              {item.customerName?.trim() ? <span className="table-meta-item">{item.customerName}</span> : null}
                              <span className="table-meta-item">{formatEmailDeliveryMode(item.deliveryMode)}</span>
                            </div>
                            <div className="table-meta notification-history-meta-spaced">
                              <span className="table-meta-item">{item.originalRecipient}</span>
                              {item.wasRedirected || item.originalRecipient !== item.effectiveRecipient ? <span className="table-meta-item">Delivered to {item.effectiveRecipient}</span> : null}
                              {item.redirectReason ? <span className="table-meta-item">{item.redirectReason}</span> : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${getEmailStatusClassName(item.succeeded)}`}>{resolveEmailStatus(item)}</span>
                      </td>
                      <td>{formatDateTime(item.createdAtUtc)}</td>
                      <td className="whatsapp-message-error-cell">{item.errorMessage?.trim() || "-"}</td>
                      <td>
                        <button type="button" className="button button-secondary button-small" onClick={() => setSelectedEmailId(item.id)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div ref={emailBottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
              <div ref={emailBottomInnerRef} />
            </div>
          </div>

          {!emailLoading && filteredEmailItems.length === 0 ? (
            <div className="empty-state">
              <h3>No email notifications yet</h3>
              <p className="muted">Invoice and reminder email delivery records will appear here once email sending has been used for this subscriber.</p>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Notifications</p>
          <h2>Notification History</h2>
          <p className="muted">Use one page to review billing communication across WhatsApp and email for this subscriber.</p>
        </div>
      </header>

      <section className="card settings-tab-card">
        <div className="settings-tab-strip" role="tablist" aria-label="Notification channels">
          <button type="button" className={`settings-tab-button ${channelTab === "whatsapp" ? "settings-tab-button-active" : ""}`} onClick={() => setChannelTab("whatsapp")}>
            <span className="notification-history-tab-label">
              <span className="notification-history-channel-icon notification-history-channel-icon-whatsapp" aria-hidden="true">
                <span className="notification-history-channel-icon-letter">W</span>
              </span>
              WhatsApp
            </span>
          </button>
          <button type="button" className={`settings-tab-button ${channelTab === "email" ? "settings-tab-button-active" : ""}`} onClick={() => setChannelTab("email")}>
            <span className="notification-history-tab-label">
              <span className="notification-history-channel-icon notification-history-channel-icon-email" aria-hidden="true">
                <span className="notification-history-channel-icon-letter">@</span>
              </span>
              Email
            </span>
          </button>
        </div>
      </section>

      <section className="card whatsapp-message-overview">
        <div className="whatsapp-message-overview-grid">
          <div className="whatsapp-message-stat">
            <span className="eyebrow">Queued</span>
            <strong>{overviewQueuedCount}</strong>
          </div>
          <div className="whatsapp-message-stat">
            <span className="eyebrow">Sent</span>
            <strong>{overviewSentCount}</strong>
          </div>
          <div className="whatsapp-message-stat">
            <span className="eyebrow">Failed or cancelled</span>
            <strong>{overviewFailedCount}</strong>
          </div>
        </div>
      </section>

      {channelTab === "email" ? (
        renderEmailSection()
      ) : (
        renderWhatsAppSection()
      )}

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

      {selectedEmail ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setSelectedEmailId(null)}>
          <div className="card invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="email-history-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Email notification</p>
                <h3 id="email-history-detail-title">{selectedEmail.subject}</h3>
                <p className="muted">{selectedEmail.customerName?.trim() || selectedEmail.originalRecipient}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setSelectedEmailId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Status</p>
                    <strong>{resolveEmailStatus(selectedEmail)}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Type</p>
                    <strong>{selectedEmail.notificationType?.trim() || "Email"}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Sent</p>
                    <strong>{formatDateTime(selectedEmail.createdAtUtc)}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Mode</p>
                    <strong>{formatEmailDeliveryMode(selectedEmail.deliveryMode)}</strong>
                  </div>
                </div>

                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header">
                        <p className="eyebrow">Email body</p>
                      </div>
                      {selectedEmail.messageBody?.trim() ? (
                        <iframe
                          className="email-message-preview"
                          title="Email body preview"
                          sandbox=""
                          srcDoc={buildEmailPreviewDocument(selectedEmail.messageBody)}
                        />
                      ) : (
                        <pre className="whatsapp-message-body">Email body was not stored for this older log record.</pre>
                      )}
                    </div>
                  </div>

                  <div className="invoice-detail-aside">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header">
                        <p className="eyebrow">Delivery</p>
                      </div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row">
                          <span>Recipient</span>
                          <strong>{selectedEmail.originalRecipient}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>Delivered to</span>
                          <strong>{selectedEmail.effectiveRecipient}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>Redirected</span>
                          <strong>{selectedEmail.wasRedirected ? "Yes" : "No"}</strong>
                        </div>
                        <div className="invoice-detail-list-row invoice-detail-list-row-top">
                          <span>Error</span>
                          <strong className="invoice-detail-align-right">{selectedEmail.errorMessage?.trim() || "-"}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header">
                        <p className="eyebrow">Reference</p>
                      </div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row">
                          <span>Invoice</span>
                          <strong>{selectedEmail.invoiceNumber?.trim() || "-"}</strong>
                        </div>
                        <div className="invoice-detail-list-row">
                          <span>Customer</span>
                          <strong>{selectedEmail.customerName?.trim() || "-"}</strong>
                        </div>
                        <div className="invoice-detail-list-row invoice-detail-list-row-top">
                          <span>Redirect reason</span>
                          <strong className="invoice-detail-align-right">{selectedEmail.redirectReason?.trim() || "-"}</strong>
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
