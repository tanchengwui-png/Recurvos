import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SalesDocumentDetails, mapDeliveryOrderDetails } from "./SalesDocumentDetails";
import { ConfirmModal } from "../components/ConfirmModal";
import { api } from "../lib/api";
import type { DeliveryOrder } from "../types";

export function DeliveryOrderDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<DeliveryOrder | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    setDocument(await api.get<DeliveryOrder>(`/sales/delivery-orders/${id}`));
  }

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading delivery order...</p></section></div>;
  }

  return (
    <>
      <SalesDocumentDetails
        {...mapDeliveryOrderDetails(document)}
        actionButtons={(
          <>
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/delivery-orders/${document.id}/status`, { status: "Delivered" }); await load(); }}>Mark as Delivered</button> : null}
            {document.status !== "Draft" && document.status !== "Cancelled" && document.status !== "FullyInvoiced" ? <button type="button" className="button button-secondary" onClick={() => navigate(`/sales/invoices/new?source=delivery-order&sourceId=${document.id}`)}>Create Invoice</button> : null}
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
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </>
  );
}
