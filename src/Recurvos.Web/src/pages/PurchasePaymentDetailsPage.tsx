import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { useBusinessDocumentPreview } from "../components/DocumentPreviewModal";
import type { PurchasePayment } from "../types";


export function PurchasePaymentDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<PurchasePayment | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<PurchasePayment>(`/purchases/payments/${id}`).then(setDocument);
  }, [id]);

  const { previewDocument, printDocument, preview } = useBusinessDocumentPreview();

  function getDocumentPreviewData() {
    if (!document) return null;
    return { companyName: document.companyName, title: "Purchase Payment", number: document.purchasePaymentNumber, partyLabel: "Supplier", partyName: document.contactName, currency: document.currency, metadata: [["Payment date", new Date(document.paymentDateUtc).toLocaleDateString()], ["Reference", document.referenceNo], ["Status", document.status]], headings: ["Purchase Bill", "Amount"], rows: document.allocations.map((allocation) => ({ cells: [allocation.purchaseBillNumber, formatCurrency(allocation.amount, document.currency)], numeric: [1] })), totals: [{ label: "Payment Amount", value: document.totalAmount, emphasis: true }] };
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
      {preview}
    </div>
  );
}
