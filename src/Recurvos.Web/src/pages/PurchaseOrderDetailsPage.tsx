import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PurchaseRelatedDocumentsSection } from "../components/PurchaseRelatedDocumentsSection";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { useBusinessDocumentPreview } from "../components/DocumentPreviewModal";
import type { PurchaseOrder } from "../types";


export function PurchaseOrderDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<PurchaseOrder>(`/purchases/orders/${id}`).then(setDocument);
  }, [id]);

  const { previewDocument, printDocument, preview } = useBusinessDocumentPreview();

  function getDocumentPreviewData() {
    if (!document) return null;
    return { companyName: document.companyName, title: "Purchase Order", number: document.purchaseOrderNumber, partyLabel: "Supplier", partyName: document.contactName, currency: document.currency, metadata: [["Order date", new Date(document.documentDateUtc).toLocaleDateString()], ["Status", document.status], ["Reference", document.referenceNo]], headings: ["Item", "Description", "Qty", "Unit Cost", "Tax", "Amount"], rows: document.lines.map((line) => ({ cells: [line.productNameSnapshot || "-", line.description, line.quantity, formatCurrency(line.unitPrice, document.currency), `${line.taxRate}%`, formatCurrency(line.lineTotal, document.currency)], numeric: [2, 3, 4, 5] })), totals: [{ label: "Subtotal", value: document.subtotal }, { label: "Tax", value: document.taxAmount }, { label: "Total", value: document.totalAmount, emphasis: true }], notes: document.notes };
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
    return <div className="page"><section className="card"><p className="muted">Loading purchase order...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Order</h2><p className="muted">{document.purchaseOrderNumber}</p></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/orders")}>Back</button>
          {document.status !== "Closed" && document.status !== "Cancelled" && document.status !== "PartiallyReceived" && document.status !== "FullyReceived" ? <button type="button" className="button button-secondary" onClick={() => navigate(`/purchases/orders/${document.id}/edit`)}>Edit</button> : null}
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-primary" onClick={handleExportPdf}>Export PDF</button>
        </div>
      </header>
      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{document.contactName}</h3>
            <p className="muted">{document.status}</p>
          </div>
          <div className="invoice-detail-summary">
            <div className="invoice-detail-stat"><p>Purchase Order No</p><strong>{document.purchaseOrderNumber}</strong></div>
            <div className="invoice-detail-stat"><p>Date</p><strong>{new Date(document.documentDateUtc).toLocaleDateString()}</strong></div>
            <div className="invoice-detail-stat"><p>Total</p><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
          </div>
        </div>
        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Order Items</h3></div>
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
            <PurchaseRelatedDocumentsSection title="Related Goods Received Notes" documents={document.relatedDocuments.goodsReceivedNotes} currency={document.currency} />
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
