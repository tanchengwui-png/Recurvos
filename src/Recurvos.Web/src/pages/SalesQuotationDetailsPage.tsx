import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SalesDocumentDetails, mapQuotationDetails } from "./SalesDocumentDetails";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { SalesOrder, SalesQuotation } from "../types";

export function SalesQuotationDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [document, setDocument] = useState<SalesQuotation | null>(null);
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    setDocument(await api.get<SalesQuotation>(`/sales/quotations/${id}`));
  }

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading quotation...</p></section></div>;
  }

  return (
    <>
      {message ? <div className="page"><HelperText>{message}</HelperText></div> : null}
      <SalesDocumentDetails
        {...mapQuotationDetails(document)}
        actionButtons={(
          <>
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Sent" }); await load(); }}>Mark as Sent</button> : null}
            {document.status === "Sent" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Accepted" }); await load(); }}>Mark as Accepted</button> : null}
            {document.status === "Sent" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Rejected" }); await load(); }}>Reject</button> : null}
            {document.status === "Sent" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Expired" }); await load(); }}>Expire</button> : null}
            {(document.status === "Sent" || document.status === "Accepted") ? <button type="button" className="button button-secondary" onClick={() => setConfirmState({
              title: "Convert quotation",
              description: `Convert ${document.quotationNumber} to a sales order?`,
              action: async () => {
                const result = await api.post<SalesOrder>(`/sales/quotations/${document.id}/convert-to-sales-order`, { documentDateUtc: new Date().toISOString(), referenceNo: "", notes: "" });
                setConfirmState(null);
                setMessage(`Sales order created: ${result.salesOrderNumber}.`);
                await load();
                navigate(`/sales/orders/${result.id}`);
              },
            })}>Convert to Sales Order</button> : null}
          </>
        )}
      />
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </>
  );
}
