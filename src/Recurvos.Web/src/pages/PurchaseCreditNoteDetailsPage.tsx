import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchaseCreditNote } from "../types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function PurchaseCreditNoteDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<PurchaseCreditNote | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<PurchaseCreditNote>(`/purchases/credit-notes/${id}`).then(setDocument);
  }, [id]);

  function handlePrint() {
    window.print();
  }

  function handleExportPdf() {
    if (!document) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!popup) return;
    const rows = document.lines.map((line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td style="text-align:right">${line.quantity}</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(line.unitAmount, document.currency))}</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(line.lineTotal, document.currency))}</td>
      </tr>
    `).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(document.purchaseCreditNoteNumber)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{text-transform:uppercase;font-size:12px;color:#64748b}.meta{color:#475569;margin:6px 0}.totals{margin-top:24px;margin-left:auto;width:320px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0}</style></head><body><h1>${escapeHtml(document.purchaseCreditNoteNumber)}</h1><p class="meta">Supplier: ${escapeHtml(document.contactName)}</p><p class="meta">Status: ${escapeHtml(document.status)}</p><p class="meta">Purchase bill: ${escapeHtml(document.purchaseBillNumber)}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Unit Amount</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="row"><span>Total</span><strong>${escapeHtml(formatCurrency(document.totalReduction, document.currency))}</strong></div></div></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading purchase credit note...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Credit Note</h2><p className="muted">{document.purchaseCreditNoteNumber}</p></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/credit-notes")}>Back</button>
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-primary" onClick={handleExportPdf}>Export PDF</button>
        </div>
      </header>
      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{document.contactName}</h3>
            <p className="muted">{document.status}</p>
            <p className="muted">Reason: {document.reason}</p>
          </div>
          <div className="invoice-detail-summary">
            <div className="invoice-detail-stat"><p>Credit Note No</p><strong>{document.purchaseCreditNoteNumber}</strong></div>
            <div className="invoice-detail-stat"><p>Date</p><strong>{new Date(document.issuedAtUtc).toLocaleDateString()}</strong></div>
            <div className="invoice-detail-stat"><p>Total</p><strong>{formatCurrency(document.totalReduction, document.currency)}</strong></div>
          </div>
        </div>
        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Lines</h3></div>
              <div className="table-scroll table-scroll-bounded">
                <table className="catalog-table">
                  <thead><tr><th>Description</th><th>Qty</th><th>Unit Amount</th><th>Tax Amount</th><th>Total</th></tr></thead>
                  <tbody>
                    {document.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td>{line.quantity}</td>
                        <td>{formatCurrency(line.unitAmount, document.currency)}</td>
                        <td>{formatCurrency(line.taxAmount, document.currency)}</td>
                        <td>{formatCurrency(line.lineTotal, document.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <aside className="invoice-detail-aside">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Document</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Status</span><strong>{document.status}</strong></div>
                <div className="invoice-detail-list-row"><span>Purchase Bill</span><strong>{document.purchaseBillNumber}</strong></div>
                <div className="invoice-detail-list-row"><span>Currency</span><strong>{document.currency}</strong></div>
                <div className="invoice-detail-list-row"><span>Subtotal</span><strong>{formatCurrency(document.subtotalReduction, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Tax</span><strong>{formatCurrency(document.taxReduction, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Total</span><strong>{formatCurrency(document.totalReduction, document.currency)}</strong></div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
