import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { DeliveryOrder, MasterDataSnapshot, SalesOrder, SalesOrderListItem, Warehouse } from "../types";

type LineForm = {
  salesOrderLineId: string;
  productNameSnapshot: string;
  description: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export function DeliveryOrderFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const salesOrderId = searchParams.get("salesOrderId") ?? "";
  const [salesOrderOptions, setSalesOrderOptions] = useState<SalesOrderListItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState(salesOrderId);
  const [companyId, setCompanyId] = useState("");
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<DeliveryOrder | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [documentDateUtc, setDocumentDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    async function load() {
      const [orderOptions, record, snapshot] = await Promise.all([
        id ? Promise.resolve([] as SalesOrderListItem[]) : api.get<SalesOrderListItem[]>("/sales/orders"),
        id ? api.get<DeliveryOrder>(`/sales/delivery-orders/${id}`) : Promise.resolve(null),
        api.get<MasterDataSnapshot>("/master-data"),
      ]);
      const activeWarehouses = snapshot.warehouses.filter((item) => item.isActive);
      const eligibleOrderOptions = orderOptions.filter((item) => item.status === "Confirmed" || item.status === "PartiallyDelivered");
      setSalesOrderOptions(eligibleOrderOptions);
      setWarehouses(activeWarehouses);

      const sourceOrderId = record?.salesOrderId ?? salesOrderId;
      const order = sourceOrderId ? await api.get<SalesOrder>(`/sales/orders/${sourceOrderId}`) : null;

      setDeliveryOrder(record);
      setSalesOrder(order);
      setSelectedSalesOrderId(sourceOrderId);

      if (record) {
        setCompanyId(record.companyId);
        setWarehouseId(record.warehouseId ?? activeWarehouses[0]?.id ?? "");
        setDocumentDateUtc(record.documentDateUtc.slice(0, 10));
        setReferenceNo(record.referenceNo);
        setNotes(record.notes);
        setLines(record.lines.map((line) => {
          const sourceLine = order?.lines.find((item) => item.id === line.salesOrderLineId);
          return {
            salesOrderLineId: line.salesOrderLineId ?? "",
            productNameSnapshot: line.productNameSnapshot,
            description: line.description,
            orderedQuantity: sourceLine?.quantity ?? line.quantity,
            deliveredQuantity: sourceLine?.deliveredQuantity ?? 0,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
          };
        }));
        return;
      }

      if (order) {
        applySalesOrder(order);
        return;
      }

      setLines([]);
    }

    void load();
  }, [id, salesOrderId]);

  useEffect(() => {
    if (warehouseId || warehouses.length === 0) {
      return;
    }

    if (salesOrder || deliveryOrder) {
      setWarehouseId(warehouses[0]?.id ?? "");
    }
  }, [warehouseId, warehouses, salesOrder, deliveryOrder]);

  function applySalesOrder(order: SalesOrder) {
    setSalesOrder(order);
    setSelectedSalesOrderId(order.id);
    setCompanyId(order.companyId);
    setWarehouseId((current) => current || warehouses[0]?.id || "");
    setDocumentDateUtc(new Date().toISOString().slice(0, 10));
    setReferenceNo(order.referenceNo);
    setNotes(order.notes);
    setLines(order.lines
      .map((line) => ({
        salesOrderLineId: line.id,
        productNameSnapshot: line.productNameSnapshot,
        description: line.description,
        orderedQuantity: line.quantity,
        deliveredQuantity: line.deliveredQuantity,
        quantity: Math.max(0, line.quantity - line.deliveredQuantity),
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
      }))
      .filter((line) => line.quantity > 0));
  }

  async function handleSalesOrderChange(nextSalesOrderId: string) {
    setSelectedSalesOrderId(nextSalesOrderId);
    if (!nextSalesOrderId) {
      setSalesOrder(null);
      setCompanyId("");
      setWarehouseId("");
      setReferenceNo("");
      setNotes("");
      setLines([]);
      return;
    }

    const order = await api.get<SalesOrder>(`/sales/orders/${nextSalesOrderId}`);
    applySalesOrder(order);
  }

  function updateLine(index: number, nextQuantity: number) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const remaining = Math.max(0, line.orderedQuantity - line.deliveredQuantity);
      return { ...line, quantity: Math.min(Math.max(0, nextQuantity), remaining) };
    }));
  }

  const currency = salesOrder?.currency ?? deliveryOrder?.currency ?? "";
  const editable = !deliveryOrder || deliveryOrder.status === "Draft";
  const subtotal = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
  const tax = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice * (line.taxRate / 100)), 0);
  const total = subtotal + tax;

  async function submit() {
    if (!salesOrder) {
      setError("Select a source sales order first.");
      return;
    }
    if (!warehouseId) {
      setError("Select a warehouse.");
      return;
    }

    const activeLines = lines.filter((line) => line.quantity > 0);
    if (activeLines.length === 0) {
      setError("At least one delivery line with quantity is required.");
      return;
    }

    setConfirmState({
      title: id ? "Update delivery order" : "Create delivery order",
      description: id ? "Save changes to this delivery order?" : "Create this delivery order?",
      action: async () => {
        const payload = {
          companyId,
          salesOrderId: salesOrder.id,
          warehouseId,
          documentDateUtc: new Date(`${documentDateUtc}T00:00:00Z`).toISOString(),
          referenceNo,
          notes,
          lines: activeLines.map((line) => ({
            salesOrderLineId: line.salesOrderLineId,
            quantity: Number(line.quantity),
          })),
        };
        if (id) {
          await api.put(`/sales/delivery-orders/${id}`, payload);
        } else {
          await api.post(`/sales/delivery-orders`, payload);
        }
        navigate("/sales/delivery-orders");
      },
    });
  }

  async function markDelivered() {
    if (!id) return;
    await api.patch(`/sales/delivery-orders/${id}/status`, { status: "Delivered" });
    navigate("/sales/delivery-orders");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>{id ? "Edit Delivery Order" : "Create Delivery Order"}</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/sales/delivery-orders")}>Back to delivery orders</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          {id ? (
            <label className="form-label">Sales Order<input className="text-input" value={salesOrder?.salesOrderNumber ?? deliveryOrder?.salesOrderNumber ?? ""} readOnly /></label>
          ) : (
            <label className="form-label">
              Sales Order
              <select value={selectedSalesOrderId} onChange={(event) => { void handleSalesOrderChange(event.target.value); }}>
                <option value="">Select a sales order</option>
                {salesOrderOptions.map((item) => <option key={item.id} value={item.id}>{`${item.salesOrderNumber} | ${item.contactName} | ${item.status}`}</option>)}
              </select>
            </label>
          )}
          <label className="form-label">Contact<input className="text-input" value={salesOrder?.contactName ?? deliveryOrder?.contactName ?? ""} readOnly /></label>
          <label className="form-label">
            Warehouse
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={!editable}>
              <option value="">Select a warehouse</option>
              {warehouses.map((item) => <option key={item.id} value={item.id}>{`${item.code} | ${item.name}`}</option>)}
            </select>
          </label>
          <label className="form-label">Document Date<input type="date" className="text-input" value={documentDateUtc} onChange={(event) => setDocumentDateUtc(event.target.value)} disabled={!editable} /></label>
          <label className="form-label">Currency<input className="text-input" value={currency} readOnly /></label>
          <label className="form-label">Reference<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} disabled={!editable} /></label>
          <label className="form-label master-data-form-wide">Notes<input className="text-input" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!editable} /></label>
        </div>
        {!id ? <HelperText>Select a confirmed sales order with remaining quantity to prepare the delivery order.</HelperText> : null}
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Lines</h3></div></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Product</th><th>Description</th><th>Ordered</th><th>Delivered</th><th>Current Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
            <tbody>
              {lines.map((line, index) => {
                const remaining = Math.max(0, line.orderedQuantity - line.deliveredQuantity);
                return (
                  <tr key={line.salesOrderLineId}>
                    <td>{line.productNameSnapshot || "-"}</td>
                    <td>{line.description}</td>
                    <td>{line.orderedQuantity}</td>
                    <td>{line.deliveredQuantity}</td>
                    <td><input type="number" min="0" max={remaining} step="0.01" className="text-input" value={line.quantity} onChange={(event) => updateLine(index, Number(event.target.value))} disabled={!editable} /></td>
                    <td>{formatCurrency(line.unitPrice, currency)}</td>
                    <td>{formatCurrency((line.quantity * line.unitPrice) * (1 + line.taxRate / 100), currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="page-meta-row page-meta-row-inline">
          <div className="page-meta-chips">
            <span className="page-meta-chip"><span className="page-meta-chip-label">Subtotal</span><strong className="page-meta-chip-value">{formatCurrency(subtotal, currency)}</strong></span>
            <span className="page-meta-chip"><span className="page-meta-chip-label">Tax</span><strong className="page-meta-chip-value">{formatCurrency(tax, currency)}</strong></span>
            <span className="page-meta-chip"><span className="page-meta-chip-label">Total</span><strong className="page-meta-chip-value">{formatCurrency(total, currency)}</strong></span>
          </div>
        </div>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/sales/delivery-orders")}>Cancel</button>
          {id && deliveryOrder?.status === "Draft" ? <button type="button" className="button button-secondary" onClick={() => void markDelivered()}>Mark as delivered</button> : null}
          {editable ? <button type="button" className="button button-primary" onClick={() => void submit()}>{id ? "Update delivery order" : "Create delivery order"}</button> : null}
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
