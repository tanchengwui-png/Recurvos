import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { ContactGroup, Customer } from "../types";

const templateHeaders = [
  "Contact Name*",
  "Contact Type*",
  "Contact Group",
  "Labels",
  "Contact Person",
  "Email",
  "Phone",
  "Address Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "Postal Code",
  "State",
  "Country",
  "Credit Limit",
  "Receivable Account",
  "Payable Account",
  "Status",
];

type ImportStep = "upload" | "review" | "complete";
type ImportStatus = "valid" | "warning" | "error";

type ImportRow = {
  rowNumber: number;
  data: Record<string, string>;
  status: ImportStatus;
  messages: string[];
};

type ImportResult = {
  imported: number;
  warnings: number;
  failed: number;
  rows: ImportRow[];
};

const allowedContactTypes = ["Customer", "Supplier", "Employee"];
const allowedStatuses = ["Active", "Inactive", "Archived"];

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function parseList(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index);
}

function getCell(data: Record<string, string>, header: string) {
  return data[header]?.trim() ?? "";
}

function validateRows(rawRows: string[][], contactGroups: ContactGroup[]) {
  const [headers, ...bodyRows] = rawRows;
  if (!headers?.length) {
    throw new Error("The file is empty.");
  }

  const missingHeaders = templateHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required template headers: ${missingHeaders.join(", ")}.`);
  }

  const groupNames = new Set(contactGroups.map((group) => group.name.toLowerCase()));

  if (bodyRows.length > 5000) {
    throw new Error("Maximum 5,000 contacts per import file.");
  }

  return bodyRows.map((cells, index): ImportRow => {
    const data = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const messages: string[] = [];
    const contactName = getCell(data, "Contact Name*");
    const contactTypes = parseList(getCell(data, "Contact Type*"));
    const groups = parseList(getCell(data, "Contact Group"));
    const email = getCell(data, "Email");
    const status = getCell(data, "Status") || "Active";

    if (!contactName) {
      messages.push("Missing Contact Name.");
    }

    if (contactTypes.length === 0) {
      messages.push("Missing Contact Type.");
    } else if (contactTypes.some((type) => !allowedContactTypes.some((allowed) => allowed.toLowerCase() === type.toLowerCase()))) {
      messages.push("Invalid Contact Type.");
    }

    if (!email) {
      messages.push("Missing Email.");
    }

    if (status && !allowedStatuses.some((allowed) => allowed.toLowerCase() === status.toLowerCase())) {
      messages.push("Invalid Status.");
    }

    if (contactTypes.some((type) => type.toLowerCase() === "customer") && !getCell(data, "Receivable Account")) {
      messages.push("Missing Receivable Account for Customer contact.");
    }

    if (contactTypes.some((type) => type.toLowerCase() === "supplier") && !getCell(data, "Payable Account")) {
      messages.push("Missing Payable Account for Supplier contact.");
    }

    groups.forEach((group) => {
      if (!groupNames.has(group.toLowerCase())) {
        messages.push(`Contact Group not found: ${group}.`);
      }
    });

    const hasErrors = messages.some((message) =>
      message.startsWith("Missing") || message.startsWith("Invalid"));

    return {
      rowNumber: index + 2,
      data,
      status: hasErrors ? "error" : messages.length > 0 ? "warning" : "valid",
      messages,
    };
  });
}

function buildCustomerPayload(row: ImportRow, existing?: Customer) {
  const data = row.data;
  const contactName = getCell(data, "Contact Name*");
  const contactTypes = parseList(getCell(data, "Contact Type*")).join(", ");
  const groups = parseList(getCell(data, "Contact Group"));
  const tags = parseList(getCell(data, "Labels"));
  const contactPerson = getCell(data, "Contact Person");
  const email = getCell(data, "Email");
  const phone = getCell(data, "Phone");
  const addressName = getCell(data, "Address Name");
  const streetAddress = getCell(data, "Address Line 1");
  const addressLine2 = getCell(data, "Address Line 2");
  const city = getCell(data, "City");
  const postcode = getCell(data, "Postal Code");
  const state = getCell(data, "State");
  const country = getCell(data, "Country");
  const receivableAccount = getCell(data, "Receivable Account");
  const payableAccount = getCell(data, "Payable Account");
  const creditLimit = getCell(data, "Credit Limit");
  const status = getCell(data, "Status") || "Active";
  const hasAddress = Boolean(addressName || streetAddress || addressLine2 || city || postcode || state || country);
  const addresses = hasAddress
    ? [{
        addressName: addressName || "Primary",
        streetAddress,
        addressLine2,
        addressLine3: "",
        city,
        postcode,
        country,
        state,
        isDefaultBilling: true,
        isDefaultShipping: true,
      }]
    : existing?.addresses ?? [];

  return {
    name: contactName,
    legalName: contactName,
    otherName: existing?.otherName ?? "",
    entityType: existing?.entityType ?? "Company",
    registrationNumberType: existing?.registrationNumberType ?? "",
    registrationNumber: existing?.registrationNumber ?? "",
    oldRegistrationNumber: existing?.oldRegistrationNumber ?? "",
    tin: existing?.tin ?? "",
    sstRegistrationNumber: existing?.sstRegistrationNumber ?? "",
    email,
    phoneNumber: phone,
    externalReference: existing?.externalReference ?? "",
    billingAddress: hasAddress ? [streetAddress, city, state, postcode, country].filter(Boolean).join(", ") : existing?.billingAddress ?? "",
    contactType: contactTypes,
    status,
    contactPersons: contactPerson ? [{ name: contactPerson, role: "", email, phoneNumber: phone }] : existing?.contactPersons ?? [],
    phoneNumbers: phone ? [phone] : existing?.phoneNumbers ?? [],
    emailAddresses: [email],
    addresses,
    receivableAccount: receivableAccount || existing?.receivableAccount || "",
    creditLimit: creditLimit ? Number(creditLimit) : existing?.creditLimit ?? null,
    payableAccount: payableAccount || existing?.payableAccount || "",
    groups,
    priceLevel: existing?.priceLevel ?? "",
    currency: existing?.currency ?? "MYR",
    paymentTerm: existing?.paymentTerm ?? "",
    incomeAccount: existing?.incomeAccount ?? "",
    expenseAccount: existing?.expenseAccount ?? "",
    location: existing?.location ?? "",
    tags,
    myInvoisControl: existing?.myInvoisControl ?? "Default",
  };
}

function StepIndicator({ step }: { step: ImportStep }) {
  const steps: { key: ImportStep; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "review", label: "Review" },
    { key: "complete", label: "Complete" },
  ];
  const activeIndex = steps.findIndex((item) => item.key === step);

  return (
    <div className="import-stepper" aria-label="Import progress">
      {steps.map((item, index) => (
        <div key={item.key} className={`import-step ${index <= activeIndex ? "import-step-active" : ""}`}>
          <span>{index + 1}</span>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: ImportStatus) {
  if (status === "valid") return "✓";
  if (status === "warning") return "⚠";
  return "✕";
}

export function CustomerImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    async function loadReferenceData() {
      const [customerList, groupList] = await Promise.all([
        api.get<Customer[]>("/customers").catch(() => []),
        api.get<ContactGroup[]>("/contact-groups").catch(() => []),
      ]);
      setCustomers(customerList);
      setContactGroups(groupList);
    }

    void loadReferenceData();
  }, []);

  const validRows = rows.filter((row) => row.status !== "error");
  const warningRows = rows.filter((row) => row.status === "warning");
  const errorRows = rows.filter((row) => row.status === "error");

  function downloadTemplate() {
    downloadCsv("contact-import-template.csv", [
      templateHeaders,
      ["ABC Trading", "Customer", "Wholesale", "VIP; Retail", "Jane Tan", "abc@email.com", "+60 123456789", "HQ", "12 Jalan Example", "Level 2", "Kuala Lumpur", "50000", "Kuala Lumpur", "Malaysia", "10000", "1100", "", "Active"],
    ]);
  }

  function downloadReport(reportRows = rows, file = "contact-import-report.csv") {
    downloadCsv(file, [
      ["Row", "Status", "Contact Name", "Contact Type", "Contact Group", "Email", "Messages"],
      ...reportRows.map((row) => [
        row.rowNumber,
        row.status,
        getCell(row.data, "Contact Name*"),
        getCell(row.data, "Contact Type*"),
        getCell(row.data, "Contact Group"),
        getCell(row.data, "Email"),
        row.messages.join("; "),
      ]),
    ]);
  }

  async function processFile(file: File) {
    setError("");
    setFileName(file.name);

    if (file.size > 8 * 1024 * 1024) {
      setError("File is too large. Use a smaller file with no more than 5,000 contacts.");
      return;
    }

    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const emptyRow = Object.fromEntries(templateHeaders.map((header) => [header, ""]));
      setRows([{ rowNumber: 1, data: emptyRow, status: "error", messages: ["XLSX parsing is not available in this browser build. Upload the CSV template for validation and import."] }]);
      setStep("review");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Upload a .csv or .xlsx file.");
      return;
    }

    try {
      const text = await file.text();
      const parsedRows = parseCsv(text);
      const validatedRows = validateRows(parsedRows, contactGroups);
      setRows(validatedRows);
      setStep("review");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to read this file.");
    }
  }

  async function importValidRows() {
    setIsImporting(true);
    const importedRows: ImportRow[] = [];
    const failedRows: ImportRow[] = [];

    for (const row of validRows) {
      const contactName = getCell(row.data, "Contact Name*").toLowerCase();
      const existing = customers.find((customer) => (customer.legalName || customer.name).toLowerCase() === contactName);
      const payload = buildCustomerPayload(row, existing);

      try {
        if (existing) {
          await api.put(`/customers/${existing.id}`, payload);
        } else {
          await api.post("/customers", payload);
        }
        importedRows.push(row);
      } catch (importError) {
        failedRows.push({
          ...row,
          status: "error",
          messages: [...row.messages, importError instanceof Error ? importError.message : "Import failed."],
        });
      }
    }

    setResult({
      imported: importedRows.filter((row) => row.status === "valid").length,
      warnings: importedRows.filter((row) => row.status === "warning").length,
      failed: errorRows.length + failedRows.length,
      rows: [...importedRows, ...errorRows, ...failedRows],
    });
    setIsImporting(false);
    setStep("complete");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Contacts / Import Contacts</p>
          <h2>Import Contacts</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Back to contacts</button>
      </header>

      <section className="card import-card">
        <StepIndicator step={step} />

        {step === "upload" ? (
          <div className="import-upload-layout">
            <div className="import-instructions">
              <h3 className="section-title">Import Instructions</h3>
              <p>Please follow the steps below to import contacts:</p>
              <ol>
                <li>Download the template file.</li>
                <li>Fill in the contact information following the provided format.</li>
                <li>Upload the completed file.</li>
              </ol>
              <h4>Notes</h4>
              <ul>
                <li>Do not remove the template headers.</li>
                <li>Do not rearrange the columns.</li>
                <li>Maximum 5,000 contacts per import file.</li>
                <li>Existing contacts can be updated if matched by Contact Name.</li>
                <li>Contact Groups will be matched by name.</li>
                <li>Labels/Tags will be matched by name.</li>
              </ul>
              <button type="button" className="button button-secondary" onClick={downloadTemplate}>Download Template</button>
            </div>

            <div
              className="import-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void processFile(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void processFile(file);
                }}
              />
              <strong>Drag & Drop File Here</strong>
              <span>CSV files can be reviewed and imported. XLSX files are accepted for validation messaging.</span>
              <button type="button" className="button button-primary" onClick={() => fileInputRef.current?.click()}>Upload File</button>
              {fileName ? <p className="muted">{fileName}</p> : null}
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="import-review">
            <div className="import-summary-grid">
              <span className="page-meta-chip"><span className="page-meta-chip-label">Total Records</span><strong className="page-meta-chip-value">{rows.length}</strong></span>
              <span className="page-meta-chip"><span className="page-meta-chip-label">✓ Valid</span><strong className="page-meta-chip-value">{rows.filter((row) => row.status === "valid").length}</strong></span>
              <span className="page-meta-chip"><span className="page-meta-chip-label">⚠ Warnings</span><strong className="page-meta-chip-value">{warningRows.length}</strong></span>
              <span className="page-meta-chip"><span className="page-meta-chip-label">✕ Errors</span><strong className="page-meta-chip-value">{errorRows.length}</strong></span>
            </div>
            <div className="table-scroll table-scroll-bounded">
              <table className="catalog-table import-preview-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Contact Name</th>
                    <th>Contact Type</th>
                    <th>Contact Group</th>
                    <th>Email</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber}>
                      <td><span className={`import-status import-status-${row.status}`}>{statusLabel(row.status)}</span></td>
                      <td>{getCell(row.data, "Contact Name*") || "-"}</td>
                      <td>{(row.messages.find((message) => message.includes("Contact Type")) ?? getCell(row.data, "Contact Type*")) || "-"}</td>
                      <td>{(row.messages.find((message) => message.includes("Contact Group")) ?? getCell(row.data, "Contact Group")) || "-"}</td>
                      <td>{getCell(row.data, "Email") || "-"}</td>
                      <td>{row.messages.join("; ") || "Ready to import"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 ? <HelperText>Showing first 100 rows.</HelperText> : null}
            <div className="import-actions">
              <button type="button" className="button button-secondary" onClick={() => setStep("upload")}>Back</button>
              {errorRows.length > 0 ? <button type="button" className="button button-secondary" onClick={() => downloadReport(errorRows, "contact-import-errors.csv")}>Download Error Report</button> : null}
              <button type="button" className="button button-primary" onClick={importValidRows} disabled={validRows.length === 0 || isImporting}>
                {isImporting ? "Importing..." : "Import Valid Records"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "complete" && result ? (
          <div className="import-complete">
            <h3 className="section-title">Import Completed</h3>
            <div className="import-result-grid">
              <span className="status-pill status-pill-active">✓ {result.imported} Contacts Imported</span>
              <span className="status-pill status-pill-inactive">⚠ {result.warnings} Imported With Warnings</span>
              <span className="status-pill status-pill-danger">✕ {result.failed} Failed</span>
            </div>
            <div className="import-actions">
              <button type="button" className="button button-secondary" onClick={() => downloadReport(result.rows)}>Download Import Report</button>
              <button type="button" className="button button-primary" onClick={() => navigate("/customers")}>Back To Contacts</button>
            </div>
          </div>
        ) : null}

        {error ? <HelperText tone="error">{error}</HelperText> : null}
      </section>
    </div>
  );
}
