import { useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { getAuth } from "../lib/auth";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { BillingReadiness, CompanyInvoiceSettings, CompanyLookup, CompanyPaymentGatewayTestResult, DunningRule, FeatureAccess, PlatformUploadPolicy } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:7001/api";

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

function clampMinimumDigits(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(12, Math.max(1, Math.trunc(parsed)));
}

const DEFAULT_WHATSAPP_TEMPLATE = [
  "Hi {CustomerName},",
  "",
  "This is a friendly reminder from {CompanyName}.",
  "Invoice {InvoiceNumber} for {AmountDue} is due on {DueDate}.",
  "Payment link: {ActionLink}",
  "",
  "If payment has already been made, please ignore this message. Thank you.",
].join("\n");

type SettingsTab = "documents" | "payment" | "whatsapp" | "reminders";

export function SettingsPage() {
  const [rules, setRules] = useState<DunningRule[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [savedInvoiceSettings, setSavedInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [formError, setFormError] = useState("");
  const [paymentGatewayTestMessage, setPaymentGatewayTestMessage] = useState("");
  const [paymentGatewayTestTone, setPaymentGatewayTestTone] = useState<"default" | "error">("default");
  const [testingPaymentGateway, setTestingPaymentGateway] = useState(false);
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("documents");

  const invoiceSettingsDirty = invoiceSettings !== null
    && savedInvoiceSettings !== null
    && JSON.stringify(invoiceSettings) !== JSON.stringify(savedInvoiceSettings);
  const numberingDirty = invoiceSettings !== null
    && savedInvoiceSettings !== null
    && (
      invoiceSettings.prefix !== savedInvoiceSettings.prefix
      || invoiceSettings.padding !== savedInvoiceSettings.padding
      || invoiceSettings.nextNumber !== savedInvoiceSettings.nextNumber
      || invoiceSettings.resetYearly !== savedInvoiceSettings.resetYearly
      || invoiceSettings.receiptPrefix !== savedInvoiceSettings.receiptPrefix
      || invoiceSettings.receiptPadding !== savedInvoiceSettings.receiptPadding
      || invoiceSettings.receiptNextNumber !== savedInvoiceSettings.receiptNextNumber
      || invoiceSettings.receiptResetYearly !== savedInvoiceSettings.receiptResetYearly
    );
  const documentOptionsDirty = invoiceSettings !== null
    && savedInvoiceSettings !== null
    && (
      invoiceSettings.showCompanyAddressOnInvoice !== savedInvoiceSettings.showCompanyAddressOnInvoice
      || invoiceSettings.showCompanyAddressOnReceipt !== savedInvoiceSettings.showCompanyAddressOnReceipt
      || invoiceSettings.autoSendInvoices !== savedInvoiceSettings.autoSendInvoices
    );
  const paymentDetailsDirty = invoiceSettings !== null
    && savedInvoiceSettings !== null
    && (
      (invoiceSettings.bankName ?? "") !== (savedInvoiceSettings.bankName ?? "")
      || (invoiceSettings.bankAccountName ?? "") !== (savedInvoiceSettings.bankAccountName ?? "")
      || (invoiceSettings.bankAccount ?? "") !== (savedInvoiceSettings.bankAccount ?? "")
      || invoiceSettings.paymentDueDays !== savedInvoiceSettings.paymentDueDays
      || invoiceSettings.paymentGatewayProvider !== savedInvoiceSettings.paymentGatewayProvider
      || invoiceSettings.paymentGatewayTermsAccepted !== savedInvoiceSettings.paymentGatewayTermsAccepted
      || (invoiceSettings.subscriberBillplzApiKey ?? "") !== (savedInvoiceSettings.subscriberBillplzApiKey ?? "")
      || (invoiceSettings.subscriberBillplzCollectionId ?? "") !== (savedInvoiceSettings.subscriberBillplzCollectionId ?? "")
      || (invoiceSettings.subscriberBillplzXSignatureKey ?? "") !== (savedInvoiceSettings.subscriberBillplzXSignatureKey ?? "")
      || (invoiceSettings.subscriberBillplzBaseUrl ?? "") !== (savedInvoiceSettings.subscriberBillplzBaseUrl ?? "")
      || invoiceSettings.subscriberBillplzRequireSignatureVerification !== savedInvoiceSettings.subscriberBillplzRequireSignatureVerification
      || invoiceSettings.isTaxEnabled !== savedInvoiceSettings.isTaxEnabled
      || (invoiceSettings.taxName ?? "") !== (savedInvoiceSettings.taxName ?? "")
      || (invoiceSettings.taxRate ?? null) !== (savedInvoiceSettings.taxRate ?? null)
      || (invoiceSettings.taxRegistrationNo ?? "") !== (savedInvoiceSettings.taxRegistrationNo ?? "")
    );
  const paymentSectionDirty = paymentDetailsDirty || paymentQrFile !== null;
  const whatsAppDirty = invoiceSettings !== null
    && savedInvoiceSettings !== null
    && (
      invoiceSettings.whatsAppEnabled !== savedInvoiceSettings.whatsAppEnabled
      || (invoiceSettings.whatsAppTemplate ?? "") !== (savedInvoiceSettings.whatsAppTemplate ?? "")
    );
  const invoiceNumberExample = invoiceSettings ? formatDocumentNumber(invoiceSettings.prefix, invoiceSettings.nextNumber, invoiceSettings.padding) : "";
  const receiptNumberExample = invoiceSettings ? formatDocumentNumber(invoiceSettings.receiptPrefix, invoiceSettings.receiptNextNumber, invoiceSettings.receiptPadding) : "";
  const configurableWhatsAppEnabled = featureAccess?.featureKeys.includes("configurable_whatsapp") ?? false;
  const configurableWhatsAppHint = featureAccess?.featureRequirements?.find((item) => item.featureKey === "configurable_whatsapp");
  const emailRemindersEnabled = featureAccess?.featureKeys.includes("email_reminders") ?? false;
  const emailRemindersHint = featureAccess?.featureRequirements?.find((item) => item.featureKey === "email_reminders");
  const paymentGatewayConfigurationEnabled = featureAccess?.featureKeys.includes("payment_gateway_configuration") ?? false;
  const paymentGatewayConfigurationHint = featureAccess?.featureRequirements?.find((item) => item.featureKey === "payment_gateway_configuration");
  const activeTabMeta = {
    documents: {
      eyebrow: "Documents",
      title: "Invoice numbering and delivery",
      intro: "Manage numbering rules, invoice display options, and automatic invoice email delivery.",
    },
    payment: {
      eyebrow: "Payment collection",
      title: "Subscriber payment details",
      intro: "Set bank details, tax settings, due days, payment QR, and online payment gateway setup for the selected subscriber company.",
    },
    whatsapp: {
      eyebrow: "Notifications",
      title: "WhatsApp payment reminders",
      intro: "Control the WhatsApp reminder setup and message template for this subscriber company.",
    },
    reminders: {
      eyebrow: "Follow-up",
      title: "Payment reminders",
      intro: "Manage the reminder schedule that follows the invoice due date for unpaid invoices.",
    },
  }[activeTab];

  function buildInvoiceSettingsPayload(settings: CompanyInvoiceSettings) {
    return {
      prefix: settings.prefix,
      nextNumber: settings.nextNumber,
      padding: settings.padding,
      resetYearly: settings.resetYearly,
      receiptPrefix: settings.receiptPrefix,
      receiptNextNumber: settings.receiptNextNumber,
      receiptPadding: settings.receiptPadding,
      receiptResetYearly: settings.receiptResetYearly,
      bankName: settings.bankName,
      bankAccountName: settings.bankAccountName,
      bankAccount: settings.bankAccount,
      paymentDueDays: settings.paymentDueDays,
      paymentLink: settings.paymentLink,
      paymentGatewayProvider: settings.paymentGatewayProvider,
      paymentGatewayTermsAccepted: settings.paymentGatewayTermsAccepted,
      subscriberBillplzApiKey: settings.subscriberBillplzApiKey,
      subscriberBillplzCollectionId: settings.subscriberBillplzCollectionId,
      subscriberBillplzXSignatureKey: settings.subscriberBillplzXSignatureKey,
      subscriberBillplzBaseUrl: settings.subscriberBillplzBaseUrl,
      subscriberBillplzRequireSignatureVerification: settings.subscriberBillplzRequireSignatureVerification,
      isTaxEnabled: settings.isTaxEnabled,
      taxName: settings.taxName,
      taxRate: settings.taxRate,
      taxRegistrationNo: settings.taxRegistrationNo,
      showCompanyAddressOnInvoice: settings.showCompanyAddressOnInvoice,
      showCompanyAddressOnReceipt: settings.showCompanyAddressOnReceipt,
      autoSendInvoices: settings.autoSendInvoices,
      whatsAppEnabled: settings.whatsAppEnabled,
      whatsAppTemplate: settings.whatsAppTemplate,
    };
  }

  function validateInvoiceSettings(settings: CompanyInvoiceSettings) {
    if (settings.paymentGatewayProvider === "billplz") {
      if (!settings.paymentGatewayTermsAccepted) {
        return "Accept the payment gateway terms before saving Billplz settings.";
      }

      if (!(settings.subscriberBillplzApiKey ?? "").trim()) {
        return "Billplz API key is required.";
      }

      if (!(settings.subscriberBillplzCollectionId ?? "").trim()) {
        return "Billplz collection ID is required.";
      }

      if (!(settings.subscriberBillplzBaseUrl ?? "").trim()) {
        return "Billplz base URL is required.";
      }

      if (settings.subscriberBillplzRequireSignatureVerification && !(settings.subscriberBillplzXSignatureKey ?? "").trim()) {
        return "Billplz x signature key is required when signature verification is enabled.";
      }
    }

    if (!settings.isTaxEnabled) {
      return null;
    }

    if (!settings.taxName.trim()) {
      return "Tax name is required when tax is enabled.";
    }

    if (settings.taxRate === null || settings.taxRate === undefined || settings.taxRate <= 0) {
      return "Tax rate is required when tax is enabled.";
    }

    return null;
  }

  async function saveInvoiceSettings(currentSettings: CompanyInvoiceSettings) {
    const validationError = validateInvoiceSettings(currentSettings);
    if (validationError) {
      setFormError(validationError);
      throw new Error(validationError);
    }

    await api.put(`/settings/invoice-settings?companyId=${selectedCompanyId}`, buildInvoiceSettingsPayload(currentSettings));
  }

  async function load(companyId = selectedCompanyId) {
    if (!companyId) {
      return;
    }

    const nextFeatureAccess = featureAccess ?? await api.get<FeatureAccess>("/settings/feature-access");
    if (!featureAccess) {
      setFeatureAccess(nextFeatureAccess);
    }

    const [invoiceConfig, readiness, ruleList, policy] = await Promise.all([
      api.get<CompanyInvoiceSettings>(`/settings/invoice-settings?companyId=${companyId}`),
      api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${companyId}`),
      nextFeatureAccess.featureKeys.includes("dunning_workflows")
        ? api.get<DunningRule[]>(`/settings/dunning-rules?companyId=${companyId}`)
        : Promise.resolve([]),
      api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
    ]);

    setRules(ruleList);
    setInvoiceSettings(invoiceConfig);
    setSavedInvoiceSettings(invoiceConfig);
    setBillingReadiness(readiness);
    setUploadPolicy(policy);
    setPaymentQrFile(null);
    setPaymentGatewayTestMessage("");
    setPaymentGatewayTestTone("default");
  }

  async function testPaymentGateway(currentSettings: CompanyInvoiceSettings) {
    setTestingPaymentGateway(true);
    setPaymentGatewayTestMessage("");
    setPaymentGatewayTestTone("default");

    try {
      const result = await api.post<CompanyPaymentGatewayTestResult>(`/settings/invoice-settings/payment-gateway/test?companyId=${selectedCompanyId}`, {
        paymentGatewayProvider: currentSettings.paymentGatewayProvider,
        subscriberBillplzApiKey: currentSettings.subscriberBillplzApiKey,
        subscriberBillplzCollectionId: currentSettings.subscriberBillplzCollectionId,
        subscriberBillplzXSignatureKey: currentSettings.subscriberBillplzXSignatureKey,
        subscriberBillplzBaseUrl: currentSettings.subscriberBillplzBaseUrl,
        subscriberBillplzRequireSignatureVerification: currentSettings.subscriberBillplzRequireSignatureVerification,
      });
      setPaymentGatewayTestTone("default");
      setPaymentGatewayTestMessage(result.message);
    } catch (error) {
      setPaymentGatewayTestTone("error");
      setPaymentGatewayTestMessage(error instanceof Error ? error.message : "Unable to test the payment gateway setup.");
    } finally {
      setTestingPaymentGateway(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const companyList = await api.get<CompanyLookup[]>("/companies");
      setCompanies(companyList);

      if (!selectedCompanyId && companyList[0]) {
        setSelectedCompanyId(companyList[0].id);
        await load(companyList[0].id);
        return;
      }

      await load(selectedCompanyId);
    })();
  }, []);

  useEffect(() => {
    void load();
  }, [selectedCompanyId]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="settings-header-copy">
          <p className="eyebrow">Workspace</p>
          <h2>Settings</h2>
          <p className="muted">Manage invoice numbering, payment instructions, and billing rules for the selected company.</p>
        </div>
        <div className="catalog-toolbar" style={{ gridTemplateColumns: "minmax(0, 280px)" }}>
          <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
      </header>
      {formError ? <HelperText tone="error">{formError}</HelperText> : null}
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Required before billing starts: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}
      {invoiceSettings ? (
        <section className="card settings-overview-card">
          <div className="settings-overview-main">
            <p className="eyebrow">Selected company</p>
            <h3>{companies.find((company) => company.id === selectedCompanyId)?.name ?? "Company settings"}</h3>
            <p className="muted">Use this page to control what appears on invoices and where customers should pay.</p>
          </div>
          <div className="settings-overview-grid">
            <div className="settings-overview-stat">
              <span className="settings-stat-label">Invoice format</span>
              <strong>{invoiceNumberExample}</strong>
            </div>
            <div className="settings-overview-stat">
              <span className="settings-stat-label">Receipt format</span>
              <strong>{receiptNumberExample}</strong>
            </div>
            <div className="settings-overview-stat">
              <span className="settings-stat-label">Payment QR</span>
              <strong>{invoiceSettings.hasPaymentQr ? "Ready" : "Missing"}</strong>
            </div>
            <div className="settings-overview-stat">
              <span className="settings-stat-label">Form status</span>
              <strong>{invoiceSettingsDirty ? "Unsaved changes" : "Saved"}</strong>
            </div>
          </div>
        </section>
      ) : null}
      <section className="card settings-tab-card">
        <div className="settings-tab-strip" role="tablist" aria-label="Subscriber settings sections">
          <button type="button" className={`settings-tab-button ${activeTab === "documents" ? "settings-tab-button-active" : ""}`} onClick={() => setActiveTab("documents")}>Documents</button>
          <button type="button" className={`settings-tab-button ${activeTab === "payment" ? "settings-tab-button-active" : ""}`} onClick={() => setActiveTab("payment")}>Payment</button>
          <button type="button" className={`settings-tab-button ${activeTab === "whatsapp" ? "settings-tab-button-active" : ""}`} onClick={() => setActiveTab("whatsapp")}>WhatsApp</button>
          <button type="button" className={`settings-tab-button ${activeTab === "reminders" ? "settings-tab-button-active" : ""}`} onClick={() => setActiveTab("reminders")}>Reminders</button>
        </div>
      </section>
      <section className="card settings-form-card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">{activeTabMeta.eyebrow}</p>
            <h3 className="section-title">{activeTabMeta.title}</h3>
            <p className="muted form-intro">{activeTabMeta.intro}</p>
          </div>
          <span className={`status-pill ${invoiceSettingsDirty ? "status-pill-inactive" : "status-pill-active"}`}>
            {invoiceSettingsDirty ? "Unsaved edits" : "Saved"}
          </span>
        </div>
        {invoiceSettings ? (
          <div className="form-stack">
            {activeTab === "documents" ? (
              <>
                <HelperText>
                  Set the invoice and receipt code, minimum digits, and next running number in one place.
                </HelperText>
                <div className="settings-panel">
                  <div className="settings-panel-header">
                    <div>
                      <p className="eyebrow">Numbering</p>
                      <h4>Document numbering</h4>
                    </div>
                    <span className={`status-pill ${numberingDirty ? "status-pill-inactive" : "status-pill-active"}`}>
                      {numberingDirty ? "Unsaved numbering" : "Numbering saved"}
                    </span>
                  </div>
                  <div className="settings-numbering-workspace">
                    <section className="settings-subpanel settings-numbering-card">
                      <div className="settings-subpanel-header">
                        <div>
                          <p className="eyebrow">Invoice</p>
                          <strong>Invoice number</strong>
                        </div>
                        <div className="settings-number-preview">
                          <span className="settings-number-preview-label">Next output</span>
                          <strong>{invoiceNumberExample}</strong>
                        </div>
                      </div>
                      <div className="settings-numbering-fields">
                        <label className="form-label">
                          Document code
                          <input className="text-input" value={invoiceSettings.prefix} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, prefix: event.target.value } : current)} />
                        </label>
                        <label className="form-label">
                          Minimum digits
                          <input className="text-input" type="number" min="1" max="12" value={String(invoiceSettings.padding)} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, padding: clampMinimumDigits(event.target.value) } : current)} />
                        </label>
                        <label className="form-label settings-numbering-wide-field">
                          Next running number
                          <input className="text-input" type="number" min="1" value={String(invoiceSettings.nextNumber)} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, nextNumber: Number(event.target.value) } : current)} />
                        </label>
                      </div>
                      <label className="checkbox-row settings-checkbox-row">
                        <input type="checkbox" checked={invoiceSettings.resetYearly} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, resetYearly: event.target.checked } : current)} />
                        <span>Reset invoice numbering every year</span>
                      </label>
                    </section>
                    <section className="settings-subpanel settings-numbering-card">
                      <div className="settings-subpanel-header">
                        <div>
                          <p className="eyebrow">Receipt</p>
                          <strong>Receipt number</strong>
                        </div>
                        <div className="settings-number-preview">
                          <span className="settings-number-preview-label">Next output</span>
                          <strong>{receiptNumberExample}</strong>
                        </div>
                      </div>
                      <div className="settings-numbering-fields">
                        <label className="form-label">
                          Document code
                          <input className="text-input" value={invoiceSettings.receiptPrefix} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, receiptPrefix: event.target.value } : current)} />
                        </label>
                        <label className="form-label">
                          Minimum digits
                          <input className="text-input" type="number" min="1" max="12" value={String(invoiceSettings.receiptPadding)} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, receiptPadding: clampMinimumDigits(event.target.value) } : current)} />
                        </label>
                        <label className="form-label settings-numbering-wide-field">
                          Next running number
                          <input className="text-input" type="number" min="1" value={String(invoiceSettings.receiptNextNumber)} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, receiptNextNumber: Number(event.target.value) } : current)} />
                        </label>
                      </div>
                      <label className="checkbox-row settings-checkbox-row">
                        <input type="checkbox" checked={invoiceSettings.receiptResetYearly} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, receiptResetYearly: event.target.checked } : current)} />
                        <span>Reset receipt numbering every year</span>
                      </label>
                    </section>
                  </div>
                  <HelperText>The document code stays fixed while the running number increases automatically.</HelperText>
                  <div className="settings-action-row">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={!numberingDirty}
                      onClick={() => setConfirmState({
                        title: "Save document numbering",
                        description: "Save the current invoice and receipt numbering settings for this company?",
                        action: async () => {
                          if (!invoiceSettings) {
                            return;
                          }

                          try {
                            await saveInvoiceSettings(invoiceSettings);
                            setConfirmState(null);
                            setFormError("");
                            await load();
                          } catch (error) {
                            setFormError(error instanceof Error ? error.message : "Unable to save document numbering.");
                          }
                        },
                      })}
                    >
                      Save numbering
                    </button>
                  </div>
                </div>
                <div className="settings-panel">
                  <div className="settings-panel-header">
                    <div>
                      <p className="eyebrow">Delivery</p>
                      <h4>Document delivery options</h4>
                    </div>
                  </div>
                  <div className="settings-toggle-group">
                    <label className="checkbox-row settings-checkbox-row">
                      <input type="checkbox" checked={invoiceSettings.showCompanyAddressOnInvoice} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, showCompanyAddressOnInvoice: event.target.checked } : current)} />
                      <span>Show company address on invoice</span>
                    </label>
                    <label className="checkbox-row settings-checkbox-row">
                      <input type="checkbox" checked={invoiceSettings.showCompanyAddressOnReceipt} onChange={(event) => setInvoiceSettings((current) => current ? { ...current, showCompanyAddressOnReceipt: event.target.checked } : current)} />
                      <span>Show company address on receipt</span>
                    </label>
                    <label className="checkbox-row settings-checkbox-row">
                      <input
                        type="checkbox"
                        disabled={!emailRemindersEnabled}
                        checked={invoiceSettings.autoSendInvoices}
                        onChange={(event) => setInvoiceSettings((current) => current ? { ...current, autoSendInvoices: event.target.checked } : current)}
                      />
                      <span>Auto-send new invoices by email</span>
                    </label>
                    {!emailRemindersEnabled ? (
                      <HelperText tone="error">{emailRemindersHint ? `Available on ${emailRemindersHint.packageName} and above.` : "Available on a higher package."}</HelperText>
                    ) : null}
                  </div>
                  {documentOptionsDirty ? <HelperText tone="error">You have unsaved changes in document delivery settings.</HelperText> : null}
                  <div className="settings-action-row">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={!documentOptionsDirty}
                      onClick={() => setConfirmState({
                        title: "Save document delivery settings",
                        description: "Save the invoice and receipt display settings for this company?",
                        action: async () => {
                          if (!invoiceSettings) {
                            return;
                          }

                          try {
                            await saveInvoiceSettings(invoiceSettings);
                            setConfirmState(null);
                            setFormError("");
                            await load();
                          } catch (error) {
                            setFormError(error instanceof Error ? error.message : "Unable to save document delivery settings.");
                          }
                        },
                      })}
                    >
                      Save delivery settings
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {activeTab === "payment" ? (
              <>
                <HelperText>
                  Set how this subscriber collects payment, how long invoices stay open, and whether tax is shown.
                </HelperText>
                <div className="settings-panel settings-panel-accent">
                  <div className="settings-panel-header">
                    <div>
                      <p className="eyebrow">Payment collection</p>
                      <h4>Subscriber payment details</h4>
                    </div>
                    <span className={`status-pill ${paymentSectionDirty ? "status-pill-inactive" : "status-pill-active"}`}>
                      {paymentSectionDirty ? "Unsaved payment setup" : "Payment setup saved"}
                    </span>
                  </div>
                  <div className="settings-numbering-workspace">
                    <section className="settings-subpanel settings-numbering-card">
                      <div className="settings-subpanel-header">
                        <div>
                          <p className="eyebrow">Banking</p>
                          <strong>Where customers should pay</strong>
                        </div>
                      </div>
                      <div className="settings-numbering-fields">
                        <label className="form-label">
                          Bank name
                          <input
                            className="text-input"
                            value={invoiceSettings.bankName ?? ""}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, bankName: event.target.value } : current)}
                          />
                        </label>
                        <label className="form-label">
                          Account name
                          <input
                            className="text-input"
                            value={invoiceSettings.bankAccountName ?? ""}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, bankAccountName: event.target.value } : current)}
                          />
                        </label>
                        <label className="form-label settings-numbering-wide-field">
                          Account number
                          <input
                            className="text-input"
                            value={invoiceSettings.bankAccount ?? ""}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, bankAccount: event.target.value } : current)}
                          />
                        </label>
                        <label className="form-label settings-numbering-wide-field">
                          Payment due days
                          <input
                            className="text-input"
                            type="number"
                            min="0"
                            max="90"
                            value={invoiceSettings.paymentDueDays}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, paymentDueDays: Math.max(0, Math.min(90, Number(event.target.value) || 0)) } : current)}
                          />
                        </label>
                      </div>
                      <HelperText>Auto-generated invoices will be due this many days after the issue date.</HelperText>
                    </section>
                    <section className="settings-subpanel settings-numbering-card">
                      <div className="settings-subpanel-header">
                        <div>
                          <p className="eyebrow">Payment QR</p>
                          <strong>Invoice QR code</strong>
                        </div>
                        <span className={`status-pill ${invoiceSettings.hasPaymentQr ? "status-pill-active" : "status-pill-inactive"}`}>
                          {invoiceSettings.hasPaymentQr ? "QR ready" : "QR optional"}
                        </span>
                      </div>
                      <label className="form-label">
                        Upload QR image
                        <input
                          id="payment-qr-upload"
                          className="text-input"
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            if (!file) {
                              setPaymentQrFile(null);
                              return;
                            }

                            void (async () => {
                              try {
                                const prepared = await prepareImageUpload(file, uploadPolicy);
                                setFormError("");
                                setPaymentQrFile(prepared);
                              } catch (uploadError) {
                                setFormError(uploadError instanceof Error ? uploadError.message : `Payment QR must be ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} or smaller.`);
                                event.target.value = "";
                                setPaymentQrFile(null);
                              }
                            })();
                          }}
                        />
                      </label>
                      <HelperText>{invoiceSettings.hasPaymentQr ? "QR uploaded and ready to print on invoices." : "Optional. Upload a QR image to print it on invoices."}</HelperText>
                      <HelperText>{`PNG, JPG, JPEG, and WEBP images up to ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} are allowed.${uploadPolicy.autoCompressUploads ? " Large images are compressed automatically before upload." : ""}`}</HelperText>
                      {paymentQrFile ? <HelperText>{`Selected file: ${paymentQrFile.name}`}</HelperText> : null}
                    </section>
                  </div>
                  {!paymentGatewayConfigurationEnabled ? (
                    <div className="settings-feature-lock-card">
                      <p className="eyebrow">Upgrade required</p>
                      <strong>{paymentGatewayConfigurationHint ? `Available on ${paymentGatewayConfigurationHint.packageName} and above.` : "Available on a higher package."}</strong>
                      <p className="muted">This subscriber can still collect payments manually, but online gateway setup is only available on Premium for now.</p>
                    </div>
                  ) : null}
                  <div className={`settings-tax-card ${!paymentGatewayConfigurationEnabled ? "settings-disabled-workspace" : ""}`}>
                    <div className="settings-panel-header">
                      <div>
                        <p className="eyebrow">Online payment</p>
                        <h4>Payment gateway setup</h4>
                      </div>
                      <span className={`status-pill ${invoiceSettings.paymentGatewayReady ? "status-pill-active" : "status-pill-inactive"}`}>
                        {invoiceSettings.paymentGatewayReady ? "Gateway ready" : "Not configured"}
                      </span>
                    </div>
                    <div className="settings-numbering-fields">
                      <label className="form-label">
                        Provider
                        <select
                          value={invoiceSettings.paymentGatewayProvider}
                          disabled={!paymentGatewayConfigurationEnabled}
                          onChange={(event) => setInvoiceSettings((current) => current ? {
                            ...current,
                            paymentGatewayProvider: event.target.value as CompanyInvoiceSettings["paymentGatewayProvider"],
                            paymentGatewayTermsAccepted: event.target.value === "none" ? false : current.paymentGatewayTermsAccepted,
                          } : current)}
                        >
                          <option value="none">Not configured</option>
                          <option value="billplz">Billplz</option>
                        </select>
                      </label>
                    </div>
                    {invoiceSettings.paymentGatewayProvider === "billplz" ? (
                      <>
                        <HelperText>Billplz is the only supported subscriber-owned gateway right now. The structure stays provider-based so more gateways can be added later.</HelperText>
                        <div className="settings-numbering-fields">
                          <label className="form-label">
                            Billplz API key
                            <input
                              className="text-input"
                              disabled={!paymentGatewayConfigurationEnabled}
                              value={invoiceSettings.subscriberBillplzApiKey ?? ""}
                              onChange={(event) => setInvoiceSettings((current) => current ? { ...current, subscriberBillplzApiKey: event.target.value } : current)}
                            />
                          </label>
                          <label className="form-label">
                            Collection ID
                            <input
                              className="text-input"
                              disabled={!paymentGatewayConfigurationEnabled}
                              value={invoiceSettings.subscriberBillplzCollectionId ?? ""}
                              onChange={(event) => setInvoiceSettings((current) => current ? { ...current, subscriberBillplzCollectionId: event.target.value } : current)}
                            />
                          </label>
                          <label className="form-label settings-numbering-wide-field">
                            Base URL
                            <input
                              className="text-input"
                              disabled={!paymentGatewayConfigurationEnabled}
                              value={invoiceSettings.subscriberBillplzBaseUrl ?? ""}
                              onChange={(event) => setInvoiceSettings((current) => current ? { ...current, subscriberBillplzBaseUrl: event.target.value } : current)}
                              placeholder="https://www.billplz-sandbox.com"
                            />
                          </label>
                        </div>
                        <div className="settings-numbering-fields">
                          <label className="form-label settings-numbering-wide-field">
                            X signature key
                            <input
                              className="text-input"
                              disabled={!paymentGatewayConfigurationEnabled}
                              value={invoiceSettings.subscriberBillplzXSignatureKey ?? ""}
                              onChange={(event) => setInvoiceSettings((current) => current ? { ...current, subscriberBillplzXSignatureKey: event.target.value } : current)}
                            />
                          </label>
                        </div>
                        <label className="checkbox-row settings-checkbox-row">
                          <input
                            type="checkbox"
                            disabled={!paymentGatewayConfigurationEnabled}
                            checked={invoiceSettings.subscriberBillplzRequireSignatureVerification}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, subscriberBillplzRequireSignatureVerification: event.target.checked } : current)}
                          />
                          <span>Require webhook signature verification</span>
                        </label>
                        <label className="checkbox-row settings-checkbox-row settings-risk-checkbox">
                          <input
                            type="checkbox"
                            disabled={!paymentGatewayConfigurationEnabled}
                            checked={invoiceSettings.paymentGatewayTermsAccepted}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, paymentGatewayTermsAccepted: event.target.checked } : current)}
                          />
                          <span>I understand this payment gateway is configured and operated under my own Billplz account, and I use it at my own risk.</span>
                        </label>
                        <HelperText>Only save this after you have confirmed the keys belong to this subscriber’s own Billplz account. The platform does not take responsibility for the subscriber’s gateway account setup, settlement, or disputes.</HelperText>
                        <div className="settings-action-row settings-action-row-wide">
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={!paymentGatewayConfigurationEnabled || testingPaymentGateway}
                            onClick={() => {
                              void testPaymentGateway(invoiceSettings);
                            }}
                          >
                            {testingPaymentGateway ? "Testing..." : "Test Billplz setup"}
                          </button>
                        </div>
                        {paymentGatewayTestMessage ? <HelperText tone={paymentGatewayTestTone}>{paymentGatewayTestMessage}</HelperText> : null}
                      </>
                    ) : (
                      <HelperText>Leave this as not configured if the subscriber will collect payment outside the system.</HelperText>
                    )}
                  </div>
                  <div className="settings-tax-card">
                    <div className="settings-panel-header">
                      <div>
                        <p className="eyebrow">Tax</p>
                        <h4>Company tax settings</h4>
                      </div>
                    </div>
                    <label className="checkbox-row settings-checkbox-row">
                      <input
                        type="checkbox"
                        checked={invoiceSettings.isTaxEnabled}
                        onChange={(event) => setInvoiceSettings((current) => current ? {
                          ...current,
                          isTaxEnabled: event.target.checked,
                          taxName: current.taxName || "SST",
                          taxRate: event.target.checked ? (current.taxRate ?? 6) : null,
                          taxRegistrationNo: event.target.checked ? current.taxRegistrationNo : null,
                        } : current)}
                      />
                      <span>Enable tax</span>
                    </label>
                    {invoiceSettings.isTaxEnabled ? (
                      <div className="settings-numbering-fields">
                        <label className="form-label">
                          Tax name
                          <input
                            className="text-input"
                            value={invoiceSettings.taxName}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, taxName: event.target.value } : current)}
                          />
                        </label>
                        <label className="form-label">
                          Tax rate (%)
                          <input
                            className="text-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={invoiceSettings.taxRate ?? ""}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, taxRate: event.target.value === "" ? null : Number(event.target.value) } : current)}
                          />
                        </label>
                        <label className="form-label settings-numbering-wide-field">
                          Tax registration number
                          <input
                            className="text-input"
                            value={invoiceSettings.taxRegistrationNo ?? ""}
                            onChange={(event) => setInvoiceSettings((current) => current ? { ...current, taxRegistrationNo: event.target.value } : current)}
                          />
                        </label>
                      </div>
                    ) : (
                      <HelperText>When disabled, invoices hide the tax section completely.</HelperText>
                    )}
                  </div>
                  <div className="settings-action-row">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={!paymentSectionDirty}
                    onClick={() => {
                      if (!invoiceSettings) {
                        return;
                      }

                      const validationError = validateInvoiceSettings(invoiceSettings);
                      if (validationError) {
                        setFormError(validationError);
                        return;
                      }

                      setConfirmState({
                        title: "Save subscriber payment details",
                        description: paymentQrFile ? "Save the payment details, payment gateway setup, and upload the selected QR image for this company?" : "Save the payment details and payment gateway setup for this subscriber company?",
                        action: async () => {
                          try {
                            await saveInvoiceSettings(invoiceSettings);

                            const input = document.getElementById("payment-qr-upload") as HTMLInputElement | null;
                            if (paymentQrFile) {
                              const auth = getAuth();
                              const formData = new FormData();
                              formData.append("file", paymentQrFile);

                              const response = await fetch(`${API_BASE_URL}/settings/invoice-settings/payment-qr?companyId=${selectedCompanyId}`, {
                                method: "POST",
                                headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : undefined,
                                body: formData,
                              });

                              if (!response.ok) {
                                const message = await response.text();
                                setConfirmState(null);
                                setFormError(message && !message.startsWith("<") ? message : "Unable to upload payment QR.");
                                return;
                              }
                            }

                            if (input) {
                              input.value = "";
                            }
                            setPaymentQrFile(null);
                            setConfirmState(null);
                            setFormError("");
                            await load();
                          } catch (error) {
                            setFormError(error instanceof Error ? error.message : "Unable to save subscriber payment details.");
                          }
                        },
                      });
                    }}
                  >
                    Save payment setup
                  </button>
                </div>
                </div>
              </>
            ) : null}
            {activeTab === "whatsapp" ? (
              <>
                <HelperText>
                  Control the shared-platform WhatsApp reminder setup and the message this subscriber sends.
                </HelperText>
                <div className="settings-panel settings-panel-wide">
                  <div className="settings-panel-header">
                    <div>
                      <p className="eyebrow">Notifications</p>
                      <h4>WhatsApp payment reminders</h4>
                    </div>
                    <span className={`status-pill ${invoiceSettings.whatsAppReady ? "status-pill-active" : "status-pill-inactive"}`}>
                      {invoiceSettings.whatsAppReady ? "Ready" : "Not ready"}
                    </span>
                  </div>
                  {!configurableWhatsAppEnabled ? (
                    <div className="settings-feature-lock-card">
                      <p className="eyebrow">Upgrade required</p>
                      <strong>{configurableWhatsAppHint ? `Available on ${configurableWhatsAppHint.packageName} and above.` : "Available on a higher package."}</strong>
                      <p className="muted">This subscriber can view the WhatsApp setup, but editing and enabling WhatsApp reminders requires a higher package.</p>
                    </div>
                  ) : null}
                  <div className={`settings-numbering-workspace ${!configurableWhatsAppEnabled ? "settings-disabled-workspace" : ""}`}>
                    <section className="settings-subpanel settings-numbering-card">
                      <div className="settings-subpanel-header">
                        <div>
                          <p className="eyebrow">Usage</p>
                          <strong>Quota and readiness</strong>
                        </div>
                      </div>
                      <div className="settings-overview-grid">
                        <div className="settings-overview-stat">
                          <span className="settings-stat-label">This month</span>
                          <strong>{invoiceSettings.whatsAppMonthlySent}</strong>
                        </div>
                        <div className="settings-overview-stat">
                          <span className="settings-stat-label">Package cap</span>
                          <strong>{invoiceSettings.whatsAppMonthlyLimit}</strong>
                        </div>
                      </div>
                      <label className="checkbox-row settings-checkbox-row">
                        <input
                          type="checkbox"
                          disabled={!configurableWhatsAppEnabled}
                          checked={invoiceSettings.whatsAppEnabled}
                          onChange={(event) => setInvoiceSettings((current) => current ? { ...current, whatsAppEnabled: event.target.checked } : current)}
                        />
                        <span>Enable WhatsApp reminders for this company</span>
                      </label>
                    </section>
                    <section className="settings-subpanel settings-numbering-card">
                      <div className="settings-subpanel-header">
                        <div>
                          <p className="eyebrow">Message</p>
                          <strong>Reminder template</strong>
                        </div>
                      </div>
                      <label className="form-label">
                        Copy message template
                        <textarea
                          className="text-input settings-message-template"
                          rows={10}
                          disabled={!configurableWhatsAppEnabled}
                          value={invoiceSettings.whatsAppTemplate ?? DEFAULT_WHATSAPP_TEMPLATE}
                          onChange={(event) => setInvoiceSettings((current) => current ? { ...current, whatsAppTemplate: event.target.value } : current)}
                          placeholder={DEFAULT_WHATSAPP_TEMPLATE}
                        />
                      </label>
                      <HelperText>
                        Available placeholders: {"{CustomerName}"}, {"{CompanyName}"}, {"{InvoiceNumber}"}, {"{AmountDue}"}, {"{Currency}"}, {"{DueDate}"}, {"{ActionLink}"}, {"{PaymentGatewayLink}"}, {"{PaymentConfirmationLink}"}.
                      </HelperText>
                    </section>
                  </div>
                  <HelperText>
                    Customer phone numbers come from the customer record. The platform owner manages the shared API connection. Use {"{ActionLink}"} for the best available link, {"{PaymentGatewayLink}"} only for online gateway checkout, and {"{PaymentConfirmationLink}"} for manual payment proof submission. Existing {"{PaymentLink}"} still works as a legacy alias for {"{ActionLink}"}.
                  </HelperText>
                  <div className="settings-action-row">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={!configurableWhatsAppEnabled}
                      onClick={() => setInvoiceSettings((current) => current ? { ...current, whatsAppTemplate: DEFAULT_WHATSAPP_TEMPLATE } : current)}
                    >
                      Reset to default message
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={!whatsAppDirty || !configurableWhatsAppEnabled}
                      onClick={() => setConfirmState({
                        title: "Save WhatsApp reminder settings",
                        description: "Save the WhatsApp reminder configuration for this company?",
                        action: async () => {
                          if (!invoiceSettings) {
                            return;
                          }

                          try {
                            await saveInvoiceSettings(invoiceSettings);
                            setConfirmState(null);
                            setFormError("");
                            await load();
                          } catch (error) {
                            setFormError(error instanceof Error ? error.message : "Unable to save WhatsApp settings.");
                          }
                        },
                      })}
                    >
                      Save WhatsApp setup
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {activeTab === "reminders" ? (
              featureAccess?.featureKeys.includes("dunning_workflows") ? (
                <div className="settings-panel settings-panel-wide">
                  <div className="settings-panel-header">
                    <div>
                      <p className="eyebrow">Follow-up</p>
                      <h4>Payment reminder schedule</h4>
                    </div>
                  </div>
                  <HelperText>These rules are based on the invoice due date and only apply to unpaid invoices.</HelperText>
                  <div className="settings-reminder-list">
                    {rules.map((rule, index) => (
                      <div className="settings-reminder-row" key={rule.id}>
                        <label className="form-label">
                          Reminder label
                          <input className="text-input" value={rule.name} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                        </label>
                        <div className="settings-reminder-row-actions">
                          <label className="form-label">
                            Send after due date (days)
                            <input className="text-input" value={String(rule.offsetDays)} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, offsetDays: Number(event.target.value) } : item))} />
                          </label>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={rules.length <= 1}
                            onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="settings-action-row">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setRules((current) => [...current, { id: crypto.randomUUID(), name: "New reminder", offsetDays: 14, isActive: true }])}
                    >
                      Add rule
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => setConfirmState({
                        title: "Save payment reminders",
                        description: "Save the current payment reminder schedule?",
                        action: async () => {
                          await api.put(`/settings/dunning-rules?companyId=${selectedCompanyId}`, { rules: rules.map((rule) => ({ name: rule.name, offsetDays: rule.offsetDays, isActive: rule.isActive })) });
                          setConfirmState(null);
                          await load();
                        },
                      })}
                    >
                      Save rules
                    </button>
                  </div>
                </div>
              ) : (
                <HelperText>Your current package does not include payment reminder workflows.</HelperText>
              )
            ) : null}
          </div>
        ) : null}
      </section>
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
