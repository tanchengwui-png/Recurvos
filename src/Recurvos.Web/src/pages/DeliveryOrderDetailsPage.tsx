import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SalesDocumentDetails, mapDeliveryOrderDetails } from "./SalesDocumentDetails";
import { ConfirmModal } from "../components/ConfirmModal";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { DeliveryOrder, SalesOrder, SalesQuotation } from "../types";

export function DeliveryOrderDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<DeliveryOrder | null>(null);
  const [sourceQuotation, setSourceQuotation] = useState<SalesQuotation | null>(null);
  const [sourceSalesOrder, setSourceSalesOrder] = useState<SalesOrder | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    const order = await api.get<DeliveryOrder>(`/sales/delivery-orders/${id}`);
    setDocument(order);
    setSourceQuotation(order.salesQuotationId ? await api.get<SalesQuotation>(`/sales/quotations/${order.salesQuotationId}`) : null);
    setSourceSalesOrder(order.salesOrderId ? await api.get<SalesOrder>(`/sales/orders/${order.salesOrderId}`) : null);
  }

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading delivery order...</p></section></div>;
  }

  const hasInvoiceableQuantity = document.status !== "Draft" && document.status !== "Cancelled" && document.lines.some((line) => line.quantity > line.invoicedQuantity);

  return (
    <>
      <SalesDocumentDetails
        {...mapDeliveryOrderDetails(document)}
        relatedDocument={sourceQuotation ? { label: "Source Quotation", number: sourceQuotation.quotationNumber, href: `/sales/quotations/${sourceQuotation.id}` } : sourceSalesOrder ? { label: "Source Sales Order", number: sourceSalesOrder.salesOrderNumber, href: `/sales/orders/${sourceSalesOrder.id}` } : undefined}
        actionButtons={(
          <>
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/delivery-orders/${document.id}/status`, { status: "Delivered" }); await load(); }}>Mark as Delivered</button> : null}
            {hasInvoiceableQuantity ? <button type="button" className="button button-secondary" onClick={() => navigate(`/sales/invoices/new?source=delivery-order&sourceId=${document.id}`)}>Create Invoice</button> : null}
            {document.status === "Delivered" ? <button type="button" className="button button-secondary" onClick={() => setConfirmState({
              title: "Cancel delivery order",
              description: `Cancel ${document.deliveryOrderNumber}? This will reverse delivered quantities on the sales order.`,
              action: async () => {
                await api.patch(`/sales/delivery-orders/${document.id}/status`, { status: "Cancelled" });
                setConfirmState(null);
                await load();
              },
            })}>Cancel Delivery Order</button> : null}
          </>
        )}
      />
      <section className="page"><section className="card invoice-detail-panel"><div className="invoice-detail-block-header"><h3>Invoices</h3></div>
        {!document.invoices?.length ? <p className="muted">No invoices have been created from this delivery order.</p> : <div className="table-scroll"><table className="catalog-table"><thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead><tbody>{document.invoices.map((invoice) => <tr key={invoice.id}><td><a className="inline-link" href={`/invoices?invoiceId=${invoice.id}`}>{invoice.invoiceNumber}</a></td><td>{new Date(invoice.issueDateUtc).toLocaleDateString()}</td><td>{invoice.status}</td><td>{formatCurrency(invoice.totalAmount, invoice.currency)}</td></tr>)}</tbody></table></div>}
      </section></section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </>
  );
}
