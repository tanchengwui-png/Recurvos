import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { Customer, GoodsReceivedNote, GoodsReceivedNoteListItem, MasterDataSnapshot, PaymentTerm, PurchaseBill, PurchaseOrder, PurchaseOrderListItem } from "../types";

type SourceType = "purchase-order" | "grn";

type LineForm = {
  id: string;
  description: string;
  quantity: number;
  alreadyBilled: number;
  remainingQuantity: number;
  selectedQuantity: number;
  unitAmount: number;
  taxRate: number;
};

export function PurchaseBillFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSource = (searchParams.get("source") as SourceType | null) ?? "purchase-order";
  const sourceId = searchParams.get("sourceId") ?? "";
  const [source, setSource] = useState<SourceType>(initialSource);
  const [selectedSourceId, setSelectedSourceId] = useState(sourceId);
  const [purchaseOrderOptions, setPurchaseOrderOptions] = useState<PurchaseOrderListItem[]>([]);
  const [grnOptions, setGrnOptions] = useState<GoodsReceivedNoteListItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [grn, setGrn] = useState<GoodsReceivedNote | null>(null);
  const [dueDateUtc, setDueDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [paymentTermId, setPaymentTermId] = useState("");
  const [isDueDateManuallyEdited, setIsDueDateManuallyEdited] = useState(false);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const isDeepLinked = Boolean(sourceId);

  useEffect(() => {
    async function load() {
      const [orders, notes, customerList, snapshot] = await Promise.all([
        api.get<PurchaseOrderListItem[]>("/purchases/orders"),
        api.get<GoodsReceivedNoteListItem[]>("/purchases/grns"),
        api.get<Customer[]>("/customers"),
        api.get<MasterDataSnapshot>("/master-data"),
      ]);

      const eligibleOrders = orders.filter((item) => item.status !== "Cancelled");
      const eligibleGrns = notes.filter((item) => item.status === "Received" || item.status === "PartiallyBilled");
      const activePaymentTerms = snapshot.paymentTerms.filter((item) => item.isActive);
      setPurchaseOrderOptions(eligibleOrders);
      setGrnOptions(eligibleGrns);
      setCustomers(customerList);
      setPaymentTerms(activePaymentTerms);

      const defaultDueDate = new Date();
      defaultDueDate.setDate(defaultDueDate.getDate() + 7);
      setDueDateUtc(defaultDueDate.toISOString().slice(0, 10));
      setIsDueDateManuallyEdited(false);

      if (!sourceId) {
        const defaultSource = eligibleOrders.length > 0 ? "purchase-order" : "grn";
        const defaultSourceId = defaultSource === "purchase-order"
          ? (eligibleOrders[0]?.id ?? "")
          : (eligibleGrns[0]?.id ?? "");
        if (defaultSourceId) {
          await loadSourceDocument(defaultSource, defaultSourceId);
        } else {
          await loadSourceDocument(defaultSource, "");
        }
        return;
      }

      await loadSourceDocument(initialSource, sourceId);
    }

    void load();
  }, []);

  function getDueDateForTerm(termId: string, fallbackDate: string) {
    const term = paymentTerms.find((item) => item.id === termId);
    if (!term) {
      return fallbackDate;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + term.days);
    return dueDate.toISOString().slice(0, 10);
  }

  function resolvePaymentTermId(contactId: string) {
    const contact = customers.find((item) => item.id === contactId);
    if (!contact?.paymentTerm) {
      return "";
    }

    const term = paymentTerms.find((item) => item.code.toUpperCase() === contact.paymentTerm.trim().toUpperCase());
    return term?.id ?? "";
  }

  useEffect(() => {
    const contactId = grn?.contactId ?? purchaseOrder?.contactId;
    if (!contactId || paymentTerms.length === 0 || customers.length === 0) {
      return;
    }

    const resolvedPaymentTermId = resolvePaymentTermId(contactId);
    setPaymentTermId(resolvedPaymentTermId);
    if (!isDueDateManuallyEdited) {
      setDueDateUtc((current) => getDueDateForTerm(resolvedPaymentTermId, current));
    }
  }, [grn, purchaseOrder, customers, paymentTerms, isDueDateManuallyEdited]);

  async function loadSourceDocument(nextSource: SourceType, nextSourceId: string) {
    setSource(nextSource);
    setSelectedSourceId(nextSourceId);

    if (!nextSourceId) {
      setPurchaseOrder(null);
      setGrn(null);
      setPaymentTermId("");
      setIsDueDateManuallyEdited(false);
      setReferenceNo("");
      setNotes("");
      setLines([]);
      return;
    }

    setIsDueDateManuallyEdited(false);

    if (nextSource === "grn") {
      const record = await api.get<GoodsReceivedNote>(`/purchases/grns/${nextSourceId}`);
      setGrn(record);
      const order = await api.get<PurchaseOrder>(`/purchases/orders/${record.purchaseOrderId}`);
      setPurchaseOrder(order);
      setReferenceNo(record.referenceNo);
      setNotes(record.notes);
      setLines(record.lines
        .map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          alreadyBilled: line.billedQuantity,
          remainingQuantity: Math.max(0, line.quantity - line.billedQuantity),
          selectedQuantity: Math.max(0, line.quantity - line.billedQuantity),
          unitAmount: line.unitPrice,
          taxRate: line.taxRate,
        }))
        .filter((line) => line.remainingQuantity > 0));
      return;
    }

    const record = await api.get<PurchaseOrder>(`/purchases/orders/${nextSourceId}`);
    setPurchaseOrder(record);
    setGrn(null);
    setReferenceNo(record.referenceNo);
    setNotes(record.notes);
    setLines(record.lines
      .map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        alreadyBilled: line.billedQuantity,
        remainingQuantity: Math.max(0, line.quantity - line.billedQuantity),
        selectedQuantity: Math.max(0, line.quantity - line.billedQuantity),
        unitAmount: line.unitPrice,
        taxRate: line.taxRate,
      }))
      .filter((line) => line.remainingQuantity > 0));
  }

  async function handleSourceTypeChange(nextSource: SourceType) {
    setError("");
    const nextOptions = nextSource === "grn" ? grnOptions : purchaseOrderOptions;
    const nextSourceId = nextOptions[0]?.id ?? "";
    await loadSourceDocument(nextSource, nextSourceId);
  }

  async function handleSourceIdChange(nextSourceId: string) {
    setError("");
    await loadSourceDocument(source, nextSourceId);
  }

  function updateQuantity(id: string, value: number) {
    setLines((current) => current.map((line) => line.id === id
      ? { ...line, selectedQuantity: Math.min(Math.max(0, value), line.remainingQuantity) }
      : line));
  }

  async function submit() {
    if (!selectedSourceId) {
      setError("Select a source document first.");
      return;
    }

    const activeLines = lines.filter((line) => line.selectedQuantity > 0);
    if (activeLines.length === 0) {
      setError("At least one line with remaining quantity is required.");
      return;
    }

    setConfirmState({
      title: "Create purchase bill",
      description: "Create this purchase bill?",
      action: async () => {
        const payload = {
          dueDateUtc: new Date(`${dueDateUtc}T00:00:00Z`).toISOString(),
          paymentTermId: paymentTermId || null,
          usePaymentTermDueDate: Boolean(paymentTermId) && !isDueDateManuallyEdited,
          referenceNo,
          notes,
          lines: activeLines.map((line) => source === "grn"
            ? { goodsReceivedNoteLineId: line.id, quantity: Number(line.selectedQuantity) }
            : { purchaseOrderLineId: line.id, quantity: Number(line.selectedQuantity) }),
        };

        const result = source === "grn"
          ? await api.post<PurchaseBill>(`/purchases/grns/${selectedSourceId}/convert-to-bill`, payload)
          : await api.post<PurchaseBill>(`/purchases/orders/${selectedSourceId}/convert-to-bill`, payload);

        navigate(`/purchases/bills/${result.id}`);
      },
    });
  }

  const currency = grn?.currency ?? purchaseOrder?.currency ?? "";
  const subtotal = lines.reduce((sum, line) => sum + (line.selectedQuantity * line.unitAmount), 0);
  const tax = lines.reduce((sum, line) => sum + ((line.selectedQuantity * line.unitAmount) * (line.taxRate / 100)), 0);
  const total = subtotal + tax;
  const backPath = isDeepLinked
    ? (source === "grn" ? "/purchases/grns" : "/purchases/orders")
    : "/purchases/bills";

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Create Purchase Bill</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate(backPath)}>Back</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">
            Source Type
            <select value={source} onChange={(event) => { void handleSourceTypeChange(event.target.value as SourceType); }}>
              <option value="purchase-order">Purchase Order</option>
              <option value="grn">Goods Received Note</option>
            </select>
          </label>
          <label className="form-label">
            Source Document
            <select value={selectedSourceId} onChange={(event) => { void handleSourceIdChange(event.target.value); }}>
              <option value="">Select a source document</option>
              {(source === "grn" ? grnOptions : purchaseOrderOptions).map((item) => (
                <option key={item.id} value={item.id}>
                  {source === "grn"
                    ? `${(item as GoodsReceivedNoteListItem).goodsReceivedNoteNumber} | ${item.contactName}`
                    : `${(item as PurchaseOrderListItem).purchaseOrderNumber} | ${item.contactName}`}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">Supplier<input className="text-input" value={grn?.contactName ?? purchaseOrder?.contactName ?? ""} readOnly /></label>
          <label className="form-label">
            Payment Term
            <select value={paymentTermId} onChange={(event) => {
              const nextPaymentTermId = event.target.value;
              setPaymentTermId(nextPaymentTermId);
              setIsDueDateManuallyEdited(false);
              setDueDateUtc(getDueDateForTerm(nextPaymentTermId, dueDateUtc));
            }}>
              <option value="">Manual due date</option>
              {paymentTerms.map((item) => <option key={item.id} value={item.id}>{`${item.code} · ${item.name}`}</option>)}
            </select>
          </label>
          <label className="form-label">Due Date<input type="date" className="text-input" value={dueDateUtc} onChange={(event) => {
            setDueDateUtc(event.target.value);
            setIsDueDateManuallyEdited(true);
          }} /></label>
          <label className="form-label">Reference No<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label>
          <label className="form-label">Notes<textarea className="text-input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        <HelperText>Select a purchase order or GRN with remaining billable quantity.</HelperText>
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Bill Lines</h3></div></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Description</th><th>Source Qty</th><th>Already Billed</th><th>Remaining</th><th>Bill Qty</th><th>Unit Amount</th><th>Total</th></tr></thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={7} className="empty-table-cell">No remaining quantity available to bill.</td></tr>
              ) : lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{line.alreadyBilled}</td>
                  <td>{line.remainingQuantity}</td>
                  <td><input type="number" min="0" max={line.remainingQuantity} step="0.01" className="text-input" value={line.selectedQuantity} onChange={(event) => updateQuantity(line.id, Number(event.target.value))} /></td>
                  <td>{formatCurrency(line.unitAmount, currency)}</td>
                  <td>{formatCurrency(line.selectedQuantity * line.unitAmount, currency)}</td>
                </tr>
              ))}
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
          <button type="button" className="button button-primary" onClick={() => void submit()}>Create bill</button>
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
