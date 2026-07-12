import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { copyTextToClipboard } from "../lib/clipboard";
import { formatCurrency } from "../lib/format";
import type { Customer, StatementOfAccountReport } from "../types";

type StatementType = "customer" | "supplier";
type ColumnKey = "date" | "document" | "description" | "debit" | "credit" | "balance";

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

export function CustomerStatementPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
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

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");
        const customerList = await api.get<Customer[]>("/customers");
        setCustomers(customerList);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load statement data.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const eligibleContacts = customers.filter((customer) => {
    const types = parseContactTypes(customer.contactType);
    return types.includes("Customer") || types.includes("Supplier");
  });
  const selectedContact = customers.find((customer) => customer.id === id) ?? null;
  const selectedContactTypes = selectedContact ? parseContactTypes(selectedContact.contactType) : [];
  const availableStatementTypes: StatementType[] = selectedContactTypes.includes("Customer") && selectedContactTypes.includes("Supplier")
    ? ["customer", "supplier"]
    : selectedContactTypes.includes("Supplier")
      ? ["supplier"]
      : selectedContactTypes.includes("Customer")
        ? ["customer"]
        : [];
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
  }, [contactPerson, endDate, id, includeOutstandingOnly, selectedContact, startDate, statementType]);

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
    setColumns((current) => {
      if (checked) {
        return current.includes(column) ? current : [...current, column];
      }

      const next = current.filter((item) => item !== column);
      return next.length === 0 ? current : next;
    });
  }

  function buildPrintableHtml() {
    const rowsMarkup = statementRows.map((row) => `
      <tr>
        ${columns.includes("date") ? `<td>${escapeHtml(formatDate(row.dateUtc))}</td>` : ""}
        ${columns.includes("document") ? `<td>${escapeHtml(row.documentNumber)}</td>` : ""}
        ${columns.includes("description") ? `<td>${escapeHtml(row.description)}</td>` : ""}
        ${columns.includes("debit") ? `<td style="text-align:right;">${escapeHtml(formatCurrency(row.debit, row.currencyCode || statementCurrency))}</td>` : ""}
        ${columns.includes("credit") ? `<td style="text-align:right;">${escapeHtml(formatCurrency(row.credit, row.currencyCode || statementCurrency))}</td>` : ""}
        ${columns.includes("balance") ? `<td style="text-align:right;">${escapeHtml(formatCurrency(row.balance, statementCurrency))}</td>` : ""}
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
    <div class="meta-item"><strong>Period</strong><br />${escapeHtml(`${startDate || "-"} to ${endDate || "-"}`)}</div>
    <div class="meta-item"><strong>Contact Person</strong><br />${escapeHtml(selectedContactPerson?.name || "-")}</div>
  </div>
  <table>
    <thead>
      <tr>
        ${columns.includes("date") ? "<th>Date</th>" : ""}
        ${columns.includes("document") ? "<th>Document No.</th>" : ""}
        ${columns.includes("description") ? "<th>Description</th>" : ""}
        ${columns.includes("debit") ? "<th>Debit</th>" : ""}
        ${columns.includes("credit") ? "<th>Credit</th>" : ""}
        ${columns.includes("balance") ? "<th>Balance</th>" : ""}
      </tr>
    </thead>
    <tbody>${rowsMarkup || `<tr><td colspan="${columns.length}">No transactions found.</td></tr>`}</tbody>
  </table>
  <h2 style="margin-top:24px;">Aging Summary</h2>
  <div class="aging">
    <div class="aging-item"><strong>Current</strong><br />${escapeHtml(formatCurrency(agingBuckets.current, statementCurrency))}</div>
    <div class="aging-item"><strong>1-30 Days</strong><br />${escapeHtml(formatCurrency(agingBuckets.days1To30, statementCurrency))}</div>
    <div class="aging-item"><strong>31-60 Days</strong><br />${escapeHtml(formatCurrency(agingBuckets.days31To60, statementCurrency))}</div>
    <div class="aging-item"><strong>61-90 Days</strong><br />${escapeHtml(formatCurrency(agingBuckets.days61To90, statementCurrency))}</div>
    <div class="aging-item"><strong>91+ Days</strong><br />${escapeHtml(formatCurrency(agingBuckets.days91Plus, statementCurrency))}</div>
    <div class="aging-item"><strong>Total</strong><br />${escapeHtml(formatCurrency(agingBuckets.totalOutstanding, statementCurrency))}</div>
  </div>
</body>
</html>`;
  }

  function handlePrint() {
    window.print();
  }

  function handleExportPdf() {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!popup) {
      setMessage("Allow popups to export the statement as PDF.");
      return;
    }

    popup.document.open();
    popup.document.write(buildPrintableHtml());
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function handleExportExcel() {
    const headers = columnOptions.filter((option) => columns.includes(option.key)).map((option) => option.label);
    const dataRows = statementRows.map((row) => [
      columns.includes("date") ? formatDate(row.dateUtc) : null,
      columns.includes("document") ? row.documentNumber : null,
      columns.includes("description") ? row.description : null,
      columns.includes("debit") ? row.debit.toFixed(2) : null,
      columns.includes("credit") ? row.credit.toFixed(2) : null,
      columns.includes("balance") ? row.balance.toFixed(2) : null,
    ].filter((value) => value !== null));
    const agingRows = [
      [],
      ["Aging Summary"],
      ["Current", agingBuckets.current.toFixed(2)],
      ["1-30 Days", agingBuckets.days1To30.toFixed(2)],
      ["31-60 Days", agingBuckets.days31To60.toFixed(2)],
      ["61-90 Days", agingBuckets.days61To90.toFixed(2)],
      ["91+ Days", agingBuckets.days91Plus.toFixed(2)],
      ["Total", agingBuckets.totalOutstanding.toFixed(2)],
    ];
    const csv = [headers, ...dataRows, ...agingRows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    downloadTextFile(csv, `${selectedContact?.legalName || selectedContact?.name || "statement"}-statement.csv`, "text/csv;charset=utf-8");
  }

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({
        title: `${statementLabel} - ${selectedContact?.legalName || selectedContact?.name || "Contact"}`,
        text: `Statement of account for ${selectedContact?.legalName || selectedContact?.name || "contact"}`,
        url,
      });
      return;
    }

    await copyTextToClipboard(url);
    setMessage("Statement link copied to clipboard.");
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
          <p className="muted">Review statement activity, aging, and export-ready output for the selected contact.</p>
        </div>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Back to contacts</button>
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-secondary" onClick={handleExportPdf}>Export PDF</button>
          <button type="button" className="button button-secondary" onClick={handleExportExcel}>Export Excel</button>
          <button type="button" className="button button-primary" onClick={() => void handleShare()}>Share</button>
        </div>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card statement-hero-card">
        <div className="statement-hero-copy">
          <p className="eyebrow">Selected Contact</p>
          <h3>{selectedContact.legalName || selectedContact.name}</h3>
          <p className="muted">{selectedContact.contactType}</p>
        </div>
        <div className="statement-summary-grid">
          <div className="statement-summary-item">
            <span className="statement-summary-label">Contact Person</span>
            <strong>{selectedContactPerson?.name || "-"}</strong>
            <span className="muted">{selectedContactPerson?.role || selectedContactPerson?.email || selectedContactPerson?.phoneNumber || "No contact person recorded"}</span>
          </div>
          <div className="statement-summary-item">
            <span className="statement-summary-label">Date Range</span>
            <strong>{startDate || "-"} to {endDate || "-"}</strong>
            <span className="muted">{presetPeriod === "rolling" ? `${periods} period(s) x ${daysPerPeriod} day(s)` : presetPeriod.replaceAll("-", " ")}</span>
          </div>
          <div className="statement-summary-item">
            <span className="statement-summary-label">Closing Balance</span>
            <strong>{formatCurrency(statement?.closingBalance ?? 0, statementCurrency)}</strong>
            <span className="muted">{`${statementRows.length} transaction row(s)`}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Filters</h3>
          </div>
        </div>

        <div className="statement-filter-grid">
          <label className="form-label">
            Contact
            <select
              value={selectedContact.id}
              onChange={(event) => navigate(`/customers/${event.target.value}/statement?${searchParams.toString()}`)}
            >
              {eligibleContacts.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.legalName || customer.name}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Statement Type
            <select value={statementType} onChange={(event) => setStatementType(event.target.value as StatementType)} disabled={availableStatementTypes.length <= 1}>
              {availableStatementTypes.map((type) => (
                <option key={type} value={type}>{type === "supplier" ? "Supplier Statement" : "Customer Statement"}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Contact Type
            <input className="text-input" value={selectedContact.contactType} readOnly />
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
    </div>
  );
}
