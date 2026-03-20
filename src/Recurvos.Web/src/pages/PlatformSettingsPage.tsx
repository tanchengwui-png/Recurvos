import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatUploadSizeLabel } from "../lib/uploads";
import type { PlatformBillplzSettings, PlatformBillplzTestResult, PlatformDocumentNumberingSettings, PlatformFeedbackSettings, PlatformIssuerSettings, PlatformRuntimeProfile, PlatformSmtpSettings, PlatformSmtpTestResult, PlatformUploadPolicy, PlatformWhatsAppSettings } from "../types";

function formatDocumentNumber(prefix: string, sequence: number, padding: number) {
  const now = new Date();
  const normalizedPrefix = (prefix || "INV").trim();
  const pattern = normalizedPrefix.includes("{") ? normalizedPrefix : "{PREFIX}-{YYYY}-{SEQPAD}";
  const safePrefix = normalizedPrefix.replace(/-+$/, "") || "INV";
  const safePadding = Math.max(1, Number.isFinite(padding) ? padding : 6);
  const safeSequence = Math.max(1, Number.isFinite(sequence) ? sequence : 1);
  const paddedSequence = String(safeSequence).padStart(safePadding, "0");

  return pattern
    .replaceAll("{PREFIX}", safePrefix)
    .replaceAll("{YYYY}", String(now.getFullYear()).padStart(4, "0"))
    .replaceAll("{YY}", String(now.getFullYear() % 100).padStart(2, "0"))
    .replaceAll("{MM}", String(now.getMonth() + 1).padStart(2, "0"))
    .replaceAll("{SEQPAD}", paddedSequence)
    .replaceAll("{SEQ6}", String(safeSequence).padStart(6, "0"))
    .replaceAll("{SEQ}", String(safeSequence));
}

