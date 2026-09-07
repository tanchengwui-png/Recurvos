import { api } from "./api";
import type { CompanyLookup } from "../types";

type FinancePrintColumn = { label: string; numeric?: boolean };
type FinancePrintRow = Array<string | number | null | undefined>;
type FinancePrintSection = { title?: string; columns: FinancePrintColumn[]; rows: FinancePrintRow[]; total?: FinancePrintRow };

export type FinanceReportPrint = {
  title: string;
  company?: CompanyLookup | null;
  companyName?: string;
  period: string;
  status?: string;
  sections: FinancePrintSection[];
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "—").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function asDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getLogo(company?: CompanyLookup | null) {
  if (!company?.hasLogo) return "";
  try {
    const response = await api.download(`/companies/${company.id}/logo`);
    return await asDataUrl(response.blob);
  } catch {
    return "";
  }
}

/** Opens an isolated, accounting-focused print document rather than printing the application shell. */
export async function printFinanceReport(report: FinanceReportPrint) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1000,height=760");
  if (!popup) throw new Error("Allow popups to print this report.");

  const logo = await getLogo(report.company);
  const companyName = report.company?.legalName || report.company?.name || report.companyName || "Recurvos";
  const sections = report.sections.map((section) => {
    const headings = section.columns.map((column) => `<th class="${column.numeric ? "number" : ""}">${escapeHtml(column.label)}</th>`).join("");
    const rows = section.rows.map((row) => `<tr>${row.map((value, index) => `<td class="${section.columns[index]?.numeric ? "number" : ""}">${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
    const total = section.total ? `<tfoot><tr>${section.total.map((value, index) => `<th class="${section.columns[index]?.numeric ? "number" : ""}">${escapeHtml(value)}</th>`).join("")}</tr></tfoot>` : "";
    return `<section class="report-section">${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}<table><thead><tr>${headings}</tr></thead><tbody>${rows || `<tr><td colspan="${section.columns.length}">No records found.</td></tr>`}</tbody>${total}</table></section>`;
  }).join("");

  popup.document.open();
  popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(report.title)}</title><style>
    @page { size: A4 landscape; margin: 14mm 12mm 16mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); color: #64748b; font-size: 8pt; } }
    * { box-sizing: border-box; } body { margin: 0; color: #172b4d; font: 10pt Arial, sans-serif; } .report-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; border-bottom:2px solid #2563eb; padding-bottom:13px; margin-bottom:16px; } .brand { display:flex; align-items:center; gap:11px; } .logo { max-width:54px; max-height:42px; object-fit:contain; } .company { font-size:15pt; font-weight:700; } .document { text-align:right; } .document h1 { margin:0 0 5px; color:#17345f; font-size:19pt; } .document p, .meta { margin:0; color:#526581; font-size:9pt; } .meta { display:flex; justify-content:space-between; gap:20px; border-bottom:1px solid #dbe4f0; padding:0 0 10px; margin-bottom:14px; } .status { font-weight:700; color:#17345f; } .report-section { break-inside:avoid; margin:0 0 16px; } h2 { margin:0 0 7px; color:#17345f; font-size:11pt; } table { width:100%; border-collapse:collapse; } thead { display:table-header-group; } th { background:#edf4ff; color:#315b96; font-size:8pt; letter-spacing:.04em; text-transform:uppercase; text-align:left; padding:7px 6px; border-bottom:1px solid #bed2ec; } td { padding:7px 6px; border-bottom:1px solid #e1e9f2; vertical-align:top; } tfoot { display:table-footer-group; } tfoot th { background:#f5f8fc; color:#17345f; border-top:2px solid #2563eb; text-transform:none; font-size:9pt; } .number { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; } .footer { position:fixed; bottom:-10mm; left:0; right:0; text-align:center; color:#64748b; font-size:8pt; } @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body><header class="report-header"><div class="brand">${logo ? `<img class="logo" src="${logo}" alt=""/>` : ""}<div><div class="company">${escapeHtml(companyName)}</div><div class="meta">Finance report</div></div></div><div class="document"><h1>${escapeHtml(report.title)}</h1><p>Generated ${escapeHtml(new Date().toLocaleString("en-MY"))}</p></div></header><div class="meta"><span>Reporting period: <strong>${escapeHtml(report.period)}</strong></span>${report.status ? `<span class="status">${escapeHtml(report.status)}</span>` : ""}<span>Currency: <strong>MYR (RM)</strong></span></div>${sections}<div class="footer">${escapeHtml(companyName)} · ${escapeHtml(report.title)}</div><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
  popup.focus();
}
