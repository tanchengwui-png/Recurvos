import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyInvoiceSettings, Customer, DeliveryOrder, DeliveryOrderListItem, Invoice, MasterDataSnapshot, PaymentTerm, SalesOrder, SalesOrderListItem } from "../types";

type SourceType = "sales-order" | "delivery-order";

type LineForm = {
  id: string;
  description: string;
  quantity: number;
  alreadyInvoiced: number;
  remainingQuantity: number;
  selectedQuantity: number;
  unitAmount: number;
};

export function SalesInvoiceFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSource = (searchParams.get("source") as SourceType | null) ?? "sales-order";
  const sourceId = searchParams.get("sourceId") ?? "";
  const [source, setSource] = useState<SourceType>(initialSource);
  const [selectedSourceId, setSelectedSourceId] = useState(sourceId);
  const [salesOrderOptions, setSalesOrderOptions] = useState<SalesOrderListItem[]>([]);
  const [deliveryOrderOptions, setDeliveryOrderOptions] = useState<DeliveryOrderListItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [salesOrder, setSalesOrder] = useState<SalesOrder | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<DeliveryOrder | null>(null);
  const [dueDateUtc, setDueDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [paymentTermId, setPaymentTermId] = useState("");
  const [isDueDateManuallyEdited, setIsDueDateManuallyEdited] = useState(false);
  const [lines, setLines] = useState<LineForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const isDeepLinked = Boolean(sourceId);

  useEffect(() => {
    async function load() {
      const [settings, orderOptions, deliveryOptions, customerList, snapshot] = await Promise.all([
        api.get<CompanyInvoiceSettings>("/settings/invoice-settings").catch(() => null),
        api.get<SalesOrderListItem[]>("/sales/orders"),
        api.get<DeliveryOrderListItem[]>("/sales/delivery-orders"),
        api.get<Customer[]>("/customers"),
        api.get<MasterDataSnapshot>("/master-data"),
      ]);
      const activePaymentTerms = snapshot.paymentTerms.filter((item) => item.isActive);
      const defaultDueDate = new Date();
      defaultDueDate.setDate(defaultDueDate.getDate() + (settings?.paymentDueDays ?? 7));
      setDueDateUtc(defaultDueDate.toISOString().slice(0, 10));
      setIsDueDateManuallyEdited(false);
      const eligibleOrders = orderOptions.filter((item) => item.status === "Confirmed" || item.status === "PartiallyDelivered" || item.status === "FullyDelivered");
      const eligibleDeliveries = deliveryOptions.filter((item) => item.status !== "Draft" && item.status !== "Cancelled" && item.status !== "FullyInvoiced");
      setSalesOrderOptions(eligibleOrders);
      setDeliveryOrderOptions(eligibleDeliveries);
      setCustomers(customerList);
      setPaymentTerms(activePaymentTerms);

      if (!sourceId) {
        const defaultSource = eligibleOrders.length > 0 ? "sales-order" : "delivery-order";
        const defaultSourceId = defaultSource === "sales-order"
          ? (eligibleOrders[0]?.id ?? "")
          : (eligibleDeliveries[0]?.id ?? "");
        if (defaultSourceId) {
          await loadSourceDocument(defaultSource, defaultSourceId);
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
    const contactId = deliveryOrder?.contactId ?? salesOrder?.contactId;
    if (!contactId || paymentTerms.length === 0 || customers.length === 0) {
      return;
    }

    const resolvedPaymentTermId = resolvePaymentTermId(contactId);
    setPaymentTermId(resolvedPaymentTermId);
    if (!isDueDateManuallyEdited) {
      setDueDateUtc((current) => getDueDateForTerm(resolvedPaymentTermId, current));
    }
  }, [deliveryOrder, salesOrder, customers, paymentTerms, isDueDateManuallyEdited]);

  async function loadSourceDocument(nextSource: SourceType, nextSourceId: string) {
    setSource(nextSource);
    setSelectedSourceId(nextSourceId);

    if (!nextSourceId) {
      setSalesOrder(null);
      setDeliveryOrder(null);
      setPaymentTermId("");
      setIsDueDateManuallyEdited(false);
      setLines([]);
      return;
    }

    setIsDueDateManuallyEdited(false);

    if (nextSource === "delivery-order") {
      const record = await api.get<DeliveryOrder>(`/sales/delivery-orders/${nextSourceId}`);
      setDeliveryOrder(record);
      const order = await api.get<SalesOrder>(`/sales/orders/${record.salesOrderId}`);
      setSalesOrder(order);
      setLines(record.lines
        .map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          alreadyInvoiced: line.invoicedQuantity,
          remainingQuantity: Math.max(0, line.quantity - line.invoicedQuantity),
          selectedQuantity: Math.max(0, line.quantity - line.invoicedQuantity),
          unitAmount: line.unitPrice,
        }))
        .filter((line) => line.remainingQuantity > 0));
      return;
    }

    const record = await api.get<SalesOrder>(`/sales/orders/${nextSourceId}`);
    setSalesOrder(record);
    setDeliveryOrder(null);
    setLines(record.lines
      .map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        alreadyInvoiced: line.invoicedQuantity,
        remainingQuantity: Math.max(0, line.quantity - line.invoicedQuantity),
        selectedQuantity: Math.max(0, line.quantity - line.invoicedQuantity),
        unitAmount: line.unitPrice,
      }))
      .filter((line) => line.remainingQuantity > 0));
  }

  async function handleSourceTypeChange(nextSource: SourceType) {
    setError("");
    const nextOptions = nextSource === "delivery-order" ? deliveryOrderOptions : salesOrderOptions;
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
    const activeLines = lines.filter((line) => line.selectedQuantity > 0);
    if (activeLines.length === 0) {
      setError("At least one line with remaining quantity is required.");
      return;
    }

    setConfirmState({
      title: "Create invoice",
      description: "Create this sales invoice?",
      action: async () => {
        const payload = {
          dueDateUtc: new Date(`${dueDateUtc}T00:00:00Z`).toISOString(),
          paymentTermId: paymentTermId || null,
          usePaymentTermDueDate: Boolean(paymentTermId) && !isDueDateManuallyEdited,
          lineItems: activeLines.map((line) => source === "delivery-order"
            ? { deliveryOrderLineId: line.id, quantity: Number(line.selectedQuantity) }
            : { salesOrderLineId: line.id, quantity: Number(line.selectedQuantity) }),
        };

        let result: Invoice;
        if (source === "delivery-order") {
          result = await api.post<Invoice>(`/sales/delivery-orders/${selectedSourceId}/convert-to-invoice`, payload);
        } else {
          result = await api.post<Invoice>(`/sales/orders/${selectedSourceId}/convert-to-invoice`, payload);
        }

        navigate("/invoices", { state: { createdInvoiceId: result.id } });
      },
    });
  }

  const currency = deliveryOrder?.currency ?? salesOrder?.currency ?? "";
  const subtotal = lines.reduce((sum, line) => sum + (line.selectedQuantity * line.unitAmount), 0);
  const backPath = isDeepLinked
    ? (source === "delivery-order" ? "/sales/delivery-orders" : "/sales/orders")
    : "/invoices";

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Create Sales Invoice</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate(backPath)}>Back</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">
            Source Type
            <select value={source} onChange={(event) => { void handleSourceTypeChange(event.target.value as SourceType); }}>
              <option value="sales-order">Sales Order</option>
              <option value="delivery-order">Delivery Order</option>
            </select>
          </label>
          <label className="form-label">
            Source Document
            <select value={selectedSourceId} onChange={(event) => { void handleSourceIdChange(event.target.value); }}>
              <option value="">Select a source document</option>
              {(source === "delivery-order" ? deliveryOrderOptions : salesOrderOptions).map((item) => (
                <option key={item.id} value={item.id}>
                  {source === "delivery-order"
                    ? `${(item as DeliveryOrderListItem).deliveryOrderNumber} | ${item.contactName}`
                    : `${(item as SalesOrderListItem).salesOrderNumber} | ${item.contactName}`}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">Contact<input className="text-input" value={deliveryOrder?.contactName ?? salesOrder?.contactName ?? ""} readOnly /></label>
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
        </div>
        <HelperText>Select a sales order or delivery order with remaining billable quantity.</HelperText>
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Invoice Lines</h3></div></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Description</th><th>Source Qty</th><th>Already Invoiced</th><th>Remaining</th><th>Invoice Qty</th><th>Unit Amount</th><th>Total</th></tr></thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={7} className="empty-table-cell">No remaining quantity available to invoice.</td></tr>
              ) : lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{line.alreadyInvoiced}</td>
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
          </div>
        </div>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate(backPath)}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void submit()}>Create invoice</button>
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