export function PlatformSettingsPage() {
  const [editingEnvironment, setEditingEnvironment] = useState<"staging" | "production">("staging");
  const [activeSection, setActiveSection] = useState<"issuer" | "documents" | "smtp" | "billplz" | "feedback" | "whatsapp" | "upload">("issuer");
  const [runtimeProfile, setRuntimeProfile] = useState<PlatformRuntimeProfile | null>(null);
  const [issuerSettings, setIssuerSettings] = useState<PlatformIssuerSettings | null>(null);
  const [savedIssuerSettings, setSavedIssuerSettings] = useState<PlatformIssuerSettings | null>(null);
  const [documentNumbering, setDocumentNumbering] = useState<PlatformDocumentNumberingSettings | null>(null);
  const [savedDocumentNumbering, setSavedDocumentNumbering] = useState<PlatformDocumentNumberingSettings | null>(null);
  const [whatsAppSettings, setWhatsAppSettings] = useState<PlatformWhatsAppSettings | null>(null);
  const [savedWhatsAppSettings, setSavedWhatsAppSettings] = useState<PlatformWhatsAppSettings | null>(null);
  const [feedbackSettings, setFeedbackSettings] = useState<PlatformFeedbackSettings | null>(null);
  const [savedFeedbackSettings, setSavedFeedbackSettings] = useState<PlatformFeedbackSettings | null>(null);
  const [smtpSettings, setSmtpSettings] = useState<PlatformSmtpSettings | null>(null);
  const [savedSmtpSettings, setSavedSmtpSettings] = useState<PlatformSmtpSettings | null>(null);
  const [billplzSettings, setBillplzSettings] = useState<PlatformBillplzSettings | null>(null);
  const [savedBillplzSettings, setSavedBillplzSettings] = useState<PlatformBillplzSettings | null>(null);
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy | null>(null);
  const [savedUploadPolicy, setSavedUploadPolicy] = useState<PlatformUploadPolicy | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [smtpTestMessage, setSmtpTestMessage] = useState("");
  const [smtpTestError, setSmtpTestError] = useState("");
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [billplzTestMessage, setBillplzTestMessage] = useState("");
  const [billplzTestError, setBillplzTestError] = useState("");
  const [isTestingBillplz, setIsTestingBillplz] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  const issuerDirty = issuerSettings !== null
    && savedIssuerSettings !== null
    && JSON.stringify(issuerSettings) !== JSON.stringify(savedIssuerSettings);
  const documentNumberingDirty = documentNumbering !== null
    && savedDocumentNumbering !== null
    && JSON.stringify(documentNumbering) !== JSON.stringify(savedDocumentNumbering);
  const whatsAppDirty = whatsAppSettings !== null
    && savedWhatsAppSettings !== null
    && JSON.stringify(whatsAppSettings) !== JSON.stringify(savedWhatsAppSettings);
  const feedbackDirty = feedbackSettings !== null
    && savedFeedbackSettings !== null
    && JSON.stringify(feedbackSettings) !== JSON.stringify(savedFeedbackSettings);
  const smtpDirty = smtpSettings !== null
    && savedSmtpSettings !== null
    && JSON.stringify(smtpSettings) !== JSON.stringify(savedSmtpSettings);
  const billplzDirty = billplzSettings !== null
    && savedBillplzSettings !== null
    && JSON.stringify(billplzSettings) !== JSON.stringify(savedBillplzSettings);
  const uploadPolicyDirty = uploadPolicy !== null
    && savedUploadPolicy !== null
    && JSON.stringify(uploadPolicy) !== JSON.stringify(savedUploadPolicy);
  const platformInvoiceNumberPreview = documentNumbering
    ? formatDocumentNumber(documentNumbering.invoicePrefix, documentNumbering.invoiceNextNumber, documentNumbering.invoiceMinimumDigits)
    : "";
  const platformReceiptNumberPreview = documentNumbering
    ? formatDocumentNumber(documentNumbering.receiptPrefix, documentNumbering.receiptNextNumber, documentNumbering.receiptMinimumDigits)
    : "";

  useEffect(() => {
    void load();
  }, [editingEnvironment]);

  async function load() {
    setError("");

    const [runtimeProfileResult, issuerResult, documentNumberingResult, whatsAppResult, feedbackResult, smtpResult, billplzResult, uploadPolicyResult] = await Promise.allSettled([
      api.get<PlatformRuntimeProfile>("/settings/platform-runtime-profile"),
      api.get<PlatformIssuerSettings>(`/settings/platform-issuer?environment=${editingEnvironment}`),
      api.get<PlatformDocumentNumberingSettings>("/settings/platform-document-numbering"),
      api.get<PlatformWhatsAppSettings>("/settings/platform-whatsapp"),
      api.get<PlatformFeedbackSettings>("/settings/platform-feedback"),
      api.get<PlatformSmtpSettings>(`/settings/platform-smtp?environment=${editingEnvironment}`),
      api.get<PlatformBillplzSettings>(`/settings/platform-billplz?environment=${editingEnvironment}`),
      api.get<PlatformUploadPolicy>("/settings/platform-upload-policy"),
    ]);

    if (runtimeProfileResult.status === "fulfilled") {
      setRuntimeProfile(runtimeProfileResult.value);
    }

    if (issuerResult.status === "fulfilled") {
      setIssuerSettings(issuerResult.value);
      setSavedIssuerSettings(issuerResult.value);
    }
    if (documentNumberingResult.status === "fulfilled") {
      setDocumentNumbering(documentNumberingResult.value);
      setSavedDocumentNumbering(documentNumberingResult.value);
    }

    if (whatsAppResult.status === "fulfilled") {
      setWhatsAppSettings(whatsAppResult.value);
      setSavedWhatsAppSettings(whatsAppResult.value);
    }

    if (feedbackResult.status === "fulfilled") {
      setFeedbackSettings(feedbackResult.value);
      setSavedFeedbackSettings(feedbackResult.value);
    }

    if (smtpResult.status === "fulfilled") {
      setSmtpSettings(smtpResult.value);
      setSavedSmtpSettings(smtpResult.value);
    }

    if (billplzResult.status === "fulfilled") {
      setBillplzSettings(billplzResult.value);
      setSavedBillplzSettings(billplzResult.value);
    }

    if (uploadPolicyResult.status === "fulfilled") {
      setUploadPolicy(uploadPolicyResult.value);
      setSavedUploadPolicy(uploadPolicyResult.value);
    }

    const failedSections: string[] = [];
    if (runtimeProfileResult.status === "rejected") failedSections.push("runtime profile");
    if (issuerResult.status === "rejected") failedSections.push("platform issuer");
    if (documentNumberingResult.status === "rejected") failedSections.push("platform document numbering");
    if (feedbackResult.status === "rejected") failedSections.push("owner email");
    if (smtpResult.status === "rejected") failedSections.push("SMTP settings");
    if (billplzResult.status === "rejected") failedSections.push("Billplz settings");
    if (uploadPolicyResult.status === "rejected") failedSections.push("upload policy");
    if (whatsAppResult.status === "rejected") failedSections.push("WhatsApp settings");

    if (failedSections.length > 0) {
      setError(`Some platform settings could not be loaded: ${failedSections.join(", ")}.`);
    }
  }

  function formatSessionStatus(value: string) {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function renderSectionUnavailable(title: string, description: string) {
    return (
      <section className="card settings-form-card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">Platform settings</p>
            <h3 className="section-title">{title}</h3>
            <p className="muted form-intro">{description}</p>
          </div>
          <span className="status-pill status-pill-inactive">Unavailable</span>
        </div>
        <HelperText tone="error">This section could not be loaded. Refresh the page or restart `Recurvos.Api` if the problem continues.</HelperText>
      </section>
    );
  }

  const liveModeLabel = runtimeProfile?.activeEnvironment === "production" ? "Production" : "Staging";
  const editingModeLabel = editingEnvironment === "production" ? "Production settings" : "Staging settings";

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Platform settings</p>
          <h2>Central owner configuration</h2>
          <p className="muted">Keep owner email, SMTP, upload limits, and shared WhatsApp delivery in one platform settings page.</p>
        </div>
      </header>

      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText>{error}</HelperText> : null}

      <div className="platform-settings-layout">
      {runtimeProfile ? (
        <aside className="platform-settings-sidebar">
        <section className="card settings-form-card platform-settings-sticky">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Live mode</p>
              <h3 className="section-title">Which settings are live now?</h3>
              <p className="muted form-intro">SMTP, Billplz, and billing identity use the live mode below. You can still edit staging and production separately.</p>
            </div>
            <span className={`status-pill ${runtimeProfile.activeEnvironment === "production" ? "status-pill-active" : "status-pill-inactive"}`}>
              {`Currently live: ${liveModeLabel}`}
            </span>
          </div>
          <HelperText>{`${editingModeLabel} are shown below. Changing the selection reloads the SMTP and Billplz values for that environment.`}</HelperText>
          <div className="platform-settings-toggle" role="tablist" aria-label="Live mode">
            <button
              type="button"
              className={`platform-settings-toggle-option ${runtimeProfile.activeEnvironment === "staging" ? "platform-settings-toggle-option-active" : ""}`}
              onClick={() => {
                if (runtimeProfile.activeEnvironment === "staging") return;
                setConfirmState({
                  title: "Make staging live",
                  description: "Switch live mode so the app uses staging SMTP and payment gateway settings?",
                  action: async () => {
                    const updated = await api.put<PlatformRuntimeProfile>("/settings/platform-runtime-profile", { activeEnvironment: "staging" });
                    setRuntimeProfile(updated);
                    setMessage("Live mode switched to staging.");
                    setError("");
                    setConfirmState(null);
                  },
                });
              }}
            >
              Staging
            </button>
            <button
              type="button"
              className={`platform-settings-toggle-option ${runtimeProfile.activeEnvironment === "production" ? "platform-settings-toggle-option-active" : ""}`}
              onClick={() => {
                if (runtimeProfile.activeEnvironment === "production") return;
                setConfirmState({
                  title: "Make production live",
                  description: "Switch live mode so the app uses production SMTP and payment gateway settings?",
                  action: async () => {
                    const updated = await api.put<PlatformRuntimeProfile>("/settings/platform-runtime-profile", { activeEnvironment: "production" });
                    setRuntimeProfile(updated);
                    setMessage("Live mode switched to production.");
                    setError("");
                    setConfirmState(null);
                  },
                });
              }}
            >
              Production
            </button>
          </div>
          <div className="platform-settings-toggle" role="tablist" aria-label="Editing environment">
            <button
              type="button"
              className={`platform-settings-toggle-option ${editingEnvironment === "staging" ? "platform-settings-toggle-option-active" : ""}`}
              onClick={() => setEditingEnvironment("staging")}
            >
              Staging settings
            </button>
            <button
              type="button"
              className={`platform-settings-toggle-option ${editingEnvironment === "production" ? "platform-settings-toggle-option-active" : ""}`}
              onClick={() => setEditingEnvironment("production")}
            >
              Production settings
            </button>
          </div>
          <nav className="platform-settings-nav" aria-label="Platform settings sections">
            <button type="button" className={`platform-settings-nav-link ${activeSection === "issuer" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("issuer")}>Billing identity</button>
            <button type="button" className={`platform-settings-nav-link ${activeSection === "documents" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("documents")}>Documents</button>
            <button type="button" className={`platform-settings-nav-link ${activeSection === "smtp" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("smtp")}>SMTP</button>
            <button type="button" className={`platform-settings-nav-link ${activeSection === "billplz" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("billplz")}>Billplz</button>
            <button type="button" className={`platform-settings-nav-link ${activeSection === "feedback" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("feedback")}>Owner email</button>
            <button type="button" className={`platform-settings-nav-link ${activeSection === "whatsapp" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("whatsapp")}>WhatsApp</button>
            <button type="button" className={`platform-settings-nav-link ${activeSection === "upload" ? "platform-settings-nav-link-active" : ""}`} onClick={() => setActiveSection("upload")}>Upload policy</button>
          </nav>
        </section>
        </aside>
      ) : null}

      <div className="platform-settings-main">
      {activeSection === "issuer" && issuerSettings ? (
        <section id="platform-issuer" className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Platform billing identity</p>
              <h3 className="section-title">{`Issuer details: ${editingModeLabel}`}</h3>
              <p className="muted form-intro">These values appear on platform invoices issued to subscriber companies for the selected environment.</p>
            </div>
            <span className={`status-pill ${issuerSettings.isReady ? "status-pill-active" : "status-pill-inactive"}`}>
              {issuerSettings.isReady ? "Ready" : "Incomplete"}
            </span>
          </div>
          <div className="form-stack">
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Company name
                <input className="text-input" value={issuerSettings.companyName} onChange={(event) => setIssuerSettings((current) => current ? { ...current, companyName: event.target.value, isReady: Boolean(event.target.value.trim() && current.registrationNumber.trim() && current.billingEmail.trim()) } : current)} />
              </label>
              <label className="form-label">
                Registration number
                <input className="text-input" value={issuerSettings.registrationNumber} onChange={(event) => setIssuerSettings((current) => current ? { ...current, registrationNumber: event.target.value, isReady: Boolean(current.companyName.trim() && event.target.value.trim() && current.billingEmail.trim()) } : current)} />
              </label>
            </div>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Billing email
                <input className="text-input" type="email" value={issuerSettings.billingEmail} onChange={(event) => setIssuerSettings((current) => current ? { ...current, billingEmail: event.target.value, isReady: Boolean(current.companyName.trim() && current.registrationNumber.trim() && event.target.value.trim()) } : current)} />
              </label>
              <label className="form-label">
                Phone
                <input className="text-input" value={issuerSettings.phone ?? ""} onChange={(event) => setIssuerSettings((current) => current ? { ...current, phone: event.target.value } : current)} />
              </label>
            </div>
            <label className="form-label">
              Address
              <input className="text-input" value={issuerSettings.address ?? ""} onChange={(event) => setIssuerSettings((current) => current ? { ...current, address: event.target.value } : current)} />
            </label>
            <button
              type="button"
              className="button button-primary"
              disabled={!issuerDirty}
              onClick={() => setConfirmState({
                title: "Save platform issuer details",
                description: "Save the platform billing identity used on subscriber invoices?",
                action: async () => {
                  if (!issuerSettings) return;

                  try {
                      const updated = await api.put<PlatformIssuerSettings>("/settings/platform-issuer", {
                        environment: editingEnvironment,
                        companyName: issuerSettings.companyName,
                        registrationNumber: issuerSettings.registrationNumber,
                        billingEmail: issuerSettings.billingEmail,
                        phone: issuerSettings.phone,
                        address: issuerSettings.address,
                      });
                      setIssuerSettings(updated);
                      setSavedIssuerSettings(updated);
                      setMessage(`Platform issuer details saved for ${editingEnvironment}.`);
                    setError("");
                    setConfirmState(null);
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Unable to save platform issuer details.");
                    setMessage("");
                    setConfirmState(null);
                  }
                },
              })}
            >
              Save issuer details
            </button>
          </div>
        </section>
      ) : null}
      {activeSection === "issuer" && !issuerSettings ? renderSectionUnavailable("Billing identity", "Platform issuer details are not available right now.") : null}

      {activeSection === "documents" && documentNumbering ? (
        <section className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Platform documents</p>
              <h3 className="section-title">Invoice and receipt numbering</h3>
              <p className="muted form-intro">Subscriber package invoices and receipts follow this platform numbering setup.</p>
            </div>
          </div>
          <div className="settings-tabbed-grid">
            <section className="card subtle-card settings-form-card">
              <div className="card-section-header">
                <div>
                  <p className="eyebrow">Invoice number</p>
                  <h3 className="section-title">Platform invoice sequence</h3>
                  <p className="muted form-intro">Minimum digits only change formatting. The running number stays based on the next number below.</p>
                </div>
              </div>
              <div className="form-stack">
                <div className="settings-number-preview">
                  <span className="settings-number-preview-label">Next output</span>
                  <strong>{platformInvoiceNumberPreview}</strong>
                </div>
                <div className="inline-fields settings-inline-fields-wide">
                  <label className="form-label">
                    Prefix
                    <input className="text-input" value={documentNumbering.invoicePrefix} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, invoicePrefix: event.target.value } : current)} />
                  </label>
                  <label className="form-label">
                    Minimum digits
                    <input className="text-input" type="number" min={1} max={12} value={documentNumbering.invoiceMinimumDigits} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, invoiceMinimumDigits: Number(event.target.value) } : current)} />
                  </label>
                  <label className="form-label">
                    Next number
                    <input className="text-input" type="number" min={1} value={documentNumbering.invoiceNextNumber} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, invoiceNextNumber: Number(event.target.value) } : current)} />
                  </label>
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" checked={documentNumbering.invoiceResetYearly} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, invoiceResetYearly: event.target.checked } : current)} />
                  <span>Reset yearly</span>
                </label>
              </div>
            </section>
            <section className="card subtle-card settings-form-card">
              <div className="card-section-header">
                <div>
                  <p className="eyebrow">Receipt number</p>
                  <h3 className="section-title">Platform receipt sequence</h3>
                  <p className="muted form-intro">Use this to preview the exact receipt number customers will see next.</p>
                </div>
              </div>
              <div className="form-stack">
                <div className="settings-number-preview">
                  <span className="settings-number-preview-label">Next output</span>
                  <strong>{platformReceiptNumberPreview}</strong>
                </div>
                <div className="inline-fields settings-inline-fields-wide">
                  <label className="form-label">
                    Prefix
                    <input className="text-input" value={documentNumbering.receiptPrefix} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, receiptPrefix: event.target.value } : current)} />
                  </label>
                  <label className="form-label">
                    Minimum digits
                    <input className="text-input" type="number" min={1} max={12} value={documentNumbering.receiptMinimumDigits} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, receiptMinimumDigits: Number(event.target.value) } : current)} />
                  </label>
                  <label className="form-label">
                    Next number
                    <input className="text-input" type="number" min={1} value={documentNumbering.receiptNextNumber} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, receiptNextNumber: Number(event.target.value) } : current)} />
                  </label>
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" checked={documentNumbering.receiptResetYearly} onChange={(event) => setDocumentNumbering((current) => current ? { ...current, receiptResetYearly: event.target.checked } : current)} />
                  <span>Reset yearly</span>
                </label>
              </div>
            </section>
          </div>
          <div className="settings-action-row">
            <button
              type="button"
              className="button button-primary"
              disabled={!documentNumberingDirty}
              onClick={() => setConfirmState({
                title: "Save platform document numbering",
                description: "Save the invoice and receipt numbering used for platform subscription billing?",
                action: async () => {
                  if (!documentNumbering) return;
                  try {
                    const updated = await api.put<PlatformDocumentNumberingSettings>("/settings/platform-document-numbering", documentNumbering);
                    setDocumentNumbering(updated);
                    setSavedDocumentNumbering(updated);
                    setMessage("Platform document numbering saved.");
                    setError("");
                    setConfirmState(null);
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Unable to save platform document numbering.");
                    setMessage("");
                    setConfirmState(null);
                  }
                },
              })}
            >
              Save document numbering
            </button>
          </div>
        </section>
      ) : null}
      {activeSection === "documents" && !documentNumbering ? renderSectionUnavailable("Documents", "Platform document numbering is not available right now.") : null}

      {activeSection === "feedback" && feedbackSettings ? (
        <section id="platform-feedback" className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Feedback notifications</p>
              <h3 className="section-title">Owner email</h3>
              <p className="muted form-intro">New subscriber feedback is emailed to this address. Subscribers also receive an email when you save a new platform reply or status update.</p>
            </div>
            <span className={`status-pill ${feedbackSettings.isReady ? "status-pill-active" : "status-pill-inactive"}`}>
              {feedbackSettings.isReady ? "Ready" : "Not set"}
            </span>
          </div>
          <div className="form-stack">
            <label className="form-label">
              Notification email
              <input
                className="text-input"
                type="email"
                value={feedbackSettings.ownerNotificationEmail ?? ""}
                onChange={(event) => setFeedbackSettings((current) => current ? { ...current, ownerNotificationEmail: event.target.value, isReady: event.target.value.trim().length > 0 } : current)}
                placeholder="owner@yourcompany.com"
              />
            </label>
            <HelperText>Leave this blank to pause owner email notifications for new subscriber feedback.</HelperText>
            <button
              type="button"
              className="button button-primary"
              disabled={!feedbackDirty}
              onClick={() => setConfirmState({
                title: "Save feedback notification email",
                description: "Save the owner email that receives new subscriber feedback notifications?",
                action: async () => {
                  if (!feedbackSettings) return;

                  try {
                    const updated = await api.put<PlatformFeedbackSettings>("/settings/platform-feedback", {
                      ownerNotificationEmail: feedbackSettings.ownerNotificationEmail,
                    });
                    setFeedbackSettings(updated);
                    setSavedFeedbackSettings(updated);
                    setMessage("Feedback notification email saved.");
                    setError("");
                    setConfirmState(null);
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Unable to save feedback notification email.");
                    setMessage("");
                    setConfirmState(null);
                  }
                },
              })}
            >
              Save feedback email
            </button>
          </div>
        </section>
      ) : null}
      {activeSection === "feedback" && !feedbackSettings ? renderSectionUnavailable("Owner email", "Feedback notification settings are not available right now.") : null}

      {activeSection === "smtp" && smtpSettings ? (
        <section id="platform-smtp" className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Email delivery</p>
              <h3 className="section-title">{`Platform SMTP settings: ${editingModeLabel}`}</h3>
              <p className="muted form-intro">These settings are used for verification emails, password resets, invoice emails, and feedback notifications.</p>
            </div>
            <span className={`status-pill ${smtpSettings.isReady ? "status-pill-active" : "status-pill-inactive"}`}>
              {smtpSettings.isReady ? "Ready" : "Incomplete"}
            </span>
          </div>
          <div className="form-stack">
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                SMTP host
                <input className="text-input" value={smtpSettings.host ?? ""} onChange={(event) => setSmtpSettings((current) => current ? { ...current, host: event.target.value, isReady: Boolean(event.target.value.trim() && current.fromEmail?.trim()) } : current)} placeholder="smtp.yourprovider.com" />
              </label>
              <label className="form-label">
                Port
                <input className="text-input" type="number" min="1" max="65535" value={String(smtpSettings.port)} onChange={(event) => setSmtpSettings((current) => current ? { ...current, port: Number(event.target.value) || current.port } : current)} />
              </label>
            </div>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Username
                <input className="text-input" value={smtpSettings.username ?? ""} onChange={(event) => setSmtpSettings((current) => current ? { ...current, username: event.target.value } : current)} placeholder="Optional if your SMTP server does not require login" />
              </label>
              <label className="form-label">
                Password
                <input className="text-input" type="password" value={smtpSettings.password ?? ""} onChange={(event) => setSmtpSettings((current) => current ? { ...current, password: event.target.value } : current)} placeholder="SMTP password or app password" />
              </label>
            </div>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                From email
                <input className="text-input" type="email" value={smtpSettings.fromEmail ?? ""} onChange={(event) => setSmtpSettings((current) => current ? { ...current, fromEmail: event.target.value, isReady: Boolean(current.host?.trim() && event.target.value.trim()) } : current)} placeholder="noreply@yourdomain.com" />
              </label>
              <label className="form-label">
                From name
                <input className="text-input" value={smtpSettings.fromName ?? ""} onChange={(event) => setSmtpSettings((current) => current ? { ...current, fromName: event.target.value } : current)} placeholder="Your company name" />
              </label>
            </div>
            <label className="checkbox-row settings-checkbox-row">
              <input type="checkbox" checked={smtpSettings.useSsl} onChange={(event) => setSmtpSettings((current) => current ? { ...current, useSsl: event.target.checked } : current)} />
              <span>Use SSL</span>
            </label>
            <label className="checkbox-row settings-checkbox-row">
              <input type="checkbox" checked={smtpSettings.localEmailCaptureEnabled} onChange={(event) => setSmtpSettings((current) => current ? { ...current, localEmailCaptureEnabled: event.target.checked } : current)} />
              <span>Save emails to local folder</span>
            </label>
            <label className="checkbox-row settings-checkbox-row">
              <input type="checkbox" checked={smtpSettings.emailShieldEnabled} onChange={(event) => setSmtpSettings((current) => current ? { ...current, emailShieldEnabled: event.target.checked } : current)} />
              <span>Email shield mode</span>
            </label>
            <label className="form-label">
              Shield email address
              <input className="text-input" type="email" value={smtpSettings.emailShieldAddress ?? ""} onChange={(event) => setSmtpSettings((current) => current ? { ...current, emailShieldAddress: event.target.value } : current)} placeholder="your-test-inbox@yourdomain.com" />
            </label>
            <HelperText>
              {smtpSettings.localEmailCaptureEnabled
                ? "Emails will be written to C:\\Recurvos\\storage\\emails instead of using SMTP."
                : "If platform SMTP is not configured yet, Development still falls back to C:\\Recurvos\\storage\\emails."}
            </HelperText>
            <HelperText>When email shield is on, all outgoing emails are redirected to this address instead of the real customer or subscriber.</HelperText>
            <div className="button-stack">
              <button
                type="button"
                className="button button-secondary"
                disabled={!smtpSettings.host?.trim()}
                onClick={async () => {
                  if (!smtpSettings) return;

                  try {
                    setIsTestingSmtp(true);
                    setSmtpTestError("");
                    setSmtpTestMessage("");
                    const result = await api.post<PlatformSmtpTestResult>("/settings/platform-smtp/test", {
                      host: smtpSettings.host,
                      environment: editingEnvironment,
                      port: smtpSettings.port,
                      username: smtpSettings.username,
                      password: smtpSettings.password,
                      fromEmail: smtpSettings.fromEmail,
                      fromName: smtpSettings.fromName,
                      useSsl: smtpSettings.useSsl,
                      localEmailCaptureEnabled: smtpSettings.localEmailCaptureEnabled,
                      emailShieldEnabled: smtpSettings.emailShieldEnabled,
                      emailShieldAddress: smtpSettings.emailShieldAddress,
                    });
                    setSmtpTestMessage(result.message);
                    setError("");
                  } catch (testError) {
                    const message = testError instanceof Error ? testError.message : "Unable to test SMTP connection.";
                    setSmtpTestError(
                      message.includes("The requested record could not be found.")
                        ? "SMTP test is not ready on the running API yet. Restart Recurvos.Api and try again."
                        : message
                    );
                    setMessage("");
                  } finally {
                    setIsTestingSmtp(false);
                  }
                }}
              >
                {isTestingSmtp ? "Testing..." : "Test SMTP connection"}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!smtpDirty}
                onClick={() => setConfirmState({
                  title: "Save SMTP settings",
                  description: "Save the SMTP settings used by platform email delivery?",
                  action: async () => {
                    if (!smtpSettings) return;

                    try {
                      const updated = await api.put<PlatformSmtpSettings>("/settings/platform-smtp", {
                        host: smtpSettings.host,
                        environment: editingEnvironment,
                        port: smtpSettings.port,
                        username: smtpSettings.username,
                        password: smtpSettings.password,
                        fromEmail: smtpSettings.fromEmail,
                        fromName: smtpSettings.fromName,
                        useSsl: smtpSettings.useSsl,
                        localEmailCaptureEnabled: smtpSettings.localEmailCaptureEnabled,
                        emailShieldEnabled: smtpSettings.emailShieldEnabled,
                        emailShieldAddress: smtpSettings.emailShieldAddress,
                      });
                      setSmtpSettings(updated);
                      setSavedSmtpSettings(updated);
                      setMessage(`Platform SMTP settings saved for ${editingEnvironment}.`);
                      setError("");
                      setConfirmState(null);
                    } catch (saveError) {
                      setError(saveError instanceof Error ? saveError.message : "Unable to save SMTP settings.");
                      setMessage("");
                      setConfirmState(null);
                    }
                  },
                })}
              >
                Save SMTP settings
              </button>
            </div>
            {smtpTestMessage ? <HelperText>{smtpTestMessage}</HelperText> : null}
            {smtpTestError ? <HelperText tone="error">{smtpTestError}</HelperText> : null}
          </div>
        </section>
      ) : null}
      {activeSection === "smtp" && !smtpSettings ? renderSectionUnavailable("SMTP", "Platform SMTP settings are not available right now.") : null}

      {activeSection === "billplz" && billplzSettings ? (
        <section id="platform-billplz" className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Payment gateway</p>
              <h3 className="section-title">{`Billplz settings: ${editingModeLabel}`}</h3>
              <p className="muted form-intro">These settings are used when generating Billplz payment links and verifying Billplz webhooks.</p>
            </div>
            <span className={`status-pill ${billplzSettings.isReady ? "status-pill-active" : "status-pill-inactive"}`}>
              {billplzSettings.isReady ? "Ready" : "Incomplete"}
            </span>
          </div>
          <div className="form-stack">
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Billplz API key
                <input className="text-input" value={billplzSettings.apiKey ?? ""} onChange={(event) => setBillplzSettings((current) => current ? { ...current, apiKey: event.target.value } : current)} placeholder="Billplz API key" />
              </label>
              <label className="form-label">
                Collection ID
                <input className="text-input" value={billplzSettings.collectionId ?? ""} onChange={(event) => setBillplzSettings((current) => current ? { ...current, collectionId: event.target.value } : current)} placeholder="Billplz collection ID" />
              </label>
            </div>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                X signature key
                <input className="text-input" value={billplzSettings.xSignatureKey ?? ""} onChange={(event) => setBillplzSettings((current) => current ? { ...current, xSignatureKey: event.target.value } : current)} placeholder="Webhook signature key" />
              </label>
              <label className="form-label">
                Base URL
                <input className="text-input" value={billplzSettings.baseUrl ?? ""} onChange={(event) => setBillplzSettings((current) => current ? { ...current, baseUrl: event.target.value } : current)} placeholder="https://www.billplz-sandbox.com" />
              </label>
            </div>
            <label className="checkbox-row settings-checkbox-row">
              <input type="checkbox" checked={billplzSettings.requireSignatureVerification} onChange={(event) => setBillplzSettings((current) => current ? { ...current, requireSignatureVerification: event.target.checked } : current)} />
              <span>Require webhook signature verification</span>
            </label>
            <HelperText>Use the sandbox base URL for testing. Your Billplz callback URL still depends on the API base URL configured at startup.</HelperText>
            <div className="button-stack">
              <button
                type="button"
                className="button button-secondary"
                disabled={!billplzSettings.collectionId?.trim()}
                onClick={async () => {
                  if (!billplzSettings) return;

                  try {
                    setIsTestingBillplz(true);
                    setBillplzTestError("");
                    setBillplzTestMessage("");
                    const result = await api.post<PlatformBillplzTestResult>("/settings/platform-billplz/test", {
                      apiKey: billplzSettings.apiKey,
                      environment: editingEnvironment,
                      collectionId: billplzSettings.collectionId,
                      xSignatureKey: billplzSettings.xSignatureKey,
                      baseUrl: billplzSettings.baseUrl,
                      requireSignatureVerification: billplzSettings.requireSignatureVerification,
                    });
                    setBillplzTestMessage(result.message);
                    setError("");
                  } catch (testError) {
                    setBillplzTestError(testError instanceof Error ? testError.message : "Unable to test Billplz connection.");
                    setMessage("");
                  } finally {
                    setIsTestingBillplz(false);
                  }
                }}
              >
                {isTestingBillplz ? "Testing..." : "Test Billplz connection"}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!billplzDirty}
                onClick={() => setConfirmState({
                  title: "Save Billplz settings",
                  description: "Save the platform Billplz configuration used for payment links and webhooks?",
                  action: async () => {
                    if (!billplzSettings) return;

                    try {
                      const updated = await api.put<PlatformBillplzSettings>("/settings/platform-billplz", {
                        apiKey: billplzSettings.apiKey,
                        environment: editingEnvironment,
                        collectionId: billplzSettings.collectionId,
                        xSignatureKey: billplzSettings.xSignatureKey,
                        baseUrl: billplzSettings.baseUrl,
                        requireSignatureVerification: billplzSettings.requireSignatureVerification,
                      });
                      setBillplzSettings(updated);
                      setSavedBillplzSettings(updated);
                      setMessage(`Platform Billplz settings saved for ${editingEnvironment}.`);
                      setError("");
                      setConfirmState(null);
                    } catch (saveError) {
                      setError(saveError instanceof Error ? saveError.message : "Unable to save Billplz settings.");
                      setMessage("");
                      setConfirmState(null);
                    }
                  },
                })}
              >
                Save Billplz settings
              </button>
            </div>
            {billplzTestMessage ? <HelperText>{billplzTestMessage}</HelperText> : null}
            {billplzTestError ? <HelperText tone="error">{billplzTestError}</HelperText> : null}
          </div>
        </section>
      ) : null}
      {activeSection === "billplz" && !billplzSettings ? renderSectionUnavailable("Billplz", "Platform Billplz settings are not available right now.") : null}

      {activeSection === "upload" && uploadPolicy ? (
        <section id="platform-upload-policy" className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Storage policy</p>
              <h3 className="section-title">Image upload policy</h3>
              <p className="muted form-intro">This policy applies to company logos, payment QR images, manual payment proofs, and public payment confirmation proofs.</p>
            </div>
            <span className={`status-pill ${uploadPolicyDirty ? "status-pill-inactive" : "status-pill-active"}`}>
              {uploadPolicyDirty ? "Unsaved" : "Saved"}
            </span>
          </div>
          <div className="form-stack">
            <label className="checkbox-row settings-checkbox-row">
              <input type="checkbox" checked={uploadPolicy.autoCompressUploads} onChange={(event) => setUploadPolicy((current) => current ? { ...current, autoCompressUploads: event.target.checked } : current)} />
              <span>Auto-compress uploaded images in the browser</span>
            </label>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Max upload size
                <input className="text-input" type="number" min="200000" max="5000000" step="100000" value={String(uploadPolicy.uploadMaxBytes)} onChange={(event) => setUploadPolicy((current) => current ? { ...current, uploadMaxBytes: Number(event.target.value) || current.uploadMaxBytes } : current)} />
              </label>
              <label className="form-label">
                Max image dimension
                <input className="text-input" type="number" min="600" max="2400" step="100" value={String(uploadPolicy.uploadImageMaxDimension)} onChange={(event) => setUploadPolicy((current) => current ? { ...current, uploadImageMaxDimension: Number(event.target.value) || current.uploadImageMaxDimension } : current)} />
              </label>
              <label className="form-label">
                Image quality
                <input className="text-input" type="number" min="50" max="95" step="1" value={String(uploadPolicy.uploadImageQuality)} onChange={(event) => setUploadPolicy((current) => current ? { ...current, uploadImageQuality: Number(event.target.value) || current.uploadImageQuality } : current)} />
              </label>
            </div>
            <HelperText>{`Current limit: ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)}. Images are resized to a maximum side of ${uploadPolicy.uploadImageMaxDimension}px with quality ${uploadPolicy.uploadImageQuality}.`}</HelperText>
            <button
              type="button"
              className="button button-primary"
              disabled={!uploadPolicyDirty}
              onClick={() => setConfirmState({
                title: "Save upload policy",
                description: "Save the upload compression and size policy for all subscribers?",
                action: async () => {
                  if (!uploadPolicy) return;

                  try {
                    const updated = await api.put<PlatformUploadPolicy>("/settings/platform-upload-policy", uploadPolicy);
                    setUploadPolicy(updated);
                    setSavedUploadPolicy(updated);
                    setMessage("Platform upload policy saved.");
                    setError("");
                    setConfirmState(null);
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Unable to save platform upload policy.");
                    setMessage("");
                    setConfirmState(null);
                  }
                },
              })}
            >
              Save upload policy
            </button>
          </div>
        </section>
      ) : null}
      {activeSection === "upload" && !uploadPolicy ? renderSectionUnavailable("Upload policy", "Platform upload policy is not available right now.") : null}

      {activeSection === "whatsapp" && whatsAppSettings ? (
        <section id="platform-whatsapp" className="card settings-form-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Centralized messaging</p>
              <h3 className="section-title">Platform WhatsApp setup</h3>
              <p className="muted form-intro">This shared WhatsApp sender is used for subscriber payment reminders. Package quotas still apply per subscriber.</p>
            </div>
            <span className={`status-pill ${whatsAppSettings.isReady ? "status-pill-active" : "status-pill-inactive"}`}>
              {whatsAppSettings.isReady ? "Ready" : "Not ready"}
            </span>
          </div>
          <div className="form-stack">
            <label className="checkbox-row settings-checkbox-row">
              <input type="checkbox" checked={whatsAppSettings.isEnabled} onChange={(event) => setWhatsAppSettings((current) => current ? { ...current, isEnabled: event.target.checked } : current)} />
              <span>Enable centralized WhatsApp reminders</span>
            </label>
            <label className="form-label">
              Provider
              <select value={whatsAppSettings.provider} onChange={(event) => setWhatsAppSettings((current) => current ? { ...current, provider: event.target.value as PlatformWhatsAppSettings["provider"] } : current)}>
                <option value="generic_api">Generic WhatsApp API</option>
                <option value="whatsapp_web_js">WhatsApp Web (whatsapp-web.js)</option>
              </select>
            </label>
            <div className="inline-fields settings-inline-fields-wide">
              <div className="dashboard-list-item">
                <div>
                  <strong>Current provider</strong>
                  <p className="muted">{whatsAppSettings.provider === "whatsapp_web_js" ? "WhatsApp Web (beta)" : "Generic WhatsApp API"}</p>
                </div>
              </div>
              <div className="dashboard-list-item">
                <div>
                  <strong>Session status</strong>
                  <p className="muted">{formatSessionStatus(whatsAppSettings.sessionStatus)}</p>
                </div>
              </div>
              <div className="dashboard-list-item">
                <div>
                  <strong>Connected number</strong>
                  <p className="muted">{whatsAppSettings.sessionPhone ?? "-"}</p>
                </div>
              </div>
            </div>
            {whatsAppSettings.provider === "generic_api" ? (
              <>
                <div className="inline-fields settings-inline-fields-wide">
                  <label className="form-label">
                    API URL
                    <input className="text-input" value={whatsAppSettings.apiUrl ?? ""} onChange={(event) => setWhatsAppSettings((current) => current ? { ...current, apiUrl: event.target.value } : current)} placeholder="https://your-whatsapp-gateway/send" />
                  </label>
                  <label className="form-label">
                    Sender ID
                    <input className="text-input" value={whatsAppSettings.senderId ?? ""} onChange={(event) => setWhatsAppSettings((current) => current ? { ...current, senderId: event.target.value } : current)} placeholder="phone-number-id" />
                  </label>
                </div>
                <label className="form-label">
                  Access token
                  <input className="text-input" value={whatsAppSettings.accessToken ?? ""} onChange={(event) => setWhatsAppSettings((current) => current ? { ...current, accessToken: event.target.value } : current)} placeholder="Bearer token" />
                </label>
                <HelperText>The platform sends `senderId`, `to`, `template`, `message`, and `reference` to your WhatsApp API.</HelperText>
              </>
            ) : (
              <div className="form-stack">
                <HelperText>
                  `whatsapp-web.js` session login is managed from the `WhatsApp Sessions` page. This settings page only selects the provider and shared template.
                </HelperText>
                <div className="button-stack">
                  <Link className="button button-secondary" to="/platform/whatsapp-sessions">
                    Open WhatsApp Sessions
                  </Link>
                </div>
              </div>
            )}
            <label className="form-label">
              Template name
              <input className="text-input" value={whatsAppSettings.template ?? ""} onChange={(event) => setWhatsAppSettings((current) => current ? { ...current, template: event.target.value } : current)} placeholder="payment-reminder" />
            </label>
            {whatsAppSettings.provider === "whatsapp_web_js" ? (
              <HelperText>{`Current session status: ${formatSessionStatus(whatsAppSettings.sessionStatus)}${whatsAppSettings.sessionPhone ? ` | ${whatsAppSettings.sessionPhone}` : ""}`}</HelperText>
            ) : null}
            <button
              type="button"
              className="button button-primary"
              disabled={!whatsAppDirty}
              onClick={() => setConfirmState({
                title: "Save platform WhatsApp settings",
                description: "Save the centralized WhatsApp configuration for all subscribers?",
                action: async () => {
                  if (!whatsAppSettings) return;

                  try {
                    const updated = await api.put<PlatformWhatsAppSettings>("/settings/platform-whatsapp", {
                      isEnabled: whatsAppSettings.isEnabled,
                      provider: whatsAppSettings.provider,
                      apiUrl: whatsAppSettings.apiUrl,
                      accessToken: whatsAppSettings.accessToken,
                      senderId: whatsAppSettings.senderId,
                      template: whatsAppSettings.template,
                    });
                    setSavedWhatsAppSettings(updated);
                    setWhatsAppSettings(updated);
                    setMessage("Platform WhatsApp settings saved.");
                    setError("");
                    setConfirmState(null);
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Unable to save platform WhatsApp settings.");
                    setMessage("");
                    setConfirmState(null);
                  }
                },
              })}
            >
              Save WhatsApp settings
            </button>
          </div>
        </section>
      ) : null}
      {activeSection === "whatsapp" && !whatsAppSettings ? renderSectionUnavailable("WhatsApp", "Platform WhatsApp settings are not available right now.") : null}

      </div>
      </div>

      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
