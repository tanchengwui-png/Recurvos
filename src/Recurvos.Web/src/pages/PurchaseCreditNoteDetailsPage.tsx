import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { useBusinessDocumentPreview } from "../components/DocumentPreviewModal";
import type { PurchaseCreditNote } from "../types";


export function PurchaseCreditNoteDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<PurchaseCreditNote | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<PurchaseCreditNote>(`/purchases/credit-notes/${id}`).then(setDocument);
  }, [id]);

  const { previewDocument, printDocument, preview } = useBusinessDocumentPreview();

  function getDocumentPreviewData() {
    if (!document) return null;
    return { companyName: document.companyName, title: "Purchase Credit Note", number: document.purchaseCreditNoteNumber, partyLabel: "Supplier", partyName: document.contactName, currency: document.currency, metadata: [["Credit note date", new Date(document.issuedAtUtc).toLocaleDateString()], ["Applied to bill", document.purchaseBillNumber], ["Reason", document.reason], ["Status", document.status]], headings: ["Description", "Qty", "Unit Amount", "Tax", "Credit Amount"], rows: document.lines.map((line) => ({ cells: [line.description, line.quantity, formatCurrency(line.unitAmount, document.currency), formatCurrency(line.taxAmount, document.currency), formatCurrency(line.lineTotal, document.currency)], numeric: [1, 2, 3, 4] })), totals: [{ label: "Total Credit", value: document.totalReduction, emphasis: true }] };
  }

  function handlePrint() {
    const previewDocumentData = getDocumentPreviewData();
    if (previewDocumentData) printDocument(previewDocumentData);
  }

  function handleExportPdf() {
    const previewDocumentData = getDocumentPreviewData();
    if (previewDocumentData) previewDocument(previewDocumentData);
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
              <div className="invoice-detail-block-header"><h3>Credit Note Items</h3></div>
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
      {preview}
    </div>
  );
}
