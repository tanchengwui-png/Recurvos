import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PurchaseRelatedDocumentsSection } from "../components/PurchaseRelatedDocumentsSection";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { GoodsReceivedNote } from "../types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function GoodsReceivedNoteDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<GoodsReceivedNote | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<GoodsReceivedNote>(`/purchases/grns/${id}`).then(setDocument);
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
        <td>${escapeHtml(line.productNameSnapshot || "-")}</td>
        <td>${escapeHtml(line.description)}</td>
        <td style="text-align:right">${line.quantity}</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(line.unitPrice, document.currency))}</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(line.lineTotal, document.currency))}</td>
      </tr>
    `).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(document.goodsReceivedNoteNumber)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{text-transform:uppercase;font-size:12px;color:#64748b} .meta{color:#475569;margin:6px 0}.totals{margin-top:24px;margin-left:auto;width:320px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0}</style></head><body><h1>${escapeHtml(document.goodsReceivedNoteNumber)}</h1><p class="meta">Supplier: ${escapeHtml(document.contactName)}</p><p class="meta">Status: ${escapeHtml(document.status)}</p><p class="meta">Date: ${new Date(document.documentDateUtc).toLocaleDateString()}</p><p class="meta">Source purchase order: ${escapeHtml(document.purchaseOrderNumber)}</p><table><thead><tr><th>Product</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(document.subtotal, document.currency))}</strong></div><div class="row"><span>Tax</span><strong>${escapeHtml(formatCurrency(document.taxAmount, document.currency))}</strong></div><div class="row"><span>Total</span><strong>${escapeHtml(formatCurrency(document.totalAmount, document.currency))}</strong></div></div></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading GRN...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Goods Received Note</h2><p className="muted">{document.goodsReceivedNoteNumber}</p></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/grns")}>Back</button>
          <button type="button" className="button button-secondary" onClick={() => navigate(`/purchases/grns/${document.id}/edit`)}>Edit</button>
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-primary" onClick={handleExportPdf}>Export PDF</button>
        </div>
      </header>
      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{document.contactName}</h3>
            <p className="muted">{document.status}</p>
            <p className="muted">Source purchase order: {document.purchaseOrderNumber}</p>
          </div>
          <div className="invoice-detail-summary">
            <div className="invoice-detail-stat"><p>GRN No</p><strong>{document.goodsReceivedNoteNumber}</strong></div>
            <div className="invoice-detail-stat"><p>Date</p><strong>{new Date(document.documentDateUtc).toLocaleDateString()}</strong></div>
            <div className="invoice-detail-stat"><p>Total</p><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
          </div>
        </div>
        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Lines</h3></div>
              <div className="table-scroll table-scroll-bounded">
                <table className="catalog-table">
                  <thead><tr><th>Product</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax %</th><th>Total</th></tr></thead>
                  <tbody>
                    {document.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.productNameSnapshot || "-"}</td>
                        <td>{line.description}</td>
                        <td>{line.quantity}</td>
                        <td>{formatCurrency(line.unitPrice, document.currency)}</td>
                        <td>{line.taxRate}%</td>
                        <td>{formatCurrency(line.lineTotal, document.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <PurchaseRelatedDocumentsSection title="Related Bills" documents={document.relatedDocuments.bills} currency={document.currency} />
          </div>
          <aside className="invoice-detail-aside">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Document</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Status</span><strong>{document.status}</strong></div>
                <div className="invoice-detail-list-row"><span>Currency</span><strong>{document.currency}</strong></div>
                {document.referenceNo ? <div className="invoice-detail-list-row"><span>Reference</span><strong>{document.referenceNo}</strong></div> : null}
                <div className="invoice-detail-list-row"><span>Subtotal</span><strong>{formatCurrency(document.subtotal, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Tax</span><strong>{formatCurrency(document.taxAmount, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Total</span><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
              </div>
            </div>
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Supplier</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Name</span><strong>{document.contactName}</strong></div>
                {document.contactEmail ? <div className="invoice-detail-list-row"><span>Email</span><strong>{document.contactEmail}</strong></div> : null}
                {document.contactPhoneNumber ? <div className="invoice-detail-list-row"><span>Phone</span><strong>{document.contactPhoneNumber}</strong></div> : null}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
