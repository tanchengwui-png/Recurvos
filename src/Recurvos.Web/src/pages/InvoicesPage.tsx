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
import { getAuth } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { BillingReadiness, CompanyInvoiceSettings, FeatureAccess, Invoice, InvoiceWhatsAppLinkOptions, Payment, PaymentConfirmationLink, PlatformUploadPolicy } from "../types";

const DEFAULT_WHATSAPP_TEMPLATE = [
  "Hi {CustomerName},",
  "",
  "This is a friendly reminder from {CompanyName}.",
  "Invoice {InvoiceNumber} for {AmountDue} is due on {DueDate}.",
  "Payment link: {ActionLink}",
  "",
  "If payment has already been made, please ignore this message. Thank you.",
].join("\n");

type InvoiceSortColumn = "invoice" | "customer" | "status" | "source" | "period" | "total" | "paid" | "balance" | "due";
type InvoiceSortState = { column: InvoiceSortColumn; direction: "asc" | "desc" } | null;

function compareInvoices(left: Invoice, right: Invoice, sortState: InvoiceSortState) {
  if (!sortState) {
    return 0;
  }

  const direction = sortState.direction === "asc" ? 1 : -1;
  const compareText = (leftValue?: string | null, rightValue?: string | null) =>
    (leftValue ?? "").localeCompare(rightValue ?? "", undefined, { numeric: true, sensitivity: "base" });
  const compareNumber = (leftValue?: number | null, rightValue?: number | null) => (leftValue ?? 0) - (rightValue ?? 0);
  const compareDate = (leftValue?: string | null, rightValue?: string | null) =>
    new Date(leftValue ?? 0).getTime() - new Date(rightValue ?? 0).getTime();

  let result = 0;
  switch (sortState.column) {
    case "invoice":
      result = compareText(left.invoiceNumber, right.invoiceNumber);
      break;
    case "customer":
      result = compareText(left.customerName, right.customerName);
      break;
    case "status":
      result = compareText(left.statusLabel, right.statusLabel);
      break;
    case "source":
      result = compareText(left.sourceType, right.sourceType);
      break;
    case "period":
      result = compareDate(left.periodStartUtc, right.periodStartUtc);
      break;
    case "total":
      result = compareNumber(left.total, right.total);
      break;
    case "paid":
      result = compareNumber(left.paidAmount, right.paidAmount);
      break;
    case "balance":
      result = compareNumber(left.balanceAmount, right.balanceAmount);
      break;
    case "due":
      result = compareDate(left.dueDateUtc, right.dueDateUtc);
      break;
  }

  if (result !== 0) {
    return result * direction;
  }

  return compareText(left.invoiceNumber, right.invoiceNumber) * direction;
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const paymentFormRef = useRef<HTMLDivElement | null>(null);
  const creditNoteFormRef = useRef<HTMLDivElement | null>(null);
  const adjustPaymentFormRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ invoiceId: string; amount: string; method: string; reference: string; paidAtUtc: string; proofFile: File | null; useFullBalance: boolean } | null>(null);
  const [creditNoteForm, setCreditNoteForm] = useState<{ invoiceId: string; invoiceNumber: string; customerName: string; currency: string; eligibleCreditAmount: number; reason: string; issuedAtUtc: string; description: string; amount: string } | null>(null);
  const [adjustPaymentForm, setAdjustPaymentForm] = useState<{ invoiceId: string; invoiceNumber: string; currency: string; invoiceTotal: number; paidAmount: number; mode: "reverse" | "refund"; selectedPaymentId: string; amount: string; reason: string } | null>(null);
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [sortState, setSortState] = useState<InvoiceSortState>(null);
  const sortedItems = [...items].sort((left, right) => compareInvoices(left, right, sortState));
  const pagination = useClientPagination(sortedItems, [sortedItems.length, sortState?.column, sortState?.direction], 20);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, expandedId, pagination.currentPage, pagination.pageSize]);

  async function load() {
    const [invoiceList, paymentList, readiness, settings, policy, access] = await Promise.all([
      api.get<Invoice[]>("/invoices"),
      api.get<Payment[]>("/payments").catch(() => []),
      api.get<BillingReadiness>("/settings/billing-readiness"),
      api.get<CompanyInvoiceSettings>("/settings/invoice-settings"),
      api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
    ]);
    setItems(invoiceList);
    setPayments(paymentList);
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
    if (adjustPaymentForm) {
      adjustPaymentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [adjustPaymentForm]);

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

  async function downloadCreditNote(id: string, creditNoteNumber: string) {
    const file = await api.download(`/credit-notes/${id}/download`);
    const objectUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.fileName ?? `${creditNoteNumber}.pdf`;
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

  function toggleSort(column: InvoiceSortColumn) {
    setSortState((current) => {
      if (!current || current.column !== column) {
        return { column, direction: "asc" };
      }

      return {
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  function renderSortHeader(label: string, column: InvoiceSortColumn, className?: string) {
    const isActive = sortState?.column === column;
    const icon = isActive ? (sortState?.direction === "asc" ? "▲" : "▼") : "↕";

    return (
      <th className={className} aria-sort={isActive ? (sortState?.direction === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className={`table-sort-button${isActive ? " table-sort-button-active" : ""}`}
          onClick={() => toggleSort(column)}
          aria-label={`Sort by ${label}`}
        >
          <span>{label}</span>
          <span className="table-sort-icon" aria-hidden="true">{icon}</span>
        </button>
      </th>
    );
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
                {renderSortHeader("Invoice", "invoice", "sticky-cell sticky-cell-left")}
                {renderSortHeader("Customer", "customer")}
                {renderSortHeader("Status", "status")}
                {renderSortHeader("Source", "source")}
                {renderSortHeader("Period", "period")}
                {renderSortHeader("Total", "total")}
                {renderSortHeader("Paid", "paid")}
                {renderSortHeader("Balance", "balance")}
                {renderSortHeader("Due", "due")}
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
                              disabled: !billingReadiness?.isReady || item.status === "Voided",
                              title: item.status === "Voided"
                                ? "Voided invoices cannot be sent."
                                : !billingReadiness?.isReady
                                  ? "Complete billing setup before sending invoices."
                                  : undefined,
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
                              disabled: item.status === "Voided" || item.balanceAmount <= 0,
                              title: item.status === "Voided"
                                ? "Voided invoices cannot receive payments."
                                : item.balanceAmount <= 0
                                  ? "This invoice is already fully paid."
                                  : undefined,
                              onClick: () => {
                                setAdjustPaymentForm(null);
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
                              disabled: item.status === "Voided" || item.balanceAmount <= 0 || !featureAccess?.featureKeys.includes("public_payment_confirmation"),
                              title: item.status === "Voided"
                                ? "Voided invoices cannot issue payment confirmation links."
                                : item.balanceAmount <= 0
                                  ? "This invoice is already fully paid."
                                : !featureAccess?.featureKeys.includes("public_payment_confirmation")
                                  ? getFeatureHint("public_payment_confirmation")
                                  : undefined,
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
                              disabled: item.status === "Voided" || item.balanceAmount <= 0 || !featureAccess?.featureKeys.includes("whatsapp_copy_message"),
                              title: item.status === "Voided"
                                ? "Voided invoices should not be shared for payment."
                                : item.balanceAmount <= 0
                                  ? "This invoice is already fully paid."
                                : !featureAccess?.featureKeys.includes("whatsapp_copy_message")
                                  ? getFeatureHint("whatsapp_copy_message")
                                  : undefined,
                              onClick: () => void copyWhatsAppMessage(item),
                            },
                            {
                              label: "Copy WhatsApp browser link",
                              disabled: item.status === "Voided" || item.balanceAmount <= 0 || !featureAccess?.featureKeys.includes("whatsapp_browser_link"),
                              title: item.status === "Voided"
                                ? "Voided invoices should not be shared for payment."
                                : item.balanceAmount <= 0
                                  ? "This invoice is already fully paid."
                                : !featureAccess?.featureKeys.includes("whatsapp_browser_link")
                                  ? getFeatureHint("whatsapp_browser_link")
                                  : undefined,
                              onClick: () => void copyWhatsAppBrowserLink(item),
                            },
                            {
                              label: "Issue credit note",
                              disabled: item.status === "Voided" || item.eligibleCreditAmount <= 0,
                              title: item.status === "Voided"
                                ? "Voided invoices cannot receive credit notes."
                                : item.eligibleCreditAmount <= 0
                                  ? "This invoice has no remaining eligible amount for a credit note."
                                  : undefined,
                              onClick: () => {
                                setAdjustPaymentForm(null);
                                setPaymentForm(null);
                                setCreditNoteForm({
                                  invoiceId: item.id,
                                  invoiceNumber: item.invoiceNumber,
                                  customerName: item.customerName,
                                  currency: item.currency,
                                  eligibleCreditAmount: item.eligibleCreditAmount,
                                  reason: "",
                                  issuedAtUtc: new Date().toISOString().slice(0, 10),
                                  description: `Credit note for invoice ${item.invoiceNumber}`,
                                  amount: "",
                                });
                              },
                            },
                            ...(item.paidAmount > 0 ? [{
                              label: "Adjust payment",
                              onClick: () => {
                                const refundablePayments = payments.filter((payment) =>
                                  payment.invoiceId === item.id
                                  && payment.status === "Succeeded"
                                  && payment.attempts.length === 0
                                  && payment.refundedAmount < payment.amount);
                                setPaymentForm(null);
                                setCreditNoteForm(null);
                                setAdjustPaymentForm({
                                  invoiceId: item.id,
                                  invoiceNumber: item.invoiceNumber,
                                  currency: item.currency,
                                  invoiceTotal: item.total,
                                  paidAmount: item.paidAmount,
                                  mode: "reverse",
                                  selectedPaymentId: refundablePayments[0]?.id ?? "",
                                  amount: "",
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
                              disabled: item.status === "Voided" || item.balanceAmount <= 0 || item.paidAmount > 0 || item.creditNotes.some((note) => note.status === "Issued"),
                              title: item.status === "Voided"
                                ? "This invoice is already voided."
                                : item.balanceAmount <= 0
                                  ? "Fully paid invoices cannot be voided."
                                : item.paidAmount > 0
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
                                    <span>{`${note.creditNoteNumber} | ${formatCurrency(note.totalReduction, note.currency)} | ${note.reason}`}</span>
                                    <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                                      <span className="muted">{note.status}</span>
                                      <button
                                        type="button"
                                        className="button button-secondary button-small"
                                        onClick={() => {
                                          void (async () => {
                                            try {
                                              setFormError("");
                                              await downloadCreditNote(note.id, note.creditNoteNumber);
                                            } catch (error) {
                                              setFormError(error instanceof Error ? error.message : "Unable to download the credit note.");
                                            }
                                          })();
                                        }}
                                      >
                                        Download
                                      </button>
                                    </span>
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
            <HelperText>
              {`This credit note is for invoice ${creditNoteForm.invoiceNumber} (${creditNoteForm.customerName}). Current creditable invoice amount is ${formatCurrency(creditNoteForm.eligibleCreditAmount, creditNoteForm.currency)}. The maximum credit allowed is ${formatCurrency(creditNoteForm.eligibleCreditAmount, creditNoteForm.currency)}.`}
            </HelperText>
            <label className="form-label">
              Reason
              <input className="text-input" value={creditNoteForm.reason} onChange={(event) => setCreditNoteForm((current) => current ? { ...current, reason: event.target.value } : current)} />
            </label>
            <label className="form-label">
              Issued date
              <input className="text-input" type="date" value={creditNoteForm.issuedAtUtc} onChange={(event) => setCreditNoteForm((current) => current ? { ...current, issuedAtUtc: event.target.value } : current)} />
            </label>
            <label className="form-label">
              Description
              <input className="text-input" value={creditNoteForm.description} onChange={(event) => setCreditNoteForm((current) => current ? { ...current, description: event.target.value } : current)} />
            </label>
            <label className="form-label">
              Credit amount
              <input className="text-input" type="number" min="0.01" step="0.01" max={String(creditNoteForm.eligibleCreditAmount)} value={creditNoteForm.amount} onChange={(event) => setCreditNoteForm((current) => current ? { ...current, amount: event.target.value } : current)} />
            </label>
            <HelperText>
              {(() => {
                const amount = Number(creditNoteForm.amount || 0);
                if (!Number.isFinite(amount) || amount <= 0) {
                  return "Enter the credit amount to preview the new outstanding balance.";
                }

                const nextOutstanding = Math.max(0, creditNoteForm.eligibleCreditAmount - amount);
                const capExceeded = amount > creditNoteForm.eligibleCreditAmount;
                return capExceeded
                  ? `This exceeds the cap. Maximum allowed is ${formatCurrency(creditNoteForm.eligibleCreditAmount, creditNoteForm.currency)}.`
                  : `New outstanding after this credit note: ${formatCurrency(nextOutstanding, creditNoteForm.currency)}.`;
              })()}
            </HelperText>
            <div className="button-stack">
              <button type="button" className="button button-primary" disabled={
                !creditNoteForm.reason.trim()
                || !creditNoteForm.description.trim()
                || !Number.isFinite(Number(creditNoteForm.amount))
                || Number(creditNoteForm.amount) <= 0
                || Number(creditNoteForm.amount) > creditNoteForm.eligibleCreditAmount
              } onClick={() => setConfirmState({
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
                      lines: [{
                        description: creditNoteForm.description,
                        quantity: 1,
                        unitAmount: Number(creditNoteForm.amount),
                        taxAmount: 0,
                      }],
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
        {adjustPaymentForm ? (
          <div ref={adjustPaymentFormRef} className="form-stack invoice-inline-panel" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Adjust payment</p>
            {(() => {
              const refundablePayments = payments.filter((payment) =>
                payment.invoiceId === adjustPaymentForm.invoiceId
                && payment.status === "Succeeded"
                && payment.attempts.length === 0
                && payment.refundedAmount < payment.amount);
              const selectedPayment = refundablePayments.find((payment) => payment.id === adjustPaymentForm.selectedPaymentId) ?? refundablePayments[0] ?? null;
              const remainingRefundable = selectedPayment ? Math.max(0, selectedPayment.amount - selectedPayment.refundedAmount) : 0;
              const suggestedExcessRefund = selectedPayment ? Math.max(0, selectedPayment.netCollectedAmount - adjustPaymentForm.invoiceTotal) : 0;
              return (
                <>
            <HelperText>
              {adjustPaymentForm.mode === "reverse"
                ? "Reverse the full latest manual payment only when the payment record itself was entered by mistake. This can reopen the invoice."
                : selectedPayment
                  ? `Choose the payment to refund. Remaining refundable amount on the selected payment is ${formatCurrency(remainingRefundable, adjustPaymentForm.currency)}.${suggestedExcessRefund > 0 ? ` Suggested excess refund: ${formatCurrency(suggestedExcessRefund, adjustPaymentForm.currency)}.` : ""}`
                  : "No refundable manual payment is available for this invoice."}
            </HelperText>
            {formError ? <HelperText tone="error">{formError}</HelperText> : null}
            <label className="form-label">
              Adjustment type
              <select value={adjustPaymentForm.mode} onChange={(event) => setAdjustPaymentForm((current) => current ? {
                ...current,
                mode: event.target.value === "refund" ? "refund" : "reverse",
              } : current)}>
                <option value="reverse">Reverse full payment</option>
                <option value="refund">Refund amount</option>
              </select>
            </label>
            {adjustPaymentForm.mode === "refund" ? (
              <>
                <label className="form-label">
                  Payment to refund
                  <select value={selectedPayment?.id ?? ""} onChange={(event) => setAdjustPaymentForm((current) => current ? { ...current, selectedPaymentId: event.target.value } : current)}>
                    {refundablePayments.map((payment) => {
                      const remaining = Math.max(0, payment.amount - payment.refundedAmount);
                      return (
                        <option key={payment.id} value={payment.id}>
                          {`${formatCurrency(payment.amount, payment.currency)} paid on ${payment.paidAtUtc ? new Date(payment.paidAtUtc).toLocaleDateString() : "manual"} | refundable ${formatCurrency(remaining, payment.currency)}`}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="form-label">
                  Refund amount
                  <input
                    className="text-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={adjustPaymentForm.amount}
                    onChange={(event) => setAdjustPaymentForm((current) => current ? { ...current, amount: event.target.value } : current)}
                  />
                </label>
                {suggestedExcessRefund > 0 ? (
                  <div className="button-stack" style={{ justifyContent: "flex-start" }}>
                    <button type="button" className="button button-secondary" onClick={() => setAdjustPaymentForm((current) => current ? { ...current, amount: String(suggestedExcessRefund) } : current)}>
                      Use suggested excess refund
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            <label className="form-label">
              Reason
              <input
                className="text-input"
                value={adjustPaymentForm.reason}
                onChange={(event) => setAdjustPaymentForm((current) => current ? { ...current, reason: event.target.value } : current)}
              />
            </label>
            <div className="button-stack">
              <button type="button" className="button button-primary" disabled={
                !adjustPaymentForm.reason.trim()
                || (adjustPaymentForm.mode === "refund" && (
                  !selectedPayment
                  || !Number.isFinite(Number(adjustPaymentForm.amount))
                  || Number(adjustPaymentForm.amount) <= 0
                  || Number(adjustPaymentForm.amount) > remainingRefundable))
              } onClick={() => setConfirmState({
                title: adjustPaymentForm.mode === "reverse" ? "Reverse payment" : "Refund payment",
                description: adjustPaymentForm.mode === "reverse"
                  ? `Reverse the latest manual payment on invoice ${adjustPaymentForm.invoiceNumber}?`
                  : `Record a refund on the selected payment for invoice ${adjustPaymentForm.invoiceNumber}?`,
                action: async () => {
                  if (!adjustPaymentForm) {
                    return;
                  }

                  try {
                    if (adjustPaymentForm.mode === "reverse") {
                      await api.post(`/invoices/${adjustPaymentForm.invoiceId}/reverse-payment`, {
                        reason: adjustPaymentForm.reason,
                      });
                      setSuccessMessage(`The latest manual payment on invoice ${adjustPaymentForm.invoiceNumber} was reversed.`);
                    } else {
                      await api.post(`/refunds/payments/${selectedPayment!.id}`, {
                        amount: Number(adjustPaymentForm.amount),
                        reason: adjustPaymentForm.reason,
                        invoiceId: adjustPaymentForm.invoiceId,
                      });
                      setSuccessMessage(`A refund was recorded for invoice ${adjustPaymentForm.invoiceNumber}.`);
                    }

                    setConfirmState(null);
                    setFormError("");
                    setAdjustPaymentForm(null);
                    await load();
                  } catch (error) {
                    setConfirmState(null);
                    setSuccessMessage("");
                    setFormError(error instanceof Error ? error.message : "Unable to adjust payment.");
                  }
                },
              })}>{adjustPaymentForm.mode === "reverse" ? "Reverse payment" : "Save refund"}</button>
              <button type="button" className="button button-secondary" onClick={() => setAdjustPaymentForm(null)}>Close</button>
            </div>
                </>
              );
            })()}
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
