import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PurchaseRelatedDocumentsSection } from "../components/PurchaseRelatedDocumentsSection";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { useBusinessDocumentPreview } from "../components/DocumentPreviewModal";
import type { GoodsReceivedNote } from "../types";


export function GoodsReceivedNoteDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<GoodsReceivedNote | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<GoodsReceivedNote>(`/purchases/grns/${id}`).then(setDocument);
  }, [id]);

  const { previewDocument, printDocument, preview } = useBusinessDocumentPreview();

  function getDocumentPreviewData() {
    if (!document) return null;
    const metadata: [string, string][] = [["Received date", new Date(document.documentDateUtc).toLocaleDateString()], ["Status", document.status]];
    if (document.purchaseOrderId) metadata.splice(1, 0, ["Source purchase order", document.purchaseOrderNumber]);
    return { companyName: document.companyName, title: "Goods Received Note", number: document.goodsReceivedNoteNumber, partyLabel: "Supplier", partyName: document.contactName, currency: document.currency, metadata, headings: ["Item", "Description", "Received Qty"], rows: document.lines.map((line) => ({ cells: [line.productNameSnapshot || "-", line.description, line.quantity], numeric: [2] })), notes: document.notes, acknowledgement: { preparedBy: "Received By", receivedBy: "Verified By" } };
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
    return <div className="page"><section className="card"><p className="muted">Loading GRN...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Goods Received Note</h2><p className="muted">{document.goodsReceivedNoteNumber}</p></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/grns")}>Back</button>
          {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={() => navigate(`/purchases/grns/${document.id}/edit`)}>Edit</button> : null}
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-primary" onClick={handleExportPdf}>Export PDF</button>
        </div>
      </header>
      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{document.contactName}</h3>
            <p className="muted">{document.status}</p>
            {document.purchaseOrderId ? <p className="muted">Source purchase order: {document.purchaseOrderNumber}</p> : null}
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
              <div className="invoice-detail-block-header"><h3>Received Items</h3></div>
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
      {preview}
    </div>
  );
}
