import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchasePayment } from "../types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function PurchasePaymentDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<PurchasePayment | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<PurchasePayment>(`/purchases/payments/${id}`).then(setDocument);
  }, [id]);

  function handlePrint() {
    window.print();
  }

  function handleExportPdf() {
    if (!document) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!popup) return;
    const rows = document.allocations.map((allocation) => `
      <tr>
        <td>${escapeHtml(allocation.purchaseBillNumber)}</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(allocation.amount, document.currency))}</td>
      </tr>
    `).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(document.purchasePaymentNumber)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{text-transform:uppercase;font-size:12px;color:#64748b}.meta{color:#475569;margin:6px 0}.totals{margin-top:24px;margin-left:auto;width:320px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0}</style></head><body><h1>${escapeHtml(document.purchasePaymentNumber)}</h1><p class="meta">Supplier: ${escapeHtml(document.contactName)}</p><p class="meta">Status: ${escapeHtml(document.status)}</p><p class="meta">Payment date: ${new Date(document.paymentDateUtc).toLocaleDateString()}</p><table><thead><tr><th>Purchase Bill</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="row"><span>Total</span><strong>${escapeHtml(formatCurrency(document.totalAmount, document.currency))}</strong></div></div></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading purchase payment...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Payment</h2><p className="muted">{document.purchasePaymentNumber}</p></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/payments")}>Back</button>
          {document.status === "Posted" && document.refundedAmount < document.totalAmount ? <button type="button" className="button button-secondary" onClick={() => navigate(`/purchases/refunds/new?purchasePaymentId=${document.id}`)}>Record Refund</button> : null}
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-primary" onClick={handleExportPdf}>Export PDF</button>
        </div>
      </header>
      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{document.contactName}</h3>
            <p className="muted">{document.status}</p>
            {document.referenceNo ? <p className="muted">Reference: {document.referenceNo}</p> : null}
          </div>
          <div className="invoice-detail-summary">
            <div className="invoice-detail-stat"><p>Payment No</p><strong>{document.purchasePaymentNumber}</strong></div>
            <div className="invoice-detail-stat"><p>Date</p><strong>{new Date(document.paymentDateUtc).toLocaleDateString()}</strong></div>
            <div className="invoice-detail-stat"><p>Total</p><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
            <div className="invoice-detail-stat"><p>Refunded</p><strong>{formatCurrency(document.refundedAmount, document.currency)}</strong></div>
          </div>
        </div>
        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Allocations</h3></div>
              <div className="table-scroll table-scroll-bounded">
                <table className="catalog-table">
                  <thead><tr><th>Purchase Bill</th><th>Amount</th></tr></thead>
                  <tbody>
                    {document.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td>{allocation.purchaseBillNumber}</td>
                        <td>{`${formatCurrency(allocation.amount, document.currency)}${allocation.refundedAmount > 0 ? ` | refunded ${formatCurrency(allocation.refundedAmount, document.currency)}` : ""}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Refunds</h3></div>
              <div className="invoice-detail-list">
                {document.refunds.length > 0 ? document.refunds.map((refund) => (
                  <div key={refund.id} className="invoice-detail-list-row">
                    <span>{refund.purchaseRefundNumber}</span>
                    <strong>{`${formatCurrency(refund.totalAmount, document.currency)} | ${refund.status}`}</strong>
                  </div>
                )) : <p className="muted">No purchase refunds recorded.</p>}
              </div>
            </div>
          </div>
          <aside className="invoice-detail-aside">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Document</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Status</span><strong>{document.status}</strong></div>
                <div className="invoice-detail-list-row"><span>Currency</span><strong>{document.currency}</strong></div>
                <div className="invoice-detail-list-row"><span>Total</span><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Refunded</span><strong>{formatCurrency(document.refundedAmount, document.currency)}</strong></div>
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
