import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
import { ResponseToast } from "../components/ui/Toast";
import { useClipboardWithFallback } from "../hooks/useClipboardWithFallback";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { Customer, StatementOfAccountReport } from "../types";

type StatementType = "customer" | "supplier";
type ColumnKey = "date" | "document" | "description" | "debit" | "credit" | "balance";
type StatementActionType = "export-pdf" | "export-excel" | "share-email" | "share-link";

type StatementActionConfig = {
  statementType: StatementType;
  presetPeriod: string;
  startDate: string;
  endDate: string;
  periods: number;
  daysPerPeriod: number;
  contactPerson: string;
  columns: ColumnKey[];
  includeOutstandingOnly: boolean;
  remarks: string;
  emailTo: string;
  cc: string;
  replyTo: string;
  subject: string;
  personalMessage: string;
};

const statementActionLabels: Record<StatementActionType, string> = {
  "export-pdf": "Export PDF",
  "export-excel": "Export Excel",
  "share-email": "Share via Email",
  "share-link": "Share via Link",
};

const statementActionDescriptions: Record<StatementActionType, string> = {
  "export-pdf": "Confirm the statement filters and output settings before exporting the PDF.",
  "export-excel": "Confirm the statement filters and output settings before exporting the Excel file.",
  "share-email": "Review the statement filters, then prepare the email details before sending.",
  "share-link": "Confirm the statement filters before generating a shareable statement link.",
};

const statementActionSubmitLabels: Record<StatementActionType, string> = {
  "export-pdf": "Export PDF",
  "export-excel": "Export Excel",
  "share-email": "Send",
  "share-link": "Generate Link",
};

const columnOptions: { key: ColumnKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "document", label: "Document No." },
  { key: "description", label: "Description" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "balance", label: "Balance" },
];

function parseContactTypes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getPresetRange(preset: string, periods: number, daysPerPeriod: number) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);

  switch (preset) {
    case "this-month":
      return {
        start: toDateInputValue(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))),
        end: toDateInputValue(end),
      };
    case "last-month": {
      const lastMonthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
      const lastMonthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
      return {
        start: toDateInputValue(lastMonthStart),
        end: toDateInputValue(lastMonthEnd),
      };
    }
    case "last-30-days":
      start.setUTCDate(start.getUTCDate() - 29);
      return {
        start: toDateInputValue(start),
        end: toDateInputValue(end),
      };
    case "this-year":
      return {
        start: toDateInputValue(new Date(Date.UTC(end.getUTCFullYear(), 0, 1))),
        end: toDateInputValue(end),
      };
    case "rolling":
      start.setUTCDate(start.getUTCDate() - Math.max(1, periods) * Math.max(1, daysPerPeriod) + 1);
      return {
        start: toDateInputValue(start),
        end: toDateInputValue(end),
      };
    default:
      return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildStatementPath(contactId: string, statementType: StatementType, startDate: string, endDate: string, contactPerson: string, includeOutstandingOnly: boolean) {
  const params = new URLSearchParams();
  params.set("contactId", contactId);
  params.set("statementType", statementType === "supplier" ? "Supplier" : "Customer");
  if (startDate) {
    params.set("fromDateUtc", `${startDate}T00:00:00Z`);
  }
  if (endDate) {
    params.set("toDateUtc", `${endDate}T23:59:59Z`);
  }
  if (contactPerson !== "all") {
    params.set("contactPerson", contactPerson);
  }
  if (includeOutstandingOnly) {
    params.set("includeOutstandingOnly", "true");
  }

  return `/statements?${params.toString()}`;
}

function toggleColumnSelection(current: ColumnKey[], column: ColumnKey, checked: boolean) {
  if (checked) {
    return current.includes(column) ? current : [...current, column];
  }

  const next = current.filter((item) => item !== column);
  return next.length === 0 ? current : next;
}

function buildStatementPageSearchParams(config: StatementActionConfig) {
  const params = new URLSearchParams();
  params.set("type", config.statementType);
  params.set("preset", config.presetPeriod);
  if (config.startDate) {
    params.set("from", config.startDate);
  }
  if (config.endDate) {
    params.set("to", config.endDate);
  }
  params.set("periods", String(config.periods));
  params.set("days", String(config.daysPerPeriod));
  if (config.contactPerson !== "all") {
    params.set("person", config.contactPerson);
  }
  params.set("columns", config.columns.join(","));
  if (config.includeOutstandingOnly) {
    params.set("outstanding", "1");
  }
  return params;
}

