import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SalesDocumentDetails, mapOrderDetails } from "./SalesDocumentDetails";
import { ConfirmModal } from "../components/ConfirmModal";
import { api } from "../lib/api";
import type { SalesOrder } from "../types";

export function SalesOrderDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<SalesOrder | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    setDocument(await api.get<SalesOrder>(`/sales/orders/${id}`));
  }

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading sales order...</p></section></div>;
  }

  return (
    <>
      <SalesDocumentDetails
        {...mapOrderDetails(document)}
        actionButtons={(
          <>
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/orders/${document.id}/status`, { status: "Confirmed" }); await load(); }}>Confirm</button> : null}
            {(document.status === "Confirmed" || document.status === "PartiallyDelivered") ? <button type="button" className="button button-secondary" onClick={() => navigate(`/sales/delivery-orders/new?salesOrderId=${document.id}`)}>Create Delivery Order</button> : null}
            {(document.status === "Confirmed" || document.status === "PartiallyDelivered" || document.status === "FullyDelivered") ? <button type="button" className="button button-secondary" onClick={() => navigate(`/sales/invoices/new?source=sales-order&sourceId=${document.id}`)}>Create Invoice</button> : null}
            {(document.status === "Confirmed" || document.status === "PartiallyDelivered" || document.status === "FullyDelivered") ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/orders/${document.id}/status`, { status: "Closed" }); await load(); }}>Close</button> : null}
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
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </>
  );
}
