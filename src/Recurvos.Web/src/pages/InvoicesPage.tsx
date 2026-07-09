import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClipboardWithFallback } from "../hooks/useClipboardWithFallback";
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
  "Payment confirmation link: {ActionLink}",
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

function getInvoiceMobileStatusClassName(invoice: Invoice) {
  if (invoice.status === "Voided") {
    return "subscription-mobile-status-cancelled";
  }

  if (invoice.balanceAmount <= 0) {
    return "subscription-mobile-status-active";
  }

  if (new Date(invoice.dueDateUtc).getTime() < Date.now()) {
    return "subscription-mobile-status-cancelled";
  }

  return "subscription-mobile-status-warning";
}

function getInvoicePeriodLabel(invoice: Invoice) {
  return invoice.periodStartUtc && invoice.periodEndUtc
    ? `${new Date(invoice.periodStartUtc).toLocaleDateString()} - ${new Date(invoice.periodEndUtc).toLocaleDateString()}`
    : "-";
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const paymentFormRef = useRef<HTMLDivElement | null>(null);
  const creditNoteFormRef = useRef<HTMLDivElement | null>(null);
  const adjustPaymentFormRef = useRef<HTMLDivElement | null>(null);
  const { copyTextWithFallback, clipboardFallbackModal } = useClipboardWithFallback();
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
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid" | "overdue" | "voided">(() => {
    const value = searchParams.get("status");
    return value === "open" || value === "paid" || value === "overdue" || value === "voided" ? value : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "subscription" | "platform">(() => {
    const value = searchParams.get("source");
    return value === "manual" || value === "subscription" || value === "platform" ? value : "all";
  });
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedSearchQuery
      || [
        item.invoiceNumber,
        item.customerName,
        item.statusLabel,
        item.sourceType,
      ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));

    if (!matchesSearch) {
      return false;
    }

    const isOverdue = item.balanceAmount > 0 && new Date(item.dueDateUtc).getTime() < Date.now();

    if (statusFilter === "open" && item.balanceAmount <= 0) {
      return false;
    }

    if (statusFilter === "paid" && item.balanceAmount > 0) {
      return false;
    }

    if (statusFilter === "overdue" && !isOverdue) {
      return false;
    }

    if (statusFilter === "voided" && item.status !== "Voided") {
      return false;
    }

    if (sourceFilter === "manual" && item.sourceType !== "Manual") {
      return false;
    }

    if (sourceFilter === "subscription" && item.sourceType !== "Subscription") {
      return false;
    }

    if (sourceFilter === "platform" && item.sourceType !== "PlatformSubscription") {
      return false;
    }

    return true;
  });
  const sortedItems = [...filteredItems].sort((left, right) => compareInvoices(left, right, sortState));
  const pagination = useClientPagination(sortedItems, [sortedItems.length, sortState?.column, sortState?.direction, searchQuery, statusFilter, sourceFilter], 20);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, expandedId, pagination.currentPage, pagination.pageSize]);
  const selectedInvoice = expandedId ? items.find((item) => item.id === expandedId) ?? null : null;

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
    const nextParams = new URLSearchParams(searchParams);
    const trimmedSearch = searchQuery.trim();

    if (trimmedSearch) {
      nextParams.set("search", trimmedSearch);
    } else {
      nextParams.delete("search");
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

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, searchQuery, setSearchParams, sourceFilter, statusFilter]);

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

  useEffect(() => {
    if (!selectedInvoice) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoice) {
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
  }, [selectedInvoice]);

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
      await copyTextWithFallback({
        text: message,
        title: "Copy WhatsApp message",
        onCopied: () => {
          setFormError("");
          setSuccessMessage(`WhatsApp message copied for invoice ${invoice.invoiceNumber}.`);
        },
        onCopyFailed: (error) => {
          setSuccessMessage("");
          setFormError(error.message);
        },
      });
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
      await copyTextWithFallback({
        text: url,
        title: "Copy WhatsApp browser link",
        onCopied: () => {
          setFormError("");
          setSuccessMessage(`WhatsApp browser link copied for invoice ${invoice.invoiceNumber}.`);
        },
        onCopyFailed: (error) => {
          setSuccessMessage("");
          setFormError(error.message);
        },
      });
    } catch (error) {
      setSuccessMessage("");
      setFormError(error instanceof Error ? error.message : "Unable to copy WhatsApp browser link.");
    }
  }

  function isInvoiceOverdue(invoice: Invoice) {
    return invoice.status !== "Voided" && invoice.balanceAmount > 0 && new Date(invoice.dueDateUtc).getTime() < Date.now();
  }

  function canRecordPayment(invoice: Invoice) {
    return invoice.status !== "Voided" && invoice.balanceAmount > 0;
  }

  function canGeneratePaymentLink(invoice: Invoice) {
    return invoice.balanceAmount > 0
      && (featureAccess?.featureKeys.includes("payment_link_generation") ?? false)
      && Boolean(invoiceSettings?.paymentGatewayReady);
  }

  function canSharePaymentConfirmation(invoice: Invoice) {
    return invoice.status !== "Voided"
      && invoice.balanceAmount > 0
      && (featureAccess?.featureKeys.includes("public_payment_confirmation") ?? false);
  }

  function canShareWhatsApp(invoice: Invoice) {
    return invoice.status !== "Voided" && invoice.balanceAmount > 0;
  }

  function hasPaymentLink(invoice: Invoice) {
    return invoice.history.some((entry) => entry.action === "payment.link.created");
  }

  function getPaymentLinkActionLabel(invoice: Invoice) {
    if (hasPaymentLink(invoice)) {
      return "Payment link";
    }

    if (!(featureAccess?.featureKeys.includes("payment_link_generation") ?? false)) {
      return "Upgrade for payment link";
    }

    if (!invoiceSettings?.paymentGatewayReady) {
      return "Set up payment gateway";
    }

    return "Collect now";
  }

  function getOnlinePaymentAction(invoice: Invoice) {
    return {
      label: hasPaymentLink(invoice) ? "Collect now" : "Generate payment link",
      onClick: () => void copyPaymentLink(invoice),
      disabled: !canGeneratePaymentLink(invoice),
      title: !canGeneratePaymentLink(invoice)
        ? invoice.balanceAmount <= 0
          ? "This invoice has no outstanding balance."
          : !(featureAccess?.featureKeys.includes("payment_link_generation") ?? false)
            ? getFeatureHint("payment_link_generation")
            : "Set up a payment gateway in Settings > Payment first."
        : undefined,
    };
  }

  function openRecordPaymentForm(invoice: Invoice) {
    setAdjustPaymentForm(null);
    setCreditNoteForm(null);
    setPaymentForm({
      invoiceId: invoice.id,
      amount: String(invoice.balanceAmount),
      method: "Bank transfer",
      reference: "",
      paidAtUtc: new Date().toISOString().slice(0, 10),
      proofFile: null,
      useFullBalance: true,
    });
  }

  async function generatePaymentLink(invoice: Invoice) {
    setFormError("");
    setSuccessMessage("");
    const payment = await api.post<{ paymentLinkUrl?: string | null }>(`/payments/invoice/${invoice.id}/link`);
    if (!payment.paymentLinkUrl) {
      throw new Error("Payment link could not be generated.");
    }

    setSuccessMessage(`Payment link is ready for invoice ${invoice.invoiceNumber}.`);
    await load();
    return payment.paymentLinkUrl;
  }

  async function copyPaymentLink(invoice: Invoice) {
    try {
      const paymentLinkUrl = await generatePaymentLink(invoice);
      await copyTextWithFallback({
        text: paymentLinkUrl,
        title: "Copy payment link",
        onCopied: () => {
          setFormError("");
          setSuccessMessage(`Payment link copied for invoice ${invoice.invoiceNumber}.`);
        },
        onCopyFailed: (error) => {
          setSuccessMessage("");
          setFormError(error.message);
        },
      });
    } catch (error) {
      setSuccessMessage("");
      setFormError(error instanceof Error ? error.message : "Unable to copy payment link.");
    }
  }

  async function copyPaymentConfirmationUrl(invoice: Invoice) {
    try {
      const link = await api.post<PaymentConfirmationLink>(`/payment-confirmations/invoices/${invoice.id}/link`);
      await copyTextWithFallback({
        text: link.url,
        title: "Copy payment confirmation URL",
        onCopied: () => {
          setFormError("");
          setSuccessMessage(`Payment confirmation URL copied for invoice ${invoice.invoiceNumber}.`);
        },
        onCopyFailed: (error) => {
          setSuccessMessage("");
          setFormError(error.message);
        },
      });
    } catch (error) {
      setSuccessMessage("");
      setFormError(error instanceof Error ? error.message : "Unable to create payment confirmation link.");
    }
  }

  function getCollectionPriority(invoice: Invoice) {
    if (invoice.status === "Voided") {
      return {
        label: "Voided",
        description: "This invoice is closed. Collection actions are disabled.",
        tone: "inactive" as const,
      };
    }

    if (invoice.balanceAmount <= 0) {
      return {
        label: "Paid",
        description: "Collection is complete. Receipt and refund actions stay available.",
        tone: "active" as const,
      };
    }

    if (isInvoiceOverdue(invoice)) {
      return {
        label: "Overdue",
        description: "Lead with the payment link or WhatsApp reminder to recover this balance now.",
        tone: "danger" as const,
      };
    }

    return {
      label: "Collect now",
      description: "Send, share, or record this payment before the due date slips.",
      tone: "warning" as const,
    };
  }

  function getInvoiceActions(item: Invoice) {
    return [
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
              const nextError = error instanceof Error ? error.message : "Unable to send invoice.";
              setFormError(nextError);
              throw new Error(nextError);
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
        onClick: () => openRecordPaymentForm(item),
      },
      {
        label: getPaymentLinkActionLabel(item),
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
            await copyPaymentLink(item);
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
        onClick: () => void copyPaymentConfirmationUrl(item),
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
        tone: "danger" as const,
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
              const nextError = error instanceof Error ? error.message : "Unable to void invoice.";
              setFormError(nextError);
              throw new Error(nextError);
            }
          },
        }),
      },
    ];
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
    const icon = isActive ? (sortState?.direction === "asc" ? "▲" : "▼") : null;

    return (
      <th className={className} aria-sort={isActive ? (sortState?.direction === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className={`table-sort-button${isActive ? " table-sort-button-active" : ""}`}
          onClick={() => toggleSort(column)}
          aria-label={`Sort by ${label}`}
        >
          <span>{label}</span>
          {icon ? <span className="table-sort-icon" aria-hidden="true">{icon}</span> : null}
        </button>
      </th>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Invoices</h2>
        </div>
      </header>

      {successMessage ? <HelperText>{successMessage}</HelperText> : null}
      {formError ? <HelperText tone="error">{formError}</HelperText> : null}

      <div className="catalog-toolbar card subtle-card invoice-filter-bar">
        <label className="form-label invoice-filter-search">
          Search
          <input
            aria-label="Search invoices"
            className="text-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search invoice number, customer, status, or source"
          />
        </label>
        <label className="form-label invoice-filter-select">
          Status
          <select aria-label="Filter invoices by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "open" | "paid" | "overdue" | "voided")}>
            <option value="all">All statuses</option>
            <option value="open">Outstanding</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="voided">Voided</option>
          </select>
        </label>
        <label className="form-label invoice-filter-select">
          Source
          <select aria-label="Filter invoices by source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | "manual" | "subscription" | "platform")}>
            <option value="all">All sources</option>
            <option value="manual">Manual</option>
            <option value="subscription">Subscription</option>
            <option value="platform">Platform subscription</option>
          </select>
        </label>
      </div>

      <section className="card">
        <div className="card-section-header">
          <div>
            <h3 className="section-title">Invoice records</h3>
          </div>
        </div>
        {searchQuery || statusFilter !== "all" || sourceFilter !== "all" ? (
          <HelperText>{`${filteredItems.length} matching invoice${filteredItems.length === 1 ? "" : "s"} found.`}</HelperText>
        ) : null}
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => (
            <article key={item.id} className={`subscription-mobile-card ${item.balanceAmount > 0 ? "invoice-mobile-card-collect" : ""}`}>
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.invoiceNumber}</strong>
                  <div className="eyebrow">{item.customerName}</div>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getInvoiceActions(item)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-summary">
                <div className="subscription-mobile-amount">{formatCurrency(item.total, item.currency)}</div>
                <div className="subscription-mobile-cadence">{`Balance ${formatCurrency(item.balanceAmount, item.currency)}`}</div>
              </div>
              <div className="subscription-mobile-card-topline">
                <span className={`subscription-mobile-status ${getInvoiceMobileStatusClassName(item)}`}>
                  {item.statusLabel}
                </span>
                <span className="subscription-mobile-inline-note">{item.sourceType}</span>
                <span className="subscription-mobile-inline-note">{`Due ${new Date(item.dueDateUtc).toLocaleDateString()}`}</span>
              </div>
              {item.balanceAmount > 0 ? (
                <div className="invoice-collection-banner">
                  <span className={`status-pill ${isInvoiceOverdue(item) ? "status-pill-danger" : "status-pill-inactive"}`}>
                    {getCollectionPriority(item).label}
                  </span>
                  <p>{getCollectionPriority(item).description}</p>
                </div>
              ) : null}
              {item.balanceAmount > 0 && canGeneratePaymentLink(item) ? (
                <div className="invoice-quick-actions">
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={getOnlinePaymentAction(item).onClick}
                    disabled={getOnlinePaymentAction(item).disabled}
                    title={getOnlinePaymentAction(item).title}
                  >
                    {getOnlinePaymentAction(item).label}
                  </button>
                </div>
              ) : null}
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Customer</span>
                  <span className="subscription-mobile-meta-value">{item.customerName}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Period</span>
                  <span className="subscription-mobile-meta-value">{getInvoicePeriodLabel(item)}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Paid</span>
                  <span className="subscription-mobile-meta-value">{formatCurrency(item.paidAmount, item.currency)}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Balance</span>
                  <span className="subscription-mobile-meta-value">{formatCurrency(item.balanceAmount, item.currency)}</span>
                </div>
                {getInvoiceSendSummary(item) ? (
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">History</span>
                    <span className="subscription-mobile-meta-value">{getInvoiceSendSummary(item)}</span>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <div className="subscription-table-shell">
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
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={9}
                  title="No invoices yet"
                  description="Wait for subscription renewals to generate invoices automatically, or use invoice actions here once records exist."
                  actions={<button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>}
                />
              ) : filteredItems.length === 0 ? (
                <EmptyTableRow
                  colSpan={9}
                  title="No matching invoices"
                  description="Try a different keyword or filter to narrow the invoice list."
                />
              ) : pagination.pagedItems.map((item) => (
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
                          {item.balanceAmount > 0 ? (
                            <div className="table-meta invoice-table-meta-stack">
                              <span className={`table-meta-item ${isInvoiceOverdue(item) ? "invoice-table-meta-alert" : ""}`}>
                                <span className={`table-meta-dot ${isInvoiceOverdue(item) ? "table-meta-dot-inactive" : "table-meta-dot-active"}`} />
                                {getCollectionPriority(item).label}
                              </span>
                              <span className="table-meta-item table-meta-item-truncate">
                                {canGeneratePaymentLink(item) ? "Payment link ready to share" : "Manual follow-up needed"}
                              </span>
                            </div>
                          ) : null}
                        </div>
	                        <RowActionMenu items={getInvoiceActions(item)} />
                      </div>
                    </td>
                    <td>{item.customerName}</td>
                    <td>
                      <span className={`status-pill ${item.statusLabel === "Paid" ? "status-pill-active" : "status-pill-inactive"}`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td>{item.sourceType}</td>
                    <td>{getInvoicePeriodLabel(item)}</td>
                    <td>{formatCurrency(item.total, item.currency)}</td>
                    <td>{formatCurrency(item.paidAmount, item.currency)}</td>
                    <td>{formatCurrency(item.balanceAmount, item.currency)}</td>
                    <td>{new Date(item.dueDateUtc).toLocaleDateString()}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
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
                    const nextError = error instanceof Error ? error.message : "Unable to record payment.";
                    setFormError(nextError);
                    throw new Error(nextError);
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
                    const nextError = error instanceof Error ? error.message : "Unable to issue credit note.";
                    setFormError(nextError);
                    throw new Error(nextError);
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
                    setSuccessMessage("");
                    const nextError = error instanceof Error ? error.message : "Unable to adjust payment.";
                    setFormError(nextError);
                    throw new Error(nextError);
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

      {clipboardFallbackModal}

      {selectedInvoice ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div
            className="card invoice-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Invoice detail</p>
                <h3 id="invoice-detail-title">{selectedInvoice.invoiceNumber}</h3>
                <p className="muted">{selectedInvoice.customerName}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>

            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
              <div className="invoice-detail-hero">
                <div className="invoice-detail-hero-copy">
                  <p className="eyebrow">Summary</p>
                  <h3>{selectedInvoice.invoiceNumber}</h3>
                  <p className="muted">{selectedInvoice.customerName}</p>
                </div>
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Issue Date</p>
                    <strong>{new Date(selectedInvoice.issueDateUtc).toLocaleDateString()}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Due Date</p>
                    <strong>{new Date(selectedInvoice.dueDateUtc).toLocaleDateString()}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Total</p>
                    <strong>{formatCurrency(selectedInvoice.total, selectedInvoice.currency)}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Balance</p>
                    <strong>{formatCurrency(selectedInvoice.balanceAmount, selectedInvoice.currency)}</strong>
                  </div>
                </div>
              </div>
              {selectedInvoice.balanceAmount > 0 ? (
                <div className="invoice-collection-hero">
                  <div>
                    <span className={`status-pill ${isInvoiceOverdue(selectedInvoice) ? "status-pill-danger" : "status-pill-inactive"}`}>
                      {getCollectionPriority(selectedInvoice).label}
                    </span>
                    <p>{getCollectionPriority(selectedInvoice).description}</p>
                  </div>
                  <div className="invoice-collection-hero-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={getOnlinePaymentAction(selectedInvoice).onClick}
                      disabled={getOnlinePaymentAction(selectedInvoice).disabled}
                      title={getOnlinePaymentAction(selectedInvoice).title}
                    >
                      {getOnlinePaymentAction(selectedInvoice).label}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => openRecordPaymentForm(selectedInvoice)}
                      disabled={!canRecordPayment(selectedInvoice)}
                    >
                      Record payment
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void copyPaymentConfirmationUrl(selectedInvoice)}
                      disabled={!canSharePaymentConfirmation(selectedInvoice)}
                      title={!canSharePaymentConfirmation(selectedInvoice)
                        ? !featureAccess?.featureKeys.includes("public_payment_confirmation")
                          ? getFeatureHint("public_payment_confirmation")
                          : "This invoice cannot issue a payment confirmation link."
                        : undefined}
                    >
                      Copy payment confirmation link
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void copyWhatsAppMessage(selectedInvoice)}
                      disabled={!canShareWhatsApp(selectedInvoice) || !(featureAccess?.featureKeys.includes("whatsapp_copy_message") ?? false)}
                      title={!(featureAccess?.featureKeys.includes("whatsapp_copy_message") ?? false)
                        ? getFeatureHint("whatsapp_copy_message")
                        : undefined}
                    >
                      Copy WhatsApp reminder
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="invoice-detail-layout">
                <div className="invoice-detail-main">
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">Line Items</p>
                    </div>
                    <div className="invoice-detail-list invoice-detail-list-spacious">
                      {selectedInvoice.lineItems.map((line) => (
                        <div key={`${line.description}-${line.totalAmount}`} className="invoice-detail-list-row invoice-detail-list-row-top">
                          <div className="invoice-detail-line-copy">
                            <strong>{line.description}</strong>
                            <span className="muted">{`${line.quantity} x ${formatCurrency(line.unitAmount, selectedInvoice.currency)}`}</span>
                          </div>
                          <strong>{formatCurrency(line.totalAmount, selectedInvoice.currency)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">History</p>
                    </div>
                    <div className="invoice-detail-list">
                      {selectedInvoice.history.length > 0 ? selectedInvoice.history.map((entry) => (
                        <div key={`${entry.createdAtUtc}-${entry.action}`} className="invoice-detail-list-row invoice-detail-list-row-top">
                          <div className="invoice-detail-line-copy">
                            <strong>{entry.description}</strong>
                            <span className="muted">{entry.action}</span>
                          </div>
                          <span className="muted">{new Date(entry.createdAtUtc).toLocaleString()}</span>
                        </div>
                      )) : <p className="muted">No invoice history yet.</p>}
                    </div>
                  </div>
                </div>

                <div className="invoice-detail-aside">
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">Overview</p>
                    </div>
                    <div className="invoice-detail-list">
                      <div className="invoice-detail-list-row">
                        <span>Status</span>
                        <strong>{selectedInvoice.statusLabel}</strong>
                      </div>
                      <div className="invoice-detail-list-row">
                        <span>Source</span>
                        <strong>{selectedInvoice.sourceType}</strong>
                      </div>
                      <div className="invoice-detail-list-row invoice-detail-list-row-top">
                        <span>Period</span>
                        <strong className="invoice-detail-align-right">
                          {selectedInvoice.periodStartUtc && selectedInvoice.periodEndUtc
                            ? `${new Date(selectedInvoice.periodStartUtc).toLocaleDateString()} - ${new Date(selectedInvoice.periodEndUtc).toLocaleDateString()}`
                            : "-"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">Billing Address</p>
                    </div>
                    <div className="invoice-detail-list">
                      <div className="invoice-detail-list-row invoice-detail-list-row-top">
                        <span>Saved with invoice</span>
                        <strong className="invoice-detail-align-right" style={{ whiteSpace: "pre-line" }}>
                          {selectedInvoice.companyAddressSnapshot || "-"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">Amounts</p>
                    </div>
                    <div className="invoice-detail-list">
                      <div className="invoice-detail-list-row">
                        <span>Subtotal</span>
                        <strong>{formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)}</strong>
                      </div>
                      <div className="invoice-detail-list-row">
                        <span>{selectedInvoice.isTaxEnabled ? selectedInvoice.taxName ?? "Tax" : "Tax"}</span>
                        <strong>{formatCurrency(selectedInvoice.taxAmount, selectedInvoice.currency)}</strong>
                      </div>
                      <div className="invoice-detail-list-row">
                        <span>Paid</span>
                        <strong>{formatCurrency(selectedInvoice.paidAmount, selectedInvoice.currency)}</strong>
                      </div>
                      <div className="invoice-detail-list-row">
                        <span>Balance</span>
                        <strong>{formatCurrency(selectedInvoice.balanceAmount, selectedInvoice.currency)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">Online payment</p>
                    </div>
                    <div className="invoice-detail-list">
                      {selectedInvoice.history.some((entry) => entry.action === "payment.link.created") ? (
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

                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header">
                      <p className="eyebrow">Credit Notes</p>
                    </div>
                    <div className="invoice-detail-list">
                      {selectedInvoice.creditNotes.length > 0 ? selectedInvoice.creditNotes.map((note) => (
                        <div key={note.id} className="invoice-detail-list-row invoice-detail-list-row-top">
                          <div className="invoice-detail-line-copy">
                            <strong>{note.creditNoteNumber}</strong>
                            <span className="muted">{`${formatCurrency(note.totalReduction, note.currency)} | ${note.reason}`}</span>
                          </div>
                          <span className="invoice-detail-inline-actions">
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
                      {selectedInvoice.refunds.length > 0 ? selectedInvoice.refunds.map((refund) => (
                        <div key={refund.id} className="invoice-detail-list-row">
                          <span>{`${formatCurrency(refund.amount, refund.currency)} | ${refund.reason}`}</span>
                          <span className="muted">{new Date(refund.createdAtUtc).toLocaleDateString()}</span>
                        </div>
                      )) : <p className="muted">No refunds linked to this invoice.</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="invoice-detail-endcap">
                <div>
                  <p className="eyebrow">End of details</p>
                  <p className="muted">You have reached the end of this invoice.</p>
                </div>
                <button type="button" className="button button-secondary" onClick={() => setExpandedId(null)}>Close details</button>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
