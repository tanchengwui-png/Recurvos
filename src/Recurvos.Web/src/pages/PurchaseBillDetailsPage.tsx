import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PurchaseRelatedDocumentsSection } from "../components/PurchaseRelatedDocumentsSection";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { useBusinessDocumentPreview } from "../components/DocumentPreviewModal";
import type { PurchaseBill } from "../types";


export function PurchaseBillDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<PurchaseBill | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<PurchaseBill>(`/purchases/bills/${id}`).then(setDocument);
  }, [id]);

  const { previewDocument, printDocument, preview } = useBusinessDocumentPreview();

  function getDocumentPreviewData() {
    if (!document) return null;
    return { companyName: document.companyName, title: "Purchase Bill", number: document.purchaseBillNumber, partyLabel: "Supplier", partyName: document.contactName, currency: document.currency, metadata: [["Bill date", new Date(document.issueDateUtc).toLocaleDateString()], ["Due date", new Date(document.dueDateUtc).toLocaleDateString()], ["Reference", document.referenceNo], ["Status", document.status]], headings: ["Item", "Description", "Qty", "Unit Cost", "Tax", "Amount"], rows: document.lines.map((line) => ({ cells: [line.productNameSnapshot || "-", line.description, line.quantity, formatCurrency(line.unitPrice, document.currency), `${line.taxRate}%`, formatCurrency(line.lineTotal, document.currency)], numeric: [2, 3, 4, 5] })), totals: [{ label: "Subtotal", value: document.subtotal }, { label: "Tax", value: document.taxAmount }, { label: "Total", value: document.totalAmount }, { label: "Balance Due", value: document.amountDue, emphasis: true }], notes: document.notes };
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
    return <div className="page"><section className="card"><p className="muted">Loading purchase bill...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Bill</h2><p className="muted">{document.purchaseBillNumber}</p></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/bills")}>Back</button>
          {document.amountDue > 0 && document.status !== "Cancelled" ? <button type="button" className="button button-secondary" onClick={() => navigate(`/purchases/credit-notes/new?purchaseBillId=${document.id}`)}>Create Credit Note</button> : null}
          {document.amountDue > 0 && document.status !== "Cancelled" ? <button type="button" className="button button-secondary" onClick={() => navigate(`/purchases/payments/new?supplierId=${document.contactId}&purchaseBillId=${document.id}`)}>Record Payment</button> : null}
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
            <div className="invoice-detail-stat"><p>Bill No</p><strong>{document.purchaseBillNumber}</strong></div>
            <div className="invoice-detail-stat"><p>Issue Date</p><strong>{new Date(document.issueDateUtc).toLocaleDateString()}</strong></div>
            <div className="invoice-detail-stat"><p>Total</p><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
          </div>
        </div>
        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Bill Items</h3></div>
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
            <PurchaseRelatedDocumentsSection title="Related Payments" documents={document.relatedDocuments.payments} currency={document.currency} />
          </div>
          <aside className="invoice-detail-aside">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Document</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Status</span><strong>{document.status}</strong></div>
                <div className="invoice-detail-list-row"><span>Currency</span><strong>{document.currency}</strong></div>
                <div className="invoice-detail-list-row"><span>Due Date</span><strong>{new Date(document.dueDateUtc).toLocaleDateString()}</strong></div>
                <div className="invoice-detail-list-row"><span>Subtotal</span><strong>{formatCurrency(document.subtotal, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Tax</span><strong>{formatCurrency(document.taxAmount, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Total</span><strong>{formatCurrency(document.totalAmount, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Outstanding</span><strong>{formatCurrency(document.amountDue, document.currency)}</strong></div>
              </div>
            </div>
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Payment Summary</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Payments made</span><strong>{formatCurrency(document.paymentSummary.paymentsMade, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Refunds received</span><strong>{formatCurrency(document.paymentSummary.refundsReceived, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Purchase credit notes</span><strong>{formatCurrency(document.paymentSummary.purchaseCreditNotes, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Net paid</span><strong>{formatCurrency(document.paymentSummary.netPaid, document.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Outstanding</span><strong>{formatCurrency(document.paymentSummary.outstanding, document.currency)}</strong></div>
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
