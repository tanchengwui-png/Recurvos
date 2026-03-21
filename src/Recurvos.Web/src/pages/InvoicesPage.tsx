import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { BillingReadiness, CompanyInvoiceSettings, FeatureAccess, Invoice, InvoiceWhatsAppLinkOptions, PaymentConfirmationLink, PlatformUploadPolicy } from "../types";

const DEFAULT_WHATSAPP_TEMPLATE = [
  "Hi {CustomerName},",
  "",
  "This is a friendly reminder from {CompanyName}.",
  "Invoice {InvoiceNumber} for {AmountDue} is due on {DueDate}.",
  "Payment link: {ActionLink}",
  "",
  "If payment has already been made, please ignore this message. Thank you.",
].join("\n");

export function InvoicesPage() {
  const navigate = useNavigate();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const paymentFormRef = useRef<HTMLDivElement | null>(null);
  const creditNoteFormRef = useRef<HTMLDivElement | null>(null);
  const reversePaymentFormRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Invoice[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ invoiceId: string; amount: string; method: string; reference: string; paidAtUtc: string; proofFile: File | null; useFullBalance: boolean } | null>(null);
  const [creditNoteForm, setCreditNoteForm] = useState<{ invoiceId: string; reason: string; issuedAtUtc: string; lines: { invoiceLineId?: string | null; description: string; quantity: string; unitAmount: string; taxAmount: string }[] } | null>(null);
  const [reversePaymentForm, setReversePaymentForm] = useState<{ invoiceId: string; invoiceNumber: string; reason: string } | null>(null);
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const pagination = useClientPagination(items, [items.length], 20);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, expandedId, pagination.currentPage, pagination.pageSize]);

  async function load() {
    const [invoiceList, readiness, settings, policy, access] = await Promise.all([
      api.get<Invoice[]>("/invoices"),
      api.get<BillingReadiness>("/settings/billing-readiness"),
      api.get<CompanyInvoiceSettings>("/settings/invoice-settings"),
      api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
    ]);
    setItems(invoiceList);
    setBillingReadiness(readiness);
    setInvoiceSettings(settings);
    setUploadPolicy(policy);
    setFeatureAccess(access);
  }

  function getFeatureHint(featureKey: string) {
    const requirement = featureAccess?.featureRequirements?.find((item) => item.featureKey === featureKey);
    return requirement ? `Available on ${requirement.packageName}` : "Upgrade required";
  }

  function getInvoiceSendSummary(item: Invoice) {
    const sendCount = item.history.filter((entry) => entry.action === "invoice.sent" || entry.action === "invoice.auto-sent").length;
    if (sendCount === 0) {
      return null;
    }

    return sendCount === 1 ? "Sent" : `Sent x${sendCount}`;
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (paymentForm) {
      paymentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [paymentForm]);

  useEffect(() => {
    if (creditNoteForm) {
      creditNoteFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [creditNoteForm]);

  useEffect(() => {
    if (reversePaymentForm) {
      reversePaymentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [reversePaymentForm]);

  async function downloadPdf(id: string, invoiceNumber: string) {
    const file = await api.download(`/invoices/${id}/download`);
    const objectUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.fileName ?? `${invoiceNumber}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function downloadReceipt(id: string, invoiceNumber: string) {
    const file = await api.download(`/invoices/${id}/receipt`);
    const objectUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.fileName ?? `${invoiceNumber}-receipt.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function copyToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "true");
    textArea.style.position = "absolute";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }

  function buildWhatsAppInvoiceMessage(invoice: Invoice, links?: InvoiceWhatsAppLinkOptions | null) {
    const companyName = getAuth()?.companyName ?? "our team";
    const amountDue = formatCurrency(invoice.balanceAmount, invoice.currency);
    const template = (invoiceSettings?.whatsAppTemplate ?? "").trim() || DEFAULT_WHATSAPP_TEMPLATE;
    const dueDate = new Date(invoice.dueDateUtc).toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const actionLink = links?.actionLink ?? "";
    const paymentGatewayLink = links?.paymentGatewayLink ?? "";
    const paymentConfirmationLink = links?.paymentConfirmationLink ?? "";
    const replacements = new Map<string, string>([
      ["{CustomerName}", invoice.customerName],
      ["{CompanyName}", companyName],
      ["{InvoiceNumber}", invoice.invoiceNumber],
      ["{AmountDue}", amountDue],
      ["{Currency}", invoice.currency],
      ["{DueDate}", dueDate],
      ["{ActionLink}", actionLink],
      ["{PaymentGatewayLink}", paymentGatewayLink],
      ["{PaymentConfirmationLink}", paymentConfirmationLink],
      ["{PaymentLink}", actionLink],
    ]);

    let message = template;
    replacements.forEach((value, token) => {
      message = message.replaceAll(token, value);
    });

    if (!actionLink) {
      message = message
        .replace(/^.*payment\s*\/\s*confirmation link:.*$/gim, "")
        .replace(/^.*payment link:.*$/gim, "")
        .replace(/^.*action link:.*$/gim, "");
    }

    if (!paymentGatewayLink) {
      message = message.replace(/^.*payment gateway link:.*$/gim, "");
    }

    if (!paymentConfirmationLink) {
      message = message.replace(/^.*payment confirmation link:.*$/gim, "");
    }

    return message
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  async function getWhatsAppLinks(invoice: Invoice) {
    if (invoice.balanceAmount <= 0) {
      return null;
    }

    return await api.get<InvoiceWhatsAppLinkOptions>(`/invoices/${invoice.id}/whatsapp-links`);
  }

  function normalizePhoneNumberForWa(phoneNumber?: string | null) {
    if (!phoneNumber) {
      return null;
    }

    let normalized = phoneNumber.replace(/[^\d+]/g, "");
    if (!normalized) {
      return null;
    }

    if (normalized.startsWith("+")) {
      normalized = normalized.slice(1);
    } else if (normalized.startsWith("00")) {
      normalized = normalized.slice(2);
    } else if (normalized.startsWith("0")) {
      normalized = `60${normalized.slice(1)}`;
    }

    return normalized || null;
  }

  async function buildWhatsAppBrowserLink(invoice: Invoice) {
    const normalizedPhoneNumber = normalizePhoneNumberForWa(invoice.customerPhoneNumber);
    if (!normalizedPhoneNumber) {
      throw new Error(`No customer phone number is saved for ${invoice.customerName}.`);
    }

    const links = await getWhatsAppLinks(invoice);
    const message = buildWhatsAppInvoiceMessage(invoice, links);
    return `https://wa.me/${normalizedPhoneNumber}?text=${encodeURIComponent(message)}`;
  }

  async function copyWhatsAppMessage(invoice: Invoice) {
    try {
      setFormError("");
      setSuccessMessage("");

      const links = await getWhatsAppLinks(invoice);
      const message = buildWhatsAppInvoiceMessage(invoice, links);
      await copyToClipboard(message);
      setSuccessMessage(`WhatsApp message copied for invoice ${invoice.invoiceNumber}.`);
    } catch (error) {
      setSuccessMessage("");
      setFormError(error instanceof Error ? error.message : "Unable to copy WhatsApp message.");
    }
  }

  async function copyWhatsAppBrowserLink(invoice: Invoice) {
    try {
      setFormError("");
      setSuccessMessage("");
      const url = await buildWhatsAppBrowserLink(invoice);
      await copyToClipboard(url);
      setSuccessMessage(`WhatsApp browser link copied for invoice ${invoice.invoiceNumber}.`);
    } catch (error) {
      setSuccessMessage("");
      setFormError(error instanceof Error ? error.message : "Unable to copy WhatsApp browser link.");
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Invoice engine</p>
          <h2>Invoices</h2>
          <p className="muted">Track balance, billing period, source, payment actions, and invoice history.</p>
        </div>
      </header>

      {successMessage ? <HelperText>{successMessage}</HelperText> : null}
      {formError ? <HelperText tone="error">{formError}</HelperText> : null}
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Complete the company billing profile before creating or sending invoices: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}

      <section className="card">
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
          <table className="catalog-table invoice-table">
            <thead>
              <tr>
                <th className="sticky-cell sticky-cell-left">Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Source</th>
                <th>Period</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pagedItems.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td className="sticky-cell sticky-cell-left invoice-primary-cell">
                      <div className="invoice-primary-cell-inner">
                        <div>
                          <span className="table-primary-title">{item.invoiceNumber}</span>
                          {getInvoiceSendSummary(item) ? (
                            <div className="table-meta">
                              <span className="table-meta-item">
                                <span className="table-meta-dot table-meta-dot-active" />
                                {getInvoiceSendSummary(item)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <RowActionMenu
                          items={[
                            {
                              label: expandedId === item.id ? "Hide details" : "View details",
                              onClick: () => setExpandedId((current) => current === item.id ? null : item.id),
                            },
                            {
                              label: "Send invoice",
                              disabled: !billingReadiness?.isReady,
                              onClick: () => setConfirmState({
                                title: "Send invoice",
                                description: `Send invoice ${item.invoiceNumber} to ${item.customerName}?`,
                                action: async () => {
                                  try {
                                    setFormError("");
                                    await api.post(`/invoices/${item.id}/send`);
                                    setSuccessMessage(`Invoice ${item.invoiceNumber} was sent to ${item.customerName}.`);
                                    setConfirmState(null);
                                    await load();
                                  } catch (error) {
                                    setSuccessMessage("");
                                    setConfirmState(null);
                                    setFormError(error instanceof Error ? error.message : "Unable to send invoice.");
                                  }
                                },
                              }),
                            },
                            {
                              label: "Record payment",
                              onClick: () => {
                                setReversePaymentForm(null);
                                setCreditNoteForm(null);
                                setPaymentForm({
                                  invoiceId: item.id,
                                  amount: String(item.balanceAmount),
                                  method: "Bank transfer",
                                  reference: "",
                                  paidAtUtc: new Date().toISOString().slice(0, 10),
                                  proofFile: null,
                                  useFullBalance: true,
                                });
                              },
                            },
                            {
                              label: item.balanceAmount > 0 && item.history.some((entry) => entry.action === "payment.link.created") ? "Refresh payment link" : "Generate payment link",
                              disabled: !featureAccess?.featureKeys.includes("payment_link_generation") || !invoiceSettings?.paymentGatewayReady || item.balanceAmount <= 0,
                              title: item.balanceAmount <= 0
                                ? "This invoice has no outstanding balance."
                                : !featureAccess?.featureKeys.includes("payment_link_generation")
                                  ? getFeatureHint("payment_link_generation")
                                  : !invoiceSettings?.paymentGatewayReady
                                    ? "Set up a payment gateway in Settings > Payment first."
                                    : undefined,
                              onClick: async () => {
                                try {
                                  setFormError("");
                                  setSuccessMessage("");
                                  const payment = await api.post<{ paymentLinkUrl?: string | null }>(`/payments/invoice/${item.id}/link`);
                                  if (!payment.paymentLinkUrl) {
                                    throw new Error("Payment link could not be generated.");
                                  }

                                  setSuccessMessage(`Payment link is ready for invoice ${item.invoiceNumber}.`);
                                  await load();
                                } catch (error) {
                                  setSuccessMessage("");
                                  setFormError(error instanceof Error ? error.message : "Unable to generate payment link.");
                                }
                              },
                            },
                            {
                              label: "Copy payment link",
                              disabled: !featureAccess?.featureKeys.includes("payment_link_generation") || !invoiceSettings?.paymentGatewayReady || item.balanceAmount <= 0,
                              title: item.balanceAmount <= 0
                                ? "This invoice has no outstanding balance."
                                : !featureAccess?.featureKeys.includes("payment_link_generation")
                                  ? getFeatureHint("payment_link_generation")
                                  : !invoiceSettings?.paymentGatewayReady
                                    ? "Set up a payment gateway in Settings > Payment first."
                                    : undefined,
                              onClick: async () => {
                                try {
                                  setFormError("");
                                  const payment = await api.post<{ paymentLinkUrl?: string | null }>(`/payments/invoice/${item.id}/link`);
                                  if (!payment.paymentLinkUrl) {
                                    throw new Error("Payment link is not available.");
                                  }

                                  await copyToClipboard(payment.paymentLinkUrl);
                                  setSuccessMessage(`Payment link copied for invoice ${item.invoiceNumber}.`);
                                } catch (error) {
                                  setSuccessMessage("");
                                  setFormError(error instanceof Error ? error.message : "Unable to copy payment link.");
                                }
                              },
                            },
                            {
                              label: "Copy payment confirmation URL",
                              disabled: !featureAccess?.featureKeys.includes("public_payment_confirmation"),
                              title: !featureAccess?.featureKeys.includes("public_payment_confirmation") ? getFeatureHint("public_payment_confirmation") : undefined,
                              onClick: async () => {
                                try {
                                  const link = await api.post<PaymentConfirmationLink>(`/payment-confirmations/invoices/${item.id}/link`);
                                  if (navigator.clipboard?.writeText) {
                                    await navigator.clipboard.writeText(link.url);
                                    setSuccessMessage(`Payment confirmation URL copied for invoice ${item.invoiceNumber}.`);
                                  } else {
                                    setSuccessMessage(`Payment confirmation URL: ${link.url}`);
                                  }
                                } catch (error) {
                                  setSuccessMessage("");
                                  setFormError(error instanceof Error ? error.message : "Unable to create payment confirmation link.");
                                }
                              },
                            },
                            {
                              label: "Copy WhatsApp message",
                              disabled: !featureAccess?.featureKeys.includes("whatsapp_copy_message"),
                              title: !featureAccess?.featureKeys.includes("whatsapp_copy_message") ? getFeatureHint("whatsapp_copy_message") : undefined,
                              onClick: () => void copyWhatsAppMessage(item),
                            },
                            {
                              label: "Copy WhatsApp browser link",
                              disabled: !featureAccess?.featureKeys.includes("whatsapp_browser_link"),
                              title: !featureAccess?.featureKeys.includes("whatsapp_browser_link") ? getFeatureHint("whatsapp_browser_link") : undefined,
                              onClick: () => void copyWhatsAppBrowserLink(item),
                            },
                            {
                              label: "Issue credit note",
                              disabled: item.status === "Open" || item.paidAmount <= 0,
                              title: item.status === "Open" || item.paidAmount <= 0
                                ? "Credit notes are only available after payment. Use void for unpaid invoices."
                                : undefined,
                              onClick: () => {
                                setReversePaymentForm(null);
                                setPaymentForm(null);
                                setCreditNoteForm({
                                  invoiceId: item.id,
                                  reason: "",
                                  issuedAtUtc: new Date().toISOString().slice(0, 10),
                                  lines: item.lineItems.map((line) => ({
                                    description: line.description,
                                    quantity: String(line.quantity),
                                    unitAmount: String(line.unitAmount),
                                    taxAmount: "0",
                                  })),
                                });
                              },
                            },
                            ...(item.paidAmount > 0 ? [{
                              label: "Reverse payment",
                              onClick: () => {
                                setPaymentForm(null);
                                setCreditNoteForm(null);
                                setReversePaymentForm({
                                  invoiceId: item.id,
                                  invoiceNumber: item.invoiceNumber,
                                  reason: "",
                                });
                              },
                            }, {
                              label: "Download receipt",
                              onClick: () => void downloadReceipt(item.id, item.invoiceNumber),
                            }] : []),
                            { label: "Download PDF", onClick: () => void downloadPdf(item.id, item.invoiceNumber) },
                            {
                              label: "Void invoice",
                              tone: "danger",
                              disabled: item.paidAmount > 0 || item.creditNotes.some((note) => note.status === "Issued"),
                              title: item.paidAmount > 0
                                ? "Paid invoices cannot be voided."
                                : item.creditNotes.some((note) => note.status === "Issued")
                                  ? "Invoices with issued credit notes cannot be voided."
                                  : undefined,
                              onClick: () => setConfirmState({
                                title: "Void invoice",
                                description: `Void invoice ${item.invoiceNumber}?`,
                                action: async () => {
                                  try {
                                    await api.post(`/invoices/${item.id}/cancel`);
                                    setConfirmState(null);
                                    await load();
                                  } catch (error) {
                                    setConfirmState(null);
                                    setFormError(error instanceof Error ? error.message : "Unable to void invoice.");
                                  }
                                },
                              }),
                            },
                          ]}
                        />
                      </div>
                    </td>
                    <td>{item.customerName}</td>
                    <td>
                      <span className={`status-pill ${item.statusLabel === "Paid" ? "status-pill-active" : "status-pill-inactive"}`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td>{item.sourceType}</td>
                    <td>{item.periodStartUtc && item.periodEndUtc ? `${new Date(item.periodStartUtc).toLocaleDateString()} - ${new Date(item.periodEndUtc).toLocaleDateString()}` : "-"}</td>
                    <td>{formatCurrency(item.total, item.currency)}</td>
                    <td>{formatCurrency(item.paidAmount, item.currency)}</td>
                    <td>{formatCurrency(item.balanceAmount, item.currency)}</td>
                    <td>{new Date(item.dueDateUtc).toLocaleDateString()}</td>
                  </tr>
                  {expandedId === item.id ? (
                    <tr>
                      <td colSpan={9} className="subscription-details-cell">
                        <div className="invoice-detail-panel">
                          <div className="invoice-detail-summary">
                            <div className="invoice-detail-stat">
                              <p className="eyebrow">Invoice</p>
                              <p>{item.invoiceNumber}</p>
                            </div>
                            <div className="invoice-detail-stat">
                              <p className="eyebrow">Issue Date</p>
                              <p>{new Date(item.issueDateUtc).toLocaleString()}</p>
                            </div>
                            <div className="invoice-detail-stat">
                              <p className="eyebrow">Due Date</p>
                              <p>{new Date(item.dueDateUtc).toLocaleString()}</p>
                            </div>
                            <div className="invoice-detail-stat">
                              <p className="eyebrow">Source</p>
                              <p>{item.sourceType}</p>
                            </div>
                          </div>

                          <div className="invoice-detail-block">
                            <div className="invoice-detail-block-header">
                              <p className="eyebrow">Line Items</p>
                            </div>
                            <div className="invoice-detail-list">
                              {item.lineItems.map((line) => (
                                <div key={`${line.description}-${line.totalAmount}`} className="invoice-detail-list-row">
                                  <span>{`${line.description} x${line.quantity}`}</span>
                                  <strong>{formatCurrency(line.totalAmount, item.currency)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="invoice-detail-secondary-grid">
                            <div className="invoice-detail-block">
                              <div className="invoice-detail-block-header">
                                <p className="eyebrow">History</p>
                              </div>
                              <div className="invoice-detail-list">
                                {item.history.length > 0 ? item.history.map((entry) => (
                                  <div key={`${entry.createdAtUtc}-${entry.action}`} className="invoice-detail-list-row">
                                    <span>{entry.action}</span>
                                    <span className="muted">{new Date(entry.createdAtUtc).toLocaleString()}</span>
                                  </div>
                                )) : <p className="muted">No invoice history yet.</p>}
                              </div>
                            </div>

                            <div className="invoice-detail-block">
                              <div className="invoice-detail-block-header">
                                <p className="eyebrow">Credit Notes</p>
                              </div>
                              <div className="invoice-detail-list">
                                {item.creditNotes.length > 0 ? item.creditNotes.map((note) => (
                                  <div key={note.id} className="invoice-detail-list-row">
                                    <span>{`${formatCurrency(note.totalReduction, note.currency)} | ${note.reason}`}</span>
                                    <span className="muted">{note.status}</span>
                                  </div>
                                )) : <p className="muted">No credit notes issued.</p>}
                              </div>
                            </div>

                            <div className="invoice-detail-block">
                              <div className="invoice-detail-block-header">
                                <p className="eyebrow">Linked Refunds</p>
                              </div>
                              <div className="invoice-detail-list">
                                {item.refunds.length > 0 ? item.refunds.map((refund) => (
                                  <div key={refund.id} className="invoice-detail-list-row">
                                    <span>{`${formatCurrency(refund.amount, refund.currency)} | ${refund.reason}`}</span>
                                    <span className="muted">{new Date(refund.createdAtUtc).toLocaleDateString()}</span>
                                  </div>
                                )) : <p className="muted">No refunds linked to this invoice.</p>}
                              </div>
                            </div>
                            <div className="invoice-detail-block">
                              <div className="invoice-detail-block-header">
                                <p className="eyebrow">Online payment</p>
                              </div>
                              <div className="invoice-detail-list">
                                {item.history.some((entry) => entry.action === "payment.link.created") ? (
                                  <div className="invoice-detail-list-row">
                                    <span>Payment link generated</span>
                                    <strong>Ready</strong>
                                  </div>
                                ) : (
                                  <div className="invoice-detail-list-row">
                                    <span>No payment link generated yet</span>
                                    <strong>-</strong>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
            </table>
          {items.length === 0 ? (
            <div className="empty-state">
              <h3>No invoices yet</h3>
              <p className="muted">Wait for subscription renewals to generate invoices automatically, or use invoice actions here once records exist.</p>
              <div className="empty-state-actions">
                <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
              </div>
            </div>
          ) : null}
        </div>
        <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
          <div ref={bottomInnerRef} />
        </div>
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />

        {paymentForm ? (
          <div ref={paymentFormRef} className="form-stack invoice-inline-panel" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Record payment</p>
            <HelperText>Record the payment here. Upload proof if the customer sent a transfer slip, receipt, or remittance advice.</HelperText>
            <div className="invoice-payment-grid">
              <label className="form-label">
                Amount
                <input
                  className="text-input"
                  value={paymentForm.amount}
                  disabled={paymentForm.useFullBalance}
                  onChange={(event) => setPaymentForm((current) => current ? { ...current, amount: event.target.value } : current)}
                />
              </label>
              <label className="form-label">
                Method
                <select value={paymentForm.method} onChange={(event) => setPaymentForm((current) => current ? { ...current, method: event.target.value } : current)}>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Gateway">Gateway</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>
            <div className="invoice-payment-grid">
              <label className="form-label">
                Reference
                <input className="text-input" value={paymentForm.reference} onChange={(event) => setPaymentForm((current) => current ? { ...current, reference: event.target.value } : current)} />
              </label>
              <label className="form-label">
                Paid date
                <input className="text-input" type="date" value={paymentForm.paidAtUtc} onChange={(event) => setPaymentForm((current) => current ? { ...current, paidAtUtc: event.target.value } : current)} />
              </label>
            </div>
            <label className="form-label">
              Payment proof
              <input
                className="text-input"
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) {
                    setPaymentForm((current) => current ? { ...current, proofFile: null } : current);
                    return;
                  }

                  void (async () => {
                    try {
                      const prepared = await prepareImageUpload(file, uploadPolicy);
                      setFormError("");
                      setPaymentForm((current) => current ? { ...current, proofFile: prepared } : current);
                    } catch (uploadError) {
                      setFormError(uploadError instanceof Error ? uploadError.message : `Proof upload must be ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} or smaller.`);
                      event.target.value = "";
                      setPaymentForm((current) => current ? { ...current, proofFile: null } : current);
                    }
                  })();
                }}
              />
            </label>
            <HelperText>{`PNG, JPG, JPEG, and WEBP images up to ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} are allowed.${uploadPolicy.autoCompressUploads ? " Large images are compressed automatically before upload." : ""}`}</HelperText>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={paymentForm.useFullBalance}
                onChange={(event) => setPaymentForm((current) => {
                  if (!current) {
                    return current;
                  }

                  const invoice = items.find((item) => item.id === current.invoiceId);
                  return {
                    ...current,
                    useFullBalance: event.target.checked,
                    amount: event.target.checked ? String(invoice?.balanceAmount ?? current.amount) : current.amount,
                  };
                })}
              />
              <span>Use full outstanding balance</span>
            </label>
            <div className="button-stack">
              <button type="button" className="button button-primary" onClick={() => setConfirmState({
                title: "Record payment",
                description: "Record this payment against the invoice balance?",
                action: async () => {
                  if (!paymentForm) {
                    return;
                  }

                  try {
                    const formData = new FormData();
                    formData.append("amount", paymentForm.amount);
                    formData.append("method", paymentForm.method);
                    formData.append("reference", paymentForm.reference || "");
                    formData.append("paidAtUtc", new Date(paymentForm.paidAtUtc).toISOString());
                    if (paymentForm.proofFile) {
                      formData.append("proofFile", paymentForm.proofFile);
                    }

                    await api.postForm(`/invoices/${paymentForm.invoiceId}/record-payment-with-proof`, formData);
                    setConfirmState(null);
                    setPaymentForm(null);
                    await load();
                  } catch (error) {
                    setConfirmState(null);
                    setFormError(error instanceof Error ? error.message : "Unable to record payment.");
                  }
                },
              })}>Save payment</button>
              <button type="button" className="button button-secondary" onClick={() => setPaymentForm(null)}>Close</button>
            </div>
          </div>
        ) : null}
        {creditNoteForm ? (
          <div ref={creditNoteFormRef} className="form-stack" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Issue credit note</p>
            <HelperText>Eligible amount is capped by the invoice total minus previously issued credit notes.</HelperText>
            <label className="form-label">
              Reason
              <input className="text-input" value={creditNoteForm.reason} onChange={(event) => setCreditNoteForm((current) => current ? { ...current, reason: event.target.value } : current)} />
            </label>
            <label className="form-label">
              Issued date
              <input className="text-input" type="date" value={creditNoteForm.issuedAtUtc} onChange={(event) => setCreditNoteForm((current) => current ? { ...current, issuedAtUtc: event.target.value } : current)} />
            </label>
            {creditNoteForm.lines.map((line, index) => (
              <div key={index} className="inline-fields">
                <label className="form-label">
                  Description
                  <input className="text-input" value={line.description} onChange={(event) => setCreditNoteForm((current) => current ? {
                    ...current,
                    lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, description: event.target.value } : entry),
                  } : current)} />
                </label>
                <label className="form-label">
                  Qty
                  <input className="text-input" value={line.quantity} onChange={(event) => setCreditNoteForm((current) => current ? {
                    ...current,
                    lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry),
                  } : current)} />
                </label>
                <label className="form-label">
                  Unit
                  <input className="text-input" value={line.unitAmount} onChange={(event) => setCreditNoteForm((current) => current ? {
                    ...current,
                    lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, unitAmount: event.target.value } : entry),
                  } : current)} />
                </label>
                <label className="form-label">
                  Tax
                  <input className="text-input" value={line.taxAmount} onChange={(event) => setCreditNoteForm((current) => current ? {
                    ...current,
                    lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, taxAmount: event.target.value } : entry),
                  } : current)} />
                </label>
              </div>
            ))}
            <div className="button-stack">
              <button type="button" className="button button-primary" onClick={() => setConfirmState({
                title: "Issue credit note",
                description: "Issue this credit note against the invoice?",
                action: async () => {
                  if (!creditNoteForm) {
                    return;
                  }

                  try {
                    await api.post("/credit-notes", {
                      invoiceId: creditNoteForm.invoiceId,
                      reason: creditNoteForm.reason,
                      issuedAtUtc: new Date(creditNoteForm.issuedAtUtc).toISOString(),
                      lines: creditNoteForm.lines.map((line) => ({
                        invoiceLineId: line.invoiceLineId ?? null,
                        description: line.description,
                        quantity: Number(line.quantity),
                        unitAmount: Number(line.unitAmount),
                        taxAmount: Number(line.taxAmount),
                      })),
                    });
                    setConfirmState(null);
                    setCreditNoteForm(null);
                    await load();
                  } catch (error) {
                    setConfirmState(null);
                    setFormError(error instanceof Error ? error.message : "Unable to issue credit note.");
                  }
                },
              })}>Issue credit note</button>
              <button type="button" className="button button-secondary" onClick={() => setCreditNoteForm(null)}>Close</button>
            </div>
          </div>
        ) : null}
        {reversePaymentForm ? (
          <div ref={reversePaymentFormRef} className="form-stack invoice-inline-panel" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Reverse payment</p>
            <HelperText>Use this only for manual payment mistakes. Gateway-paid invoices should be corrected with refunds.</HelperText>
            <label className="form-label">
              Reason
              <input
                className="text-input"
                value={reversePaymentForm.reason}
                onChange={(event) => setReversePaymentForm((current) => current ? { ...current, reason: event.target.value } : current)}
              />
            </label>
            <div className="button-stack">
              <button type="button" className="button button-primary" onClick={() => setConfirmState({
                title: "Reverse payment",
                description: `Reverse the latest manual payment on invoice ${reversePaymentForm.invoiceNumber}?`,
                action: async () => {
                  if (!reversePaymentForm) {
                    return;
                  }

                  try {
                    await api.post(`/invoices/${reversePaymentForm.invoiceId}/reverse-payment`, {
                      reason: reversePaymentForm.reason,
                    });
                    setConfirmState(null);
                    setReversePaymentForm(null);
                    setSuccessMessage(`The latest manual payment on invoice ${reversePaymentForm.invoiceNumber} was reversed.`);
                    await load();
                  } catch (error) {
                    setConfirmState(null);
                    setSuccessMessage("");
                    setFormError(error instanceof Error ? error.message : "Unable to reverse payment.");
                  }
                },
              })}>Reverse payment</button>
              <button type="button" className="button button-secondary" onClick={() => setReversePaymentForm(null)}>Close</button>
            </div>
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
