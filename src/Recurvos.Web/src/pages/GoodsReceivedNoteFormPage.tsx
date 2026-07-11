import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { GoodsReceivedNote, MasterDataSnapshot, PurchaseOrder, PurchaseOrderListItem, Warehouse } from "../types";

type LineForm = {
  purchaseOrderLineId: string;
  productNameSnapshot: string;
  description: string;
  orderedQuantity: number;
  receivedQuantity: number;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export function GoodsReceivedNoteFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialPurchaseOrderId = searchParams.get("purchaseOrderId") ?? "";
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState(initialPurchaseOrderId);
  const [purchaseOrderOptions, setPurchaseOrderOptions] = useState<PurchaseOrderListItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [record, setRecord] = useState<GoodsReceivedNote | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [documentDateUtc, setDocumentDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const isDeepLinked = Boolean(initialPurchaseOrderId);

  useEffect(() => {
    async function load() {
      const [orderOptions, snapshot] = await Promise.all([
        api.get<PurchaseOrderListItem[]>("/purchases/orders"),
        api.get<MasterDataSnapshot>("/master-data"),
      ]);
      const activeWarehouses = snapshot.warehouses.filter((item) => item.isActive);
      setPurchaseOrderOptions(orderOptions.filter((item) => item.status !== "Closed" && item.status !== "Cancelled" && item.status !== "FullyReceived"));
      setWarehouses(activeWarehouses);

      const existing = id ? await api.get<GoodsReceivedNote>(`/purchases/grns/${id}`) : null;
      const sourcePurchaseOrderId = existing?.purchaseOrderId ?? initialPurchaseOrderId ?? "";
      const defaultPurchaseOrderId = !existing && !sourcePurchaseOrderId
        ? (orderOptions.find((item) => item.status !== "Closed" && item.status !== "Cancelled" && item.status !== "FullyReceived")?.id ?? "")
        : sourcePurchaseOrderId;
      const order = defaultPurchaseOrderId ? await api.get<PurchaseOrder>(`/purchases/orders/${defaultPurchaseOrderId}`) : null;
      setRecord(existing);
      setPurchaseOrder(order);
      setSelectedPurchaseOrderId(defaultPurchaseOrderId);

      if (existing) {
        setCompanyId(existing.companyId);
        setWarehouseId(existing.warehouseId ?? activeWarehouses[0]?.id ?? "");
        setDocumentDateUtc(existing.documentDateUtc.slice(0, 10));
        setReferenceNo(existing.referenceNo);
        setNotes(existing.notes);
        setLines(existing.lines.map((line) => {
          const sourceLine = order?.lines.find((item) => item.id === line.purchaseOrderLineId);
          return {
            purchaseOrderLineId: line.purchaseOrderLineId ?? line.id,
            productNameSnapshot: line.productNameSnapshot,
            description: line.description,
            orderedQuantity: sourceLine?.quantity ?? line.quantity,
            receivedQuantity: sourceLine?.receivedQuantity ?? 0,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
          };
        }));
        return;
      }

      if (order) {
        setCompanyId(order.companyId);
        setWarehouseId(activeWarehouses[0]?.id ?? "");
        setReferenceNo(order.referenceNo);
        setNotes(order.notes);
        setLines(order.lines.map((line) => ({
          purchaseOrderLineId: line.id,
          productNameSnapshot: line.productNameSnapshot,
          description: line.description,
          orderedQuantity: line.quantity,
          receivedQuantity: line.receivedQuantity,
          quantity: Math.max(0, line.quantity - line.receivedQuantity),
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
        })).filter((line) => line.quantity > 0));
        return;
      }

      setCompanyId("");
      setWarehouseId("");
      setReferenceNo("");
      setNotes("");
      setLines([]);
    }
    void load();
  }, [id, initialPurchaseOrderId]);

  useEffect(() => {
    if (warehouseId || warehouses.length === 0) {
      return;
    }

    if (purchaseOrder || record) {
      setWarehouseId(warehouses[0]?.id ?? "");
    }
  }, [warehouseId, warehouses, purchaseOrder, record]);

  async function handlePurchaseOrderChange(nextPurchaseOrderId: string) {
    setError("");
    setSelectedPurchaseOrderId(nextPurchaseOrderId);

    if (!nextPurchaseOrderId) {
      setPurchaseOrder(null);
      setCompanyId("");
      setWarehouseId("");
      setReferenceNo("");
      setNotes("");
      setLines([]);
      return;
    }

    const order = await api.get<PurchaseOrder>(`/purchases/orders/${nextPurchaseOrderId}`);
    setPurchaseOrder(order);
    setCompanyId(order.companyId);
    setWarehouseId((current) => current || warehouses[0]?.id || "");
    setReferenceNo(order.referenceNo);
    setNotes(order.notes);
    setLines(order.lines.map((line) => ({
      purchaseOrderLineId: line.id,
      productNameSnapshot: line.productNameSnapshot,
      description: line.description,
      orderedQuantity: line.quantity,
      receivedQuantity: line.receivedQuantity,
      quantity: Math.max(0, line.quantity - line.receivedQuantity),
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
    })).filter((line) => line.quantity > 0));
  }

  function updateLine(index: number, nextQuantity: number) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const remaining = Math.max(0, line.orderedQuantity - line.receivedQuantity);
      return { ...line, quantity: Math.min(Math.max(0, nextQuantity), remaining) };
    }));
  }

  const currency = purchaseOrder?.currency ?? record?.currency ?? "";
  const editable = !record || record.status === "Draft";
  const subtotal = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
  const tax = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice * (line.taxRate / 100)), 0);
  const total = subtotal + tax;

  async function submit() {
    if (!purchaseOrder) {
      setError("Select a source purchase order first.");
      return;
    }
    if (!warehouseId) {
      setError("Select a warehouse.");
      return;
    }

    const activeLines = lines.filter((line) => line.quantity > 0);
    if (activeLines.length === 0) {
      setError("At least one GRN line with quantity is required.");
      return;
    }

    setConfirmState({
      title: id ? "Update GRN" : "Create GRN",
      description: id ? "Save changes to this GRN?" : "Create this GRN?",
      action: async () => {
        const payload = {
          companyId,
          purchaseOrderId: purchaseOrder.id,
          warehouseId,
          documentDateUtc: new Date(`${documentDateUtc}T00:00:00Z`).toISOString(),
          referenceNo,
          notes,
          lines: activeLines.map((line) => ({ purchaseOrderLineId: line.purchaseOrderLineId, quantity: Number(line.quantity) })),
        };
        if (id) await api.put(`/purchases/grns/${id}`, payload);
        else await api.post(`/purchases/grns`, payload);
        navigate("/purchases/grns");
      },
    });
  }

  async function markReceived() {
    if (!id) return;
    await api.patch(`/purchases/grns/${id}/status`, { status: "Received" });
    navigate("/purchases/grns");
  }

  const backPath = !id && isDeepLinked ? "/purchases/orders" : "/purchases/grns";

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>{id ? "Edit GRN" : "Create GRN"}</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate(backPath)}>{!id && isDeepLinked ? "Back to purchase orders" : "Back to GRNs"}</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          {id ? (
            <label className="form-label">Purchase Order<input className="text-input" value={purchaseOrder?.purchaseOrderNumber ?? record?.purchaseOrderNumber ?? ""} readOnly /></label>
          ) : (
            <label className="form-label">
              Purchase Order
              <select value={selectedPurchaseOrderId} onChange={(event) => { void handlePurchaseOrderChange(event.target.value); }}>
                <option value="">Select a purchase order</option>
                {purchaseOrderOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.purchaseOrderNumber} | {item.contactName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-label">Supplier<input className="text-input" value={purchaseOrder?.contactName ?? record?.contactName ?? ""} readOnly /></label>
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
        {!id ? <HelperText>Select a purchase order with remaining quantity to receive.</HelperText> : null}
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Lines</h3></div></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Product</th><th>Description</th><th>Ordered</th><th>Received</th><th>Current Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
            <tbody>
              {lines.map((line, index) => {
                const remaining = Math.max(0, line.orderedQuantity - line.receivedQuantity);
                return (
                  <tr key={line.purchaseOrderLineId}>
                    <td>{line.productNameSnapshot || "-"}</td>
                    <td>{line.description}</td>
                    <td>{line.orderedQuantity}</td>
                    <td>{line.receivedQuantity}</td>
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
          <button type="button" className="button button-secondary" onClick={() => navigate(backPath)}>Cancel</button>
          {id && record?.status === "Draft" ? <button type="button" className="button button-secondary" onClick={() => void markReceived()}>Mark as received</button> : null}
          {editable ? <button type="button" className="button button-primary" onClick={() => void submit()}>{id ? "Update GRN" : "Create GRN"}</button> : null}
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
