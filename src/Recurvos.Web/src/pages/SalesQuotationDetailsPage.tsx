import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SalesDocumentDetails, mapQuotationDetails } from "./SalesDocumentDetails";
import { ConfirmModal } from "../components/ConfirmModal";
import { ResponseToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { openCreatedRecord } from "../lib/postCreateNavigation";
import { formatCurrency } from "../lib/format";
import type { SalesOrder, SalesQuotation, Warehouse } from "../types";

export function SalesQuotationDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [document, setDocument] = useState<SalesQuotation | null>(null);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [deliveryConversionOpen, setDeliveryConversionOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [convertLines, setConvertLines] = useState<Record<string, { selected: boolean; quantity: number }>>({});
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    const quotation = await api.get<SalesQuotation>(`/sales/quotations/${id}`);
    setDocument(quotation);
    setConvertLines(Object.fromEntries(quotation.lines.map((line) => [line.id, { selected: (line.remainingQuantity ?? 0) > 0, quantity: line.remainingQuantity ?? 0 }])));
    const warehouseList = await api.get<Warehouse[]>("/warehouses");
    setWarehouses(warehouseList.filter((warehouse) => warehouse.isActive));
    setWarehouseId((current) => current || warehouseList.find((warehouse) => warehouse.isActive)?.id || "");
  }

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  if (!document) {
    return <div className="page"><section className="card"><p className="muted">Loading quotation...</p></section></div>;
  }

  const hasRemainingQuantity = document.lines.some((line) => (line.remainingQuantity ?? 0) > 0);
  const conversionLineSelector = (
    <div className="table-scroll"><table className="catalog-table"><thead><tr><th>Select</th><th>Item</th><th>Quoted</th><th>Converted</th><th>Remaining</th><th>Convert Qty</th></tr></thead><tbody>{document.lines.map((line) => { const state = convertLines[line.id] ?? { selected: false, quantity: 0 }; const remaining = line.remainingQuantity ?? 0; return <tr key={line.id}><td><input type="checkbox" checked={state.selected} disabled={remaining <= 0} onChange={(event) => setConvertLines({ ...convertLines, [line.id]: { ...state, selected: event.target.checked } })} /></td><td>{line.productNameSnapshot || line.description}</td><td>{line.quantity}</td><td>{line.convertedQuantity ?? 0}</td><td>{remaining}</td><td>{remaining <= 0 ? "—" : <input type="number" min="0.01" max={remaining} step="0.01" value={state.quantity} disabled={!state.selected} onChange={(event) => setConvertLines({ ...convertLines, [line.id]: { ...state, quantity: Math.min(Number(event.target.value), remaining) } })} />}</td></tr>; })}</tbody></table></div>
  );

  return (
    <>
      <ResponseToast message={message} tone="success" />
      <SalesDocumentDetails
        {...mapQuotationDetails(document)}
        actionButtons={(
          <>
            {document.status === "Draft" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Sent" }); await load(); }}>Mark as Sent</button> : null}
            {document.status === "Sent" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Accepted" }); await load(); }}>Mark as Accepted</button> : null}
            {document.status === "Sent" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Rejected" }); await load(); }}>Reject</button> : null}
            {document.status === "Sent" ? <button type="button" className="button button-secondary" onClick={async () => { await api.patch(`/sales/quotations/${document.id}/status`, { status: "Expired" }); await load(); }}>Expire</button> : null}
            {document.status === "Accepted" && hasRemainingQuantity ? <button type="button" className="button button-secondary" onClick={() => setConversionOpen(true)}>Convert to Sales Order</button> : null}
            {document.status === "Accepted" && hasRemainingQuantity ? <button type="button" className="button button-secondary" onClick={() => setDeliveryConversionOpen(true)}>Create Delivery Order</button> : null}
            {document.status !== "Accepted" && hasRemainingQuantity ? <button type="button" className="button button-secondary" disabled title="Mark this quotation as accepted before converting it to a Sales Order.">Convert to Sales Order</button> : null}
          </>
        )}
      />
      <section className="page"><section className="card invoice-detail-panel">
        <div className="invoice-detail-block-header"><h3>Sales Orders</h3></div>
        {document.salesOrders.length === 0 ? <p className="muted">No sales orders have been created from this quotation.</p> : <div className="table-scroll"><table className="catalog-table"><thead><tr><th>Sales Order</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead><tbody>{document.salesOrders.map((order) => <tr key={order.id}><td><a className="inline-link" href={`/sales/orders/${order.id}`} onClick={(event) => { event.preventDefault(); navigate(`/sales/orders/${order.id}`, { state: { backgroundLocation: location } }); }}>{order.salesOrderNumber}</a></td><td>{new Date(order.documentDateUtc).toLocaleDateString()}</td><td>{order.status}</td><td>{formatCurrency(order.totalAmount, order.currency)}</td></tr>)}</tbody></table></div>}
      </section></section>
      <ConfirmModal open={conversionOpen} title={`Convert ${document.quotationNumber} to Sales Order`} description="Select the quotation lines and quantities to include." confirmLabel="Create Sales Order" details={conversionLineSelector} onConfirm={async () => {
        const lines = Object.entries(convertLines).filter(([, value]) => value.selected && value.quantity > 0).map(([salesQuotationLineId, value]) => ({ salesQuotationLineId, quantity: value.quantity }));
        if (!lines.length) throw new Error("Select at least one line with a positive quantity.");
        const result = await api.post<SalesOrder>(`/sales/quotations/${document.id}/convert-to-sales-order`, { documentDateUtc: new Date().toISOString(), referenceNo: "", notes: "", lines });
        setConversionOpen(false); setMessage(`Sales order created: ${result.salesOrderNumber}.`); await load(); openCreatedRecord(navigate, "/sales/orders", "/sales/orders", result.id);
      }} onCancel={() => setConversionOpen(false)} />
      <ConfirmModal open={deliveryConversionOpen} title={`Create Delivery Order from ${document.quotationNumber}`} description="Select a warehouse, then deliver the selected remaining quotation quantities." confirmLabel="Create Delivery Order" details={<><label className="form-label">Warehouse<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Select a warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>{conversionLineSelector}</>} onConfirm={async () => {
        if (!warehouseId) throw new Error("Select a warehouse.");
        const lines = Object.entries(convertLines).filter(([, value]) => value.selected && value.quantity > 0).map(([salesQuotationLineId, value]) => ({ salesQuotationLineId, quantity: value.quantity }));
        if (!lines.length) throw new Error("Select at least one line with a positive quantity.");
        const result = await api.post<{ id: string; deliveryOrderNumber: string }>(`/sales/quotations/${document.id}/convert-to-delivery-order`, { warehouseId, documentDateUtc: new Date().toISOString(), referenceNo: "", notes: "", lines });
        setDeliveryConversionOpen(false); setMessage(`Delivery order created: ${result.deliveryOrderNumber}.`); await load(); openCreatedRecord(navigate, "/sales/delivery-orders", "/sales/delivery-orders", result.id);
      }} onCancel={() => setDeliveryConversionOpen(false)} />
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </>
  );
}