function buildMailtoLink(to: string, cc: string, subject: string, body: string) {
  const params = new URLSearchParams();
  if (cc.trim()) {
    params.set("cc", cc.trim());
  }
  if (subject.trim()) {
    params.set("subject", subject.trim());
  }
  if (body.trim()) {
    params.set("body", body);
  }

  const query = params.toString();
  return `mailto:${encodeURIComponent(to.trim())}${query ? `?${query}` : ""}`;
}

function formatPresetPeriodLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CustomerStatementPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedContact, setSelectedContact] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<StatementOfAccountReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statementType, setStatementType] = useState<StatementType>((searchParams.get("type") as StatementType) === "supplier" ? "supplier" : "customer");
  const [presetPeriod, setPresetPeriod] = useState(searchParams.get("preset") ?? "this-year");
  const [startDate, setStartDate] = useState(searchParams.get("from") ?? "");
  const [endDate, setEndDate] = useState(searchParams.get("to") ?? "");
  const [periods, setPeriods] = useState(Number(searchParams.get("periods") ?? "3"));
  const [daysPerPeriod, setDaysPerPeriod] = useState(Number(searchParams.get("days") ?? "30"));
  const [contactPerson, setContactPerson] = useState(searchParams.get("person") ?? "all");
  const [columns, setColumns] = useState<ColumnKey[]>(
    (searchParams.get("columns")?.split(",").filter((item): item is ColumnKey => columnOptions.some((option) => option.key === item as ColumnKey)))
    ?? ["date", "document", "description", "debit", "credit", "balance"],
  );
  const [includeOutstandingOnly, setIncludeOutstandingOnly] = useState(searchParams.get("outstanding") === "1");
  const [actionModalType, setActionModalType] = useState<StatementActionType | null>(null);
  const [actionConfig, setActionConfig] = useState<StatementActionConfig | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const { copyTextWithFallback, clipboardFallbackModal } = useClipboardWithFallback();

  useEffect(() => {
    async function load() {
      if (!id) {
        setSelectedContact(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const contact = await api.get<Customer>(`/customers/${id}`);
        setSelectedContact(contact);
      } catch (loadError) {
        setSelectedContact(null);
        setError(loadError instanceof Error ? loadError.message : "Unable to load statement data.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id]);

  const availableStatementTypes = useMemo<StatementType[]>(() => {
    const selectedContactTypes = selectedContact ? parseContactTypes(selectedContact.contactType) : [];

    return selectedContactTypes.includes("Customer") && selectedContactTypes.includes("Supplier")
      ? ["customer", "supplier"]
      : selectedContactTypes.includes("Supplier")
        ? ["supplier"]
        : selectedContactTypes.includes("Customer")
          ? ["customer"]
          : [];
  }, [selectedContact]);
  const selectedContactPerson = selectedContact?.contactPersons.find((person) => person.name === contactPerson) ?? selectedContact?.contactPersons[0] ?? null;
  const statementLabel = statementType === "supplier" ? "Supplier Statement of Account" : "Customer Statement of Account";

  useEffect(() => {
    if (!selectedContact) {
      return;
    }

    if (availableStatementTypes.length > 0 && !availableStatementTypes.includes(statementType)) {
      setStatementType(availableStatementTypes[0]);
    }

    if (selectedContact.contactPersons.length === 0) {
      if (contactPerson !== "all") {
        setContactPerson("all");
      }
      return;
    }

    if (contactPerson === "all") {
      return;
    }

    if (!selectedContact.contactPersons.some((person) => person.name === contactPerson)) {
      setContactPerson(selectedContact.contactPersons[0]?.name ?? "all");
    }
  }, [availableStatementTypes, contactPerson, selectedContact, statementType]);

  useEffect(() => {
    if (presetPeriod === "custom") {
      return;
    }

    const range = getPresetRange(presetPeriod, periods, daysPerPeriod);
    if (!range) {
      return;
    }

    setStartDate(range.start);
    setEndDate(range.end);
  }, [daysPerPeriod, periods, presetPeriod]);

  useEffect(() => {
    if (!actionConfig || actionConfig.presetPeriod === "custom") {
      return;
    }

    const range = getPresetRange(actionConfig.presetPeriod, actionConfig.periods, actionConfig.daysPerPeriod);
    if (!range) {
      return;
    }

    if (range.start !== actionConfig.startDate || range.end !== actionConfig.endDate) {
      setActionConfig((current) => current ? { ...current, startDate: range.start, endDate: range.end } : current);
    }
  }, [actionConfig]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    nextParams.set("type", statementType);
    nextParams.set("preset", presetPeriod);
    if (startDate) {
      nextParams.set("from", startDate);
    } else {
      nextParams.delete("from");
    }
    if (endDate) {
      nextParams.set("to", endDate);
    } else {
      nextParams.delete("to");
    }
    nextParams.set("periods", String(periods));
    nextParams.set("days", String(daysPerPeriod));
    if (contactPerson !== "all") {
      nextParams.set("person", contactPerson);
    } else {
      nextParams.delete("person");
    }
    nextParams.set("columns", columns.join(","));
    if (includeOutstandingOnly) {
      nextParams.set("outstanding", "1");
    } else {
      nextParams.delete("outstanding");
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [columns, contactPerson, daysPerPeriod, endDate, includeOutstandingOnly, periods, presetPeriod, searchParams, setSearchParams, startDate, statementType]);

  useEffect(() => {
    if (!selectedContact) {
      setStatement(null);
      return;
    }

    const selectedContactId = selectedContact.id;
    let cancelled = false;

    async function loadStatement() {
      try {
        setLoading(true);
        setError("");
        const report = await api.get<StatementOfAccountReport>(
          buildStatementPath(selectedContactId, statementType, startDate, endDate, contactPerson, includeOutstandingOnly),
        );

        if (!cancelled) {
          setStatement(report);
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatement(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load statement data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStatement();

    return () => {
      cancelled = true;
    };
  }, [contactPerson, endDate, includeOutstandingOnly, selectedContact, startDate, statementType]);

  const statementRows = statement?.rows ?? [];
  const agingBuckets = statement?.aging ?? {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    days91Plus: 0,
    totalOutstanding: 0,
  };
  const statementCurrency = statement?.currencyCode || selectedContact?.currency || "MYR";

  function toggleColumn(column: ColumnKey, checked: boolean) {
    setColumns((current) => toggleColumnSelection(current, column, checked));
  }

  function getDefaultActionConfig(actionType: StatementActionType): StatementActionConfig {
    const defaultEmail = selectedContactPerson?.email || selectedContact?.emailAddresses[0] || selectedContact?.email || "";
    const contactName = selectedContact?.legalName || selectedContact?.name || "Contact";

    return {
      statementType,
      presetPeriod,
      startDate,
      endDate,
      periods,
      daysPerPeriod,
      contactPerson,
      columns,
      includeOutstandingOnly,
      remarks: "",
      emailTo: defaultEmail,
      cc: "",
      replyTo: "",
      subject: `${statementLabel} - ${contactName}`,
      personalMessage: actionType === "share-email" ? `Please find the ${statementLabel.toLowerCase()} for ${contactName}.` : "",
    };
  }

  function buildPrintableHtml(report: StatementOfAccountReport, config: StatementActionConfig) {
    const orderedColumns = columnOptions.filter((option) => config.columns.includes(option.key));
    const configContactPerson = selectedContact?.contactPersons.find((person) => person.name === config.contactPerson) ?? null;
    const rowsMarkup = (report.rows ?? []).map((row) => `
      <tr>
        ${config.columns.includes("date") ? `<td>${escapeHtml(formatDate(row.dateUtc))}</td>` : ""}
        ${config.columns.includes("document") ? `<td>${escapeHtml(row.documentNumber)}</td>` : ""}
        ${config.columns.includes("description") ? `<td>${escapeHtml(row.description)}</td>` : ""}
        ${config.columns.includes("debit") ? `<td style="text-align:right;">${escapeHtml(formatCurrency(row.debit, row.currencyCode || report.currencyCode))}</td>` : ""}
        ${config.columns.includes("credit") ? `<td style="text-align:right;">${escapeHtml(formatCurrency(row.credit, row.currencyCode || report.currencyCode))}</td>` : ""}
        ${config.columns.includes("balance") ? `<td style="text-align:right;">${escapeHtml(formatCurrency(row.balance, report.currencyCode))}</td>` : ""}
      </tr>
    `).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(statementLabel)} - ${escapeHtml(selectedContact?.legalName || selectedContact?.name || "Contact")}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
    h1, h2, h3, p { margin: 0 0 12px; }
    .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0 24px; }
    .meta-item, .aging-item { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; font-size: 12px; }
    th { background: #f8fafc; text-align: left; }
    .aging { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(statementLabel)}</h1>
  <p>${escapeHtml(selectedContact?.legalName || selectedContact?.name || "-")}</p>
  <div class="meta">
    <div class="meta-item"><strong>Contact Type</strong><br />${escapeHtml(selectedContact?.contactType || "-")}</div>
    <div class="meta-item"><strong>Period</strong><br />${escapeHtml(`${config.startDate || "-"} to ${config.endDate || "-"}`)}</div>
    <div class="meta-item"><strong>Contact Person</strong><br />${escapeHtml(configContactPerson?.name || (config.contactPerson === "all" ? "All contact persons" : "-"))}</div>
  </div>
  ${config.remarks.trim() ? `<p><strong>Remarks</strong><br />${escapeHtml(config.remarks)}</p>` : ""}
  <table>
    <thead>
      <tr>
        ${orderedColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${rowsMarkup || `<tr><td colspan="${Math.max(orderedColumns.length, 1)}">No transactions found.</td></tr>`}</tbody>
  </table>
  <h2 style="margin-top:24px;">Aging Summary</h2>
  <div class="aging">
    <div class="aging-item"><strong>Current</strong><br />${escapeHtml(formatCurrency(report.aging.current, report.currencyCode))}</div>
    <div class="aging-item"><strong>1-30 Days</strong><br />${escapeHtml(formatCurrency(report.aging.days1To30, report.currencyCode))}</div>
    <div class="aging-item"><strong>31-60 Days</strong><br />${escapeHtml(formatCurrency(report.aging.days31To60, report.currencyCode))}</div>
    <div class="aging-item"><strong>61-90 Days</strong><br />${escapeHtml(formatCurrency(report.aging.days61To90, report.currencyCode))}</div>
    <div class="aging-item"><strong>91+ Days</strong><br />${escapeHtml(formatCurrency(report.aging.days91Plus, report.currencyCode))}</div>
    <div class="aging-item"><strong>Total</strong><br />${escapeHtml(formatCurrency(report.aging.totalOutstanding, report.currencyCode))}</div>
  </div>
</body>
</html>`;
  }

  function buildStatementCsv(report: StatementOfAccountReport, config: StatementActionConfig) {
    const orderedColumns = columnOptions.filter((option) => config.columns.includes(option.key));
    const headers = orderedColumns.map((option) => option.label);
    const dataRows = report.rows.map((row) => orderedColumns.map((option) => {
      switch (option.key) {
        case "date":
          return formatDate(row.dateUtc);
        case "document":
          return row.documentNumber;
        case "description":
          return row.description;
        case "debit":
          return row.debit.toFixed(2);
        case "credit":
          return row.credit.toFixed(2);
        case "balance":
          return row.balance.toFixed(2);
        default:
          return "";
      }
    }));
    const detailRows = [
      ["Statement Type", config.statementType === "supplier" ? "Supplier Statement" : "Customer Statement"],
      ["Reporting Period", config.presetPeriod.replaceAll("-", " ")],
      ["Date Range", `${config.startDate || "-"} to ${config.endDate || "-"}`],
      ["Periods", String(config.periods)],
      ["Days / Period", String(config.daysPerPeriod)],
      ["Contact Person", config.contactPerson === "all" ? "All contact persons" : config.contactPerson],
      ["Include Outstanding Only", config.includeOutstandingOnly ? "Yes" : "No"],
      ["Remarks", config.remarks],
      [],
      ["Aging Summary"],
      ["Current", report.aging.current.toFixed(2)],
      ["1-30 Days", report.aging.days1To30.toFixed(2)],
      ["31-60 Days", report.aging.days31To60.toFixed(2)],
      ["61-90 Days", report.aging.days61To90.toFixed(2)],
      ["91+ Days", report.aging.days91Plus.toFixed(2)],
      ["Total", report.aging.totalOutstanding.toFixed(2)],
    ];

    return [headers, ...dataRows, [], ...detailRows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
  }

  function openActionModal(type: StatementActionType) {
    setActionError("");
    setActionModalType(type);
    setActionConfig(getDefaultActionConfig(type));
  }

  function closeActionModal() {
    if (actionSubmitting) {
      return;
    }

    setActionError("");
    setActionModalType(null);
    setActionConfig(null);
  }

  async function loadStatementForAction(config: StatementActionConfig) {
    return api.get<StatementOfAccountReport>(
      buildStatementPath(selectedContact?.id ?? id, config.statementType, config.startDate, config.endDate, config.contactPerson, config.includeOutstandingOnly),
    );
  }

  function buildShareUrl(config: StatementActionConfig) {
    const params = buildStatementPageSearchParams(config);
    return `${window.location.origin}/customers/${selectedContact?.id ?? id}/statement?${params.toString()}`;
  }

  async function exportPdf(config: StatementActionConfig) {
    const report = await loadStatementForAction(config);
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!popup) {
      throw new Error("Allow popups to export the statement as PDF.");
    }

    popup.document.open();
    popup.document.write(buildPrintableHtml(report, config));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function exportExcel(config: StatementActionConfig) {
    const report = await loadStatementForAction(config);
    const csv = buildStatementCsv(report, config);
    downloadTextFile(csv, `${selectedContact?.legalName || selectedContact?.name || "statement"}-statement.csv`, "text/csv;charset=utf-8");
  }

  async function shareViaLink(config: StatementActionConfig) {
    const url = buildShareUrl(config);
    const payload = config.remarks.trim() ? `${config.remarks.trim()}\n\n${url}` : url;
    await copyTextWithFallback({
      title: "Copy statement link",
      text: payload,
      description: "Copy this statement link to share the configured statement view.",
      onCopied: () => setMessage("Statement link copied to clipboard."),
      onCopyFailed: (copyError) => setMessage(copyError.message),
    });
  }

  async function shareViaEmail(config: StatementActionConfig) {
    const url = buildShareUrl(config);
    const bodyLines = [
      config.personalMessage.trim() || `Please find the ${statementLabel.toLowerCase()} link below.`,
      "",
      `Statement Type: ${config.statementType === "supplier" ? "Supplier Statement" : "Customer Statement"}`,
      `Reporting Period: ${formatPresetPeriodLabel(config.presetPeriod)}`,
      `Date Range: ${config.startDate || "-"} to ${config.endDate || "-"}`,
      `Periods: ${config.periods}`,
      `Days / Period: ${config.daysPerPeriod}`,
      `Contact Person: ${config.contactPerson === "all" ? "All contact persons" : config.contactPerson}`,
      `Columns: ${columnOptions.filter((option) => config.columns.includes(option.key)).map((option) => option.label).join(", ")}`,
      `Include Outstanding Only: ${config.includeOutstandingOnly ? "Yes" : "No"}`,
      config.remarks.trim() ? `Remarks: ${config.remarks.trim()}` : "",
      config.replyTo.trim() ? `Reply-To: ${config.replyTo.trim()}` : "",
      "",
      url,
    ].filter(Boolean);

    if (!config.emailTo.trim()) {
      throw new Error("Email To is required.");
    }

    const mailto = buildMailtoLink(config.emailTo, config.cc, config.subject, bodyLines.join("\n"));
    window.open(mailto, "_blank", "noopener,noreferrer");
    setMessage("Opened your email client with the statement link.");
  }

  async function handleActionConfirm() {
    if (!actionModalType || !actionConfig) {
      return;
    }

    try {
      setActionSubmitting(true);
      setActionError("");

      switch (actionModalType) {
        case "export-pdf":
          await exportPdf(actionConfig);
          setMessage("Statement PDF export started.");
          break;
        case "export-excel":
          await exportExcel(actionConfig);
          setMessage("Statement Excel export started.");
          break;
        case "share-email":
          await shareViaEmail(actionConfig);
          break;
        case "share-link":
          await shareViaLink(actionConfig);
          break;
        default:
          break;
      }

      setActionModalType(null);
      setActionConfig(null);
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to complete this action.");
    } finally {
      setActionSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <section className="card">
          <p className="muted">Loading statement...</p>
        </section>
      </div>
    );
  }

  if (!selectedContact) {
    return (
      <div className="page">
        <section className="card">
          <h2>Statement of Account</h2>
          <HelperText tone="error">The selected contact could not be found.</HelperText>
          <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Back to contacts</button>
        </section>
      </div>
    );
  }

  return (
    <div className="page statement-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{statementLabel}</h2>
          <p className="muted">
            {selectedContact.legalName || selectedContact.name} · {selectedContact.contactType}
          </p>
        </div>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Back to contacts</button>
          <div className="statement-action-toolbar">
            <RowActionMenu
              label="Share ▼"
              items={[
                { label: "Via Email", onClick: () => openActionModal("share-email") },
                { label: "Via Link", onClick: () => openActionModal("share-link") },
              ]}
            />
            <RowActionMenu
              label="Export ▼"
              items={[
                { label: "PDF", onClick: () => openActionModal("export-pdf") },
                { label: "Excel", onClick: () => openActionModal("export-excel") },
              ]}
            />
          </div>
        </div>
      </header>
      <ResponseToast message={message} tone="success" />
      <ResponseToast message={error} tone="error" />

      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Filters</h3>
          </div>
        </div>

        <div className="statement-summary-grid statement-filter-summary-grid">
          <div className="statement-summary-item">
            <span className="statement-summary-label">Contact</span>
            <strong>{selectedContact.legalName || selectedContact.name}</strong>
            <span className="muted">{selectedContact.contactType}</span>
          </div>
          <div className="statement-summary-item">
            <span className="statement-summary-label">Contact Person</span>
            <strong>{contactPerson === "all" ? "All contact persons" : selectedContactPerson?.name || "-"}</strong>
            <span className="muted">
              {contactPerson === "all"
                ? "Statement includes all recorded contact persons"
                : selectedContactPerson?.role || selectedContactPerson?.email || selectedContactPerson?.phoneNumber || "No contact person selected"}
            </span>
          </div>
          <div className="statement-summary-item">
            <span className="statement-summary-label">Closing Balance</span>
            <strong>{formatCurrency(statement?.closingBalance ?? 0, statementCurrency)}</strong>
            <span className="muted">{`${statementRows.length} transaction row(s)`}</span>
          </div>
        </div>

        <div className="statement-filter-grid">
          <label className="form-label">
            Statement Type
            <select value={statementType} onChange={(event) => setStatementType(event.target.value as StatementType)} disabled={availableStatementTypes.length <= 1}>
              {availableStatementTypes.map((type) => (
                <option key={type} value={type}>{type === "supplier" ? "Supplier Statement" : "Customer Statement"}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Contact Person
            <select value={contactPerson} onChange={(event) => setContactPerson(event.target.value)}>
              <option value="all">All contact persons</option>
              {selectedContact.contactPersons.map((person) => (
                <option key={`${person.name}-${person.email}`} value={person.name}>{person.name || person.email || person.phoneNumber || "Unnamed contact person"}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Preset Period
            <select value={presetPeriod} onChange={(event) => setPresetPeriod(event.target.value)}>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="last-30-days">Last 30 days</option>
              <option value="this-year">This year</option>
              <option value="rolling">Rolling periods</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <label className="form-label">
            Start Date
            <input type="date" className="text-input" value={startDate} onChange={(event) => {
              setPresetPeriod("custom");
              setStartDate(event.target.value);
            }} />
          </label>
          <label className="form-label">
            End Date
            <input type="date" className="text-input" value={endDate} onChange={(event) => {
              setPresetPeriod("custom");
              setEndDate(event.target.value);
            }} />
          </label>
          <label className="form-label">
            Periods
            <input type="number" min={1} className="text-input" value={periods} onChange={(event) => setPeriods(Math.max(1, Number(event.target.value) || 1))} />
          </label>
          <label className="form-label">
            Days / Period
            <input type="number" min={1} className="text-input" value={daysPerPeriod} onChange={(event) => setDaysPerPeriod(Math.max(1, Number(event.target.value) || 1))} />
          </label>
        </div>

        <div className="statement-filter-footer">
          <div className="statement-columns-panel">
            <span className="statement-columns-label">Columns</span>
            <div className="statement-columns-grid">
              {columnOptions.map((option) => (
                <label key={option.key} className="statement-column-toggle">
                  <input type="checkbox" checked={columns.includes(option.key)} onChange={(event) => toggleColumn(option.key, event.target.checked)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="statement-column-toggle statement-outstanding-toggle">
            <input type="checkbox" checked={includeOutstandingOnly} onChange={(event) => setIncludeOutstandingOnly(event.target.checked)} />
            <span>Include Outstanding Only</span>
          </label>
        </div>
        <HelperText>
          Contact Person filtering is preserved for forward compatibility, but most current transaction records do not yet store transaction-level contact person references consistently, so statement results are not narrowed by that filter yet.
        </HelperText>
      </section>

      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Statement Output</h3>
          </div>
        </div>

        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table statement-table">
            <thead>
              <tr>
                {columns.includes("date") ? <th>Date</th> : null}
                {columns.includes("document") ? <th>Document No.</th> : null}
                {columns.includes("description") ? <th>Description</th> : null}
                {columns.includes("debit") ? <th>Debit</th> : null}
                {columns.includes("credit") ? <th>Credit</th> : null}
                {columns.includes("balance") ? <th>Balance</th> : null}
              </tr>
            </thead>
            <tbody>
              {statementRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <div className="statement-empty-state">
                      <strong>No statement rows found</strong>
                      <p className="muted">Try adjusting the period, statement type, or outstanding-only filter.</p>
                    </div>
                  </td>
                </tr>
              ) : statementRows.map((row) => (
                <tr key={row.id}>
                  {columns.includes("date") ? <td>{formatDate(row.dateUtc)}</td> : null}
                  {columns.includes("document") ? <td>{row.documentNumber}</td> : null}
                  {columns.includes("description") ? <td>{row.description}</td> : null}
                  {columns.includes("debit") ? <td>{formatCurrency(row.debit, row.currencyCode || statementCurrency)}</td> : null}
                  {columns.includes("credit") ? <td>{formatCurrency(row.credit, row.currencyCode || statementCurrency)}</td> : null}
                  {columns.includes("balance") ? <td>{formatCurrency(row.balance, statementCurrency)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Aging Summary</h3>
          </div>
        </div>
        <div className="statement-aging-grid">
          <div className="statement-aging-card"><span>Current</span><strong>{formatCurrency(agingBuckets.current, statementCurrency)}</strong></div>
          <div className="statement-aging-card"><span>1-30 Days</span><strong>{formatCurrency(agingBuckets.days1To30, statementCurrency)}</strong></div>
          <div className="statement-aging-card"><span>31-60 Days</span><strong>{formatCurrency(agingBuckets.days31To60, statementCurrency)}</strong></div>
          <div className="statement-aging-card"><span>61-90 Days</span><strong>{formatCurrency(agingBuckets.days61To90, statementCurrency)}</strong></div>
          <div className="statement-aging-card"><span>91+ Days</span><strong>{formatCurrency(agingBuckets.days91Plus, statementCurrency)}</strong></div>
          <div className="statement-aging-card statement-aging-card-total"><span>Total</span><strong>{formatCurrency(agingBuckets.totalOutstanding, statementCurrency)}</strong></div>
        </div>
      </section>
      {clipboardFallbackModal}
      {actionModalType && actionConfig ? (
        <div className="modal-backdrop" role="presentation" onClick={closeActionModal}>
          <div
            className="modal-card card statement-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-action-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="statement-action-modal-header">
              <div>
                <p className="eyebrow">Statement Output Setup</p>
                <h3 id="statement-action-modal-title">{statementActionLabels[actionModalType]}</h3>
                <p className="muted statement-action-modal-description">{statementActionDescriptions[actionModalType]}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={closeActionModal} disabled={actionSubmitting}>Close</button>
            </div>
            <div className="statement-action-modal-section">
              <div className="statement-action-section-heading">
                <span className="statement-columns-label">Statement Filters</span>
                <span className="muted">Defaults are loaded from the current statement view and can be adjusted here.</span>
              </div>
            </div>
            <div className="statement-action-modal-grid">
              <label className="form-label">
                Statement Type
                <select
                  value={actionConfig.statementType}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, statementType: event.target.value as StatementType } : current)}
                  disabled={availableStatementTypes.length <= 1 || actionSubmitting}
                >
                  {availableStatementTypes.map((type) => (
                    <option key={type} value={type}>{type === "supplier" ? "Supplier Statement" : "Customer Statement"}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Reporting Period
                <select
                  value={actionConfig.presetPeriod}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, presetPeriod: event.target.value } : current)}
                  disabled={actionSubmitting}
                >
                  <option value="this-month">This month</option>
                  <option value="last-month">Last month</option>
                  <option value="last-30-days">Last 30 days</option>
                  <option value="this-year">This year</option>
                  <option value="rolling">Rolling periods</option>
                  <option value="custom">Custom range</option>
                </select>
              </label>
              <label className="form-label statement-action-modal-wide">
                Date Range
                <div className="statement-action-date-range">
                  <input
                    type="date"
                    className="text-input"
                    value={actionConfig.startDate}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, presetPeriod: "custom", startDate: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                  <span className="statement-action-date-range-separator">to</span>
                  <input
                    type="date"
                    className="text-input"
                    value={actionConfig.endDate}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, presetPeriod: "custom", endDate: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                </div>
              </label>
              <label className="form-label">
                Contact Person
                <select
                  value={actionConfig.contactPerson}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, contactPerson: event.target.value } : current)}
                  disabled={actionSubmitting}
                >
                  <option value="all">All contact persons</option>
                  {selectedContact.contactPersons.map((person) => (
                    <option key={`${person.name}-${person.email}`} value={person.name}>{person.name || person.email || person.phoneNumber || "Unnamed contact person"}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Periods
                <input
                  type="number"
                  min={1}
                  className="text-input"
                  value={actionConfig.periods}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, periods: Math.max(1, Number(event.target.value) || 1) } : current)}
                  disabled={actionSubmitting}
                />
              </label>
              <label className="form-label">
                Days / Period
                <input
                  type="number"
                  min={1}
                  className="text-input"
                  value={actionConfig.daysPerPeriod}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, daysPerPeriod: Math.max(1, Number(event.target.value) || 1) } : current)}
                  disabled={actionSubmitting}
                />
              </label>
            </div>
            <div className="statement-action-modal-section">
              <div className="statement-action-section-heading">
                <span className="statement-columns-label">Columns</span>
              </div>
              <div className="statement-columns-grid">
                {columnOptions.map((option) => (
                  <label key={option.key} className="statement-column-toggle">
                    <input
                      type="checkbox"
                      checked={actionConfig.columns.includes(option.key)}
                      disabled={actionSubmitting}
                      onChange={(event) => setActionConfig((current) => current ? { ...current, columns: toggleColumnSelection(current.columns, option.key, event.target.checked) } : current)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="statement-action-modal-section statement-action-modal-settings">
              <label className="statement-column-toggle">
                <input
                  type="checkbox"
                  checked={actionConfig.includeOutstandingOnly}
                  disabled={actionSubmitting}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, includeOutstandingOnly: event.target.checked } : current)}
                />
                <span>Include Outstanding Only</span>
              </label>
              <label className="form-label">
                Remarks
                <textarea
                  className="text-input statement-action-textarea"
                  rows={3}
                  value={actionConfig.remarks}
                  onChange={(event) => setActionConfig((current) => current ? { ...current, remarks: event.target.value } : current)}
                  disabled={actionSubmitting}
                />
              </label>
            </div>
            {actionModalType === "share-email" ? (
              <div className="statement-action-modal-section">
                <div className="statement-action-section-heading">
                  <span className="statement-columns-label">Email Details</span>
                </div>
              </div>
            ) : null}
            {actionModalType === "share-email" ? (
              <div className="statement-action-modal-grid">
                <label className="form-label">
                  Email To
                  <input
                    className="text-input"
                    value={actionConfig.emailTo}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, emailTo: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                </label>
                <label className="form-label">
                  CC
                  <input
                    className="text-input"
                    value={actionConfig.cc}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, cc: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                </label>
                <label className="form-label">
                  Reply-To
                  <input
                    className="text-input"
                    value={actionConfig.replyTo}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, replyTo: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                </label>
                <label className="form-label statement-action-modal-wide">
                  Subject
                  <input
                    className="text-input"
                    value={actionConfig.subject}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, subject: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                </label>
                <label className="form-label statement-action-modal-wide">
                  Personal Message
                  <textarea
                    className="text-input statement-action-textarea"
                    rows={5}
                    value={actionConfig.personalMessage}
                    onChange={(event) => setActionConfig((current) => current ? { ...current, personalMessage: event.target.value } : current)}
                    disabled={actionSubmitting}
                  />
                </label>
              </div>
            ) : null}
            {actionError ? <HelperText tone="error">{actionError}</HelperText> : null}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeActionModal} disabled={actionSubmitting}>Cancel</button>
              <button type="button" className="button button-primary" onClick={() => void handleActionConfirm()} disabled={actionSubmitting}>
                {actionSubmitting ? "Working..." : statementActionSubmitLabels[actionModalType]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
