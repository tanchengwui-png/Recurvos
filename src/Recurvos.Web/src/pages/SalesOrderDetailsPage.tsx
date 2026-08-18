import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SalesDocumentDetails, mapOrderDetails } from "./SalesDocumentDetails";
import { ConfirmModal } from "../components/ConfirmModal";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { SalesOrder, SalesQuotation } from "../types";

export function SalesOrderDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<SalesOrder | null>(null);
  const [sourceQuotation, setSourceQuotation] = useState<SalesQuotation | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    const order = await api.get<SalesOrder>(`/sales/orders/${id}`);
    setDocument(order);
    setSourceQuotation(order.salesQuotationId ? await api.get<SalesQuotation>(`/sales/quotations/${order.salesQuotationId}`) : null);
  }

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading sales order...</p></section></div>;
  }
  const hasDirectInvoiceableQuantity = document.lines.some((line) => line.quantity > line.deliveredQuantity + line.invoicedQuantity);
  const hasOutstandingQuantity = document.lines.some((line) => line.invoicedQuantity < line.quantity);

  return (
    <>
      <SalesDocumentDetails
        {...mapOrderDetails(document)}
        relatedDocument={sourceQuotation ? { label: "Source Quotation", number: sourceQuotation.quotationNumber, href: `/sales/quotations/${sourceQuotation.id}` } : undefined}
        actionButtons={(
          <>
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/orders/${document.id}/status`, { status: "Confirmed" }); await load(); }}>Confirm</button> : null}
            {(document.status === "Confirmed" || document.status === "PartiallyDelivered") ? <button type="button" className="button button-secondary" onClick={() => navigate(`/sales/delivery-orders/new?salesOrderId=${document.id}`)}>Create Delivery Order</button> : null}
            {hasDirectInvoiceableQuantity && (document.status === "Confirmed" || document.status === "PartiallyDelivered") ? <button type="button" className="button button-secondary" onClick={() => navigate(`/sales/invoices/new?source=sales-order&sourceId=${document.id}`)}>Create Invoice</button> : null}
            {hasOutstandingQuantity && (document.status === "Confirmed" || document.status === "PartiallyDelivered" || document.status === "FullyDelivered") ? <button type="button" className="button button-secondary" onClick={() => setConfirmState({ title: "Close sales order?", description: "This sales order still has outstanding quantities. Closing it will prevent any further deliveries or invoices from being created from the remaining balance.", action: async () => { await api.patch(`/sales/orders/${document.id}/status`, { status: "Closed" }); setConfirmState(null); await load(); } })}>Close</button> : null}
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={() => setConfirmState({
              title: "Cancel sales order",
              description: `Cancel ${document.salesOrderNumber}?`,
              action: async () => {
                await api.patch(`/sales/orders/${document.id}/status`, { status: "Cancelled" });
                setConfirmState(null);
                await load();
              },
            })}>Cancel</button> : null}
          </>
        )}
      />
      <section className="page"><section className="card invoice-detail-panel"><div className="invoice-detail-block-header"><h3>Invoices</h3></div>
        {!document.invoices?.length ? <p className="muted">No invoices are associated with this sales order.</p> : <div className="table-scroll"><table className="catalog-table"><thead><tr><th>Invoice</th><th>Source</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead><tbody>{document.invoices.map((invoice) => <tr key={invoice.id}><td><a className="inline-link" href={`/invoices?invoiceId=${invoice.id}`}>{invoice.invoiceNumber}</a></td><td>{invoice.deliveryOrderId ? "Delivery Order" : "Sales Order"}</td><td>{new Date(invoice.issueDateUtc).toLocaleDateString()}</td><td>{invoice.status}</td><td>{formatCurrency(invoice.totalAmount, invoice.currency)}</td></tr>)}</tbody></table></div>}
      </section></section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </>
  );
}
