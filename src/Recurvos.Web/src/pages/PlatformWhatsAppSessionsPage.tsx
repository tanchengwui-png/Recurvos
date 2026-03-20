import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { FailedWhatsAppNotification, PlatformWhatsAppSettings, PlatformWhatsAppTestMessageResult, WhatsAppRetryResult } from "../types";

function formatSessionStatus(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shouldPollSession(settings: PlatformWhatsAppSettings | null) {
  if (!settings || settings.provider !== "whatsapp_web_js") {
    return false;
  }

  const status = settings.sessionStatus.toLowerCase();
  if (settings.sessionQrCodeDataUrl) {
    return true;
  }

  return !["connected", "not_connected", "disconnected", "auth_failure", "error", "worker_unreachable"].includes(status);
}

export function PlatformWhatsAppSessionsPage() {
  const [settings, setSettings] = useState<PlatformWhatsAppSettings | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Hello from Recurvos WhatsApp test.");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [failedNotifications, setFailedNotifications] = useState<FailedWhatsAppNotification[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setIsLoading(true);
      setError("");
      const [result, failures] = await Promise.all([
        api.get<PlatformWhatsAppSettings>("/settings/platform-whatsapp"),
        api.get<FailedWhatsAppNotification[]>("/platform/whatsapp-failures"),
      ]);
      setSettings(result);
      setFailedNotifications(failures);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load WhatsApp session status.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!shouldPollSession(settings)) {
      return;
    }

    const timer = window.setTimeout(() => {
      void load();
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [settings]);

  async function runSessionAction(path: string, successMessage: string) {
    try {
      setIsLoading(true);
      setError("");
      setActionMessage("");
      const result = await api.post<PlatformWhatsAppSettings>(path);
      setSettings(result);
      setActionMessage(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update WhatsApp session.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="platform-whatsapp-header-copy">
          <p className="eyebrow">Platform messaging</p>
          <h2>WhatsApp Sessions</h2>
          <p className="muted">Manage the shared WhatsApp sender used for subscriber reminders, test message delivery, and monitor session health in one place.</p>
        </div>
        <div className="button-stack">
          <Link className="button button-secondary" to="/platform/settings">Back to settings</Link>
          <button type="button" className="button button-secondary" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh status"}
          </button>
        </div>
      </header>

      {actionMessage ? <HelperText>{actionMessage}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      {settings ? (
        <div className="platform-whatsapp-layout">
          <section className="card settings-form-card platform-whatsapp-main-card">
            <div className="card-section-header">
              <div>
                <p className="eyebrow">Current provider</p>
                <h3 className="section-title">{settings.provider === "whatsapp_web_js" ? "WhatsApp Web session" : "Generic WhatsApp API"}</h3>
                <p className="muted form-intro">
                  {settings.provider === "whatsapp_web_js"
                    ? "Run the shared signed-in WhatsApp number from here. The QR login, session state, and operator test message all stay in one workspace."
                    : "This workspace is ready, but QR login only appears when the platform provider is switched to WhatsApp Web in Platform Settings."}
                </p>
              </div>
              <span className={`status-pill ${settings.isReady ? "status-pill-active" : "status-pill-inactive"}`}>
                {settings.isReady ? "Ready" : "Not ready"}
              </span>
            </div>

            <div className="platform-whatsapp-summary-grid">
              <div className="platform-whatsapp-summary-card">
                <span className="settings-stat-label">Provider</span>
                <strong>{settings.provider === "whatsapp_web_js" ? "WhatsApp Web" : "Generic API"}</strong>
                <p className="muted">The active sending layer used for platform reminders.</p>
              </div>
              <div className="platform-whatsapp-summary-card">
                <span className="settings-stat-label">Session status</span>
                <strong>{formatSessionStatus(settings.sessionStatus)}</strong>
                <p className="muted">Current worker connection state for the shared sender.</p>
              </div>
              <div className="platform-whatsapp-summary-card">
                <span className="settings-stat-label">Connected number</span>
                <strong>{settings.sessionPhone ?? "-"}</strong>
                <p className="muted">The WhatsApp number currently linked to the shared session.</p>
              </div>
              <div className="platform-whatsapp-summary-card">
                <span className="settings-stat-label">Last synced</span>
                <strong>{formatDate(settings.sessionLastSyncedAtUtc)}</strong>
                <p className="muted">Latest session refresh reported by the worker.</p>
              </div>
            </div>

            {settings.provider === "whatsapp_web_js" ? (
              <div className="platform-whatsapp-workspace">
                <section className="platform-whatsapp-panel">
                  <div className="platform-whatsapp-panel-header">
                    <div>
                      <p className="eyebrow">Session control</p>
                      <strong>Shared sender login</strong>
                    </div>
                  </div>
                  <p className="muted">
                    Start the QR login to link the platform’s shared WhatsApp number. Disconnect it here if you want to re-authenticate with another number.
                  </p>
                  <div className="button-stack">
                    <button type="button" className="button button-primary" onClick={() => void runSessionAction("/settings/platform-whatsapp/session/connect", "WhatsApp session connect started.")} disabled={isLoading}>
                      Start QR login
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => void runSessionAction("/settings/platform-whatsapp/session/disconnect", "WhatsApp session disconnected.")} disabled={isLoading}>
                      Disconnect session
                    </button>
                  </div>
                  {settings.sessionLastError ? <HelperText tone="error">{settings.sessionLastError}</HelperText> : null}
                </section>

                <section className="platform-whatsapp-panel">
                  <div className="platform-whatsapp-panel-header">
                    <div>
                      <p className="eyebrow">QR login</p>
                      <strong>Scan in WhatsApp</strong>
                    </div>
                  </div>
                  {settings.sessionQrCodeDataUrl ? (
                    <div className="platform-whatsapp-qr-card">
                      <p className="muted">Open WhatsApp on your phone, go to Linked devices, and scan this QR to connect the shared sender.</p>
                      <img
                        src={settings.sessionQrCodeDataUrl}
                        alt="WhatsApp QR code"
                        className="platform-whatsapp-qr-image"
                      />
                    </div>
                  ) : (
                    <div className="platform-whatsapp-empty-card">
                      <strong>No QR published yet</strong>
                      <p className="muted">Start QR login first. If the worker is already starting, refresh status in a few seconds and the QR will appear here.</p>
                    </div>
                  )}
                </section>

                <section className="platform-whatsapp-panel">
                  <div className="platform-whatsapp-panel-header">
                    <div>
                      <p className="eyebrow">Delivery check</p>
                      <strong>Send test message</strong>
                    </div>
                  </div>
                  <label className="form-label">
                    Test phone number
                    <input className="text-input" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="60123456789" />
                  </label>
                  <label className="form-label">
                    Test message
                    <textarea className="text-input" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={5} />
                  </label>
                  <HelperText>Use a full WhatsApp number in international format. The number does not need to be saved in the contact list, but it must exist on WhatsApp.</HelperText>
                  <div className="button-stack">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={isSendingTest || !testPhone.trim() || !testMessage.trim()}
                      onClick={async () => {
                        try {
                          setIsSendingTest(true);
                          setError("");
                          setActionMessage("");
                          const result = await api.post<PlatformWhatsAppTestMessageResult>("/settings/platform-whatsapp/test-message", {
                            recipientPhoneNumber: testPhone,
                            message: testMessage,
                          });
                          setActionMessage(result.externalMessageId ? `${result.message} (${result.externalMessageId})` : result.message);
                        } catch (sendError) {
                          setError(sendError instanceof Error ? sendError.message : "Unable to send WhatsApp test message.");
                        } finally {
                          setIsSendingTest(false);
                        }
                      }}
                    >
                      {isSendingTest ? "Sending..." : "Send test message"}
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="platform-whatsapp-empty-card platform-whatsapp-empty-card-wide">
                <strong>QR login is not active for the current provider</strong>
                <p className="muted">Switch the platform provider to <code>WhatsApp Web (whatsapp-web.js)</code> in Platform Settings if you want to manage a shared QR session here. Otherwise this page stays as a read-only status view for the generic API mode.</p>
              </div>
            )}
          </section>

          <aside className="card platform-whatsapp-side-card">
            <div className="platform-whatsapp-panel-header">
              <div>
                <p className="eyebrow">Operator notes</p>
                <strong>How to use this</strong>
              </div>
            </div>
            <div className="platform-whatsapp-side-list">
              <div className="platform-whatsapp-side-item">
                <strong>1. Keep the worker running</strong>
                <p className="muted">The QR and session state come from the WhatsApp worker. If the worker is off, this page will not be able to connect or refresh.</p>
              </div>
              <div className="platform-whatsapp-side-item">
                <strong>2. Sign in one shared number</strong>
                <p className="muted">This session is platform-wide. Subscriber reminder flows use the same shared sender once it is connected.</p>
              </div>
              <div className="platform-whatsapp-side-item">
                <strong>3. Test before enabling scale</strong>
                <p className="muted">Use the test panel after every reconnect so you know the linked number is still able to deliver messages.</p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {settings ? (
        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Manual recovery</p>
              <h3 className="section-title">Failed WhatsApp sends</h3>
              <p className="muted form-intro">When WhatsApp delivery fails, review the latest failures here and resend them manually once the session is healthy again.</p>
            </div>
          </div>
          {failedNotifications.length > 0 ? (
            <div className="table-scroll">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Company</th>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Phone</th>
                    <th>Failure</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {failedNotifications.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.createdAtUtc)}</td>
                      <td>{item.companyName}</td>
                      <td>{item.invoiceNumber}</td>
                      <td>{item.customerName}</td>
                      <td>{item.isReminder ? "Reminder" : "Invoice send"}</td>
                      <td>{item.recipientPhoneNumber}</td>
                      <td>{item.errorMessage || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="button button-secondary button-compact"
                          disabled={retryingId === item.id}
                          onClick={async () => {
                            try {
                              setRetryingId(item.id);
                              setError("");
                              setActionMessage("");
                              const result = await api.post<WhatsAppRetryResult>(`/platform/whatsapp-failures/${item.id}/retry`);
                              setActionMessage(result.externalMessageId ? `${result.message} (${result.externalMessageId})` : result.message);
                              await load();
                            } catch (retryError) {
                              setError(retryError instanceof Error ? retryError.message : "Unable to resend WhatsApp message.");
                            } finally {
                              setRetryingId(null);
                            }
                          }}
                        >
                          {retryingId === item.id ? "Resending..." : "Resend"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No failed WhatsApp sends are waiting for owner action.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
