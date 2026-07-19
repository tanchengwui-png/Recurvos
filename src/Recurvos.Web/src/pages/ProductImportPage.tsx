import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";

const headers = ["Company ID*", "Product Name*", "Product Code*", "Description", "Barcode", "Category", "Product Groups", "Base Unit", "Sales Price", "Purchase Price", "Track Inventory", "Opening Quantity", "Opening Cost", "Status"] as const;
type Row = { number: number; data: Record<string, string>; errors: string[] };

const cell = (row: Row, header: string) => row.data[header]?.trim() ?? "";
const truthy = (value: string) => ["true", "yes", "1"].includes(value.trim().toLowerCase());

async function readWorkbook(file: File) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const values = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false });
  const [fileHeaders = [], ...body] = values;
  const missing = headers.filter((header) => !fileHeaders.includes(header));
  if (missing.length) throw new Error(`Missing required template headers: ${missing.join(", ")}.`);
  if (body.length > 5000) throw new Error("Maximum 5,000 products per import file.");
  return body.filter((line) => line.some((value) => String(value).trim())).map((line, index) => {
    const data = Object.fromEntries(headers.map((header) => [header, String(line[fileHeaders.indexOf(header)] ?? "").trim()]));
    const errors = [!data["Company ID*"] && "Missing Company ID.", !data["Product Name*"] && "Missing Product Name.", !data["Product Code*"] && "Missing Product Code."] .filter(Boolean) as string[];
    for (const key of ["Sales Price", "Purchase Price", "Opening Quantity", "Opening Cost"]) if (data[key] && !Number.isFinite(Number(data[key]))) errors.push(`${key} must be a number.`);
    if (data.Status && !["active", "inactive"].includes(data.Status.toLowerCase())) errors.push("Status must be Active or Inactive.");
    return { number: index + 2, data, errors };
  });
}

export function ProductImportPage() {
  const navigate = useNavigate(); const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]); const [fileName, setFileName] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [complete, setComplete] = useState<{ imported: number; failed: number } | null>(null);
  const valid = rows.filter((row) => !row.errors.length);
  async function downloadTemplate() { const XLSX = await import("xlsx"); const sheet = XLSX.utils.aoa_to_sheet([Array.from(headers), ["Paste a Company ID", "Example product", "PROD-001", "Optional description", "", "General", "Retail; Featured", "Unit", "99.90", "", "No", "", "", "Active"]]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Products"); XLSX.writeFile(book, "product-import-template.xlsx"); }
  async function upload(file: File) { try { setError(""); setFileName(file.name); setRows(await readWorkbook(file)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the workbook."); } }
  async function importRows() { setLoading(true); let imported = 0; let failed = rows.length - valid.length; for (const row of valid) { try { await api.post("/products", { companyId: cell(row, "Company ID*"), name: cell(row, "Product Name*"), code: cell(row, "Product Code*"), description: cell(row, "Description") || null, barcode: cell(row, "Barcode") || null, category: cell(row, "Category") || null, productGroups: cell(row, "Product Groups").split(/[;,]/).map((x) => x.trim()).filter(Boolean), baseUnitLabel: cell(row, "Base Unit") || "Unit", isSelling: Boolean(cell(row, "Sales Price")), salesPrice: cell(row, "Sales Price") ? Number(cell(row, "Sales Price")) : null, isBuying: Boolean(cell(row, "Purchase Price")), purchasePrice: cell(row, "Purchase Price") ? Number(cell(row, "Purchase Price")) : null, trackInventory: truthy(cell(row, "Track Inventory")), openingQuantity: cell(row, "Opening Quantity") ? Number(cell(row, "Opening Quantity")) : null, openingCost: cell(row, "Opening Cost") ? Number(cell(row, "Opening Cost")) : null, isSubscriptionProduct: false, isActive: cell(row, "Status").toLowerCase() !== "inactive" }); imported++; } catch { failed++; } } setComplete({ imported, failed }); setLoading(false); }
  return <div className="page"><header className="page-header"><div className="page-header-copy"><p className="eyebrow">Products / Import Products</p><h2>Import Products</h2></div><button type="button" className="button button-secondary" onClick={() => navigate("/products")}>Back to products</button></header><section className="card import-card">{complete ? <div className="import-complete"><h3 className="section-title">Import Completed</h3><div className="import-result-grid"><span className="status-pill status-pill-active">✓ {complete.imported} Products Imported</span><span className="status-pill status-pill-danger">✕ {complete.failed} Failed or Skipped</span></div><button type="button" className="button button-primary" onClick={() => navigate("/products")}>Back To Products</button></div> : !rows.length ? <div className="import-upload-layout"><div className="import-instructions"><h3 className="section-title">Import Instructions</h3><ol><li>Download the Excel template.</li><li>Complete the product rows without changing headers.</li><li>Upload to validate and review before import.</li></ol><button type="button" className="button button-secondary" onClick={() => void downloadTemplate()}>Download Template</button></div><div className="import-dropzone"><input ref={input} type="file" accept=".xlsx,.xls" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><strong>Drag & Drop Excel File Here</strong><span>Up to 5,000 products per file.</span><button type="button" className="button button-primary" onClick={() => input.current?.click()}>Upload File</button>{fileName ? <p className="muted">{fileName}</p> : null}</div></div> : <div className="import-review"><div className="import-summary-grid"><span className="page-meta-chip">Total <strong>{rows.length}</strong></span><span className="page-meta-chip">Valid <strong>{valid.length}</strong></span><span className="page-meta-chip">Errors <strong>{rows.length - valid.length}</strong></span></div><div className="table-scroll table-scroll-bounded"><table className="catalog-table import-preview-table"><thead><tr><th>Status</th><th>Product</th><th>Code</th><th>Company</th><th>Message</th></tr></thead><tbody>{rows.slice(0, 100).map((row) => <tr key={row.number}><td>{row.errors.length ? "✕" : "✓"}</td><td>{cell(row, "Product Name*")}</td><td>{cell(row, "Product Code*")}</td><td>{cell(row, "Company ID*")}</td><td>{row.errors.join("; ") || "Ready to import"}</td></tr>)}</tbody></table></div><div className="import-actions"><button type="button" className="button button-secondary" onClick={() => setRows([])}>Back</button><button type="button" className="button button-primary" disabled={!valid.length || loading} onClick={() => void importRows()}>{loading ? "Importing..." : "Import Valid Records"}</button></div></div>}{error ? <HelperText tone="error">{error}</HelperText> : null}</section></div>;
}
