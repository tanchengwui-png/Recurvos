import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RecordDetailField, RecordDetailSection, RecordDetailsModal } from "../components/RecordDetailsModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { Customer, Invoice } from "../types";

export function SalesPaymentFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCustomerId = searchParams.get("customerId") ?? "";
  const sourceInvoiceId = searchParams.get("invoiceId") ?? "";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentDateUtc, setPaymentDateUtc] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { void Promise.all([api.get<Customer[]>("/customers"), api.get<Invoice[]>("/invoices")]).then(([customerList, invoiceList]) => { setCustomers(customerList); setInvoices(invoiceList); const source = invoiceList.find((invoice) => invoice.id === sourceInvoiceId && invoice.customerId === initialCustomerId); if (source) setAmounts({ [source.id]: String(source.balanceAmount) }); }); }, [initialCustomerId, sourceInvoiceId]);
  const rows = useMemo(() => invoices.filter((invoice) => invoice.customerId === customerId && invoice.balanceAmount > 0 && invoice.status !== "Voided"), [invoices, customerId]);
  const total = Object.values(amounts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const selectedRows = rows.filter((invoice) => invoice.id in amounts);
  const hasAllocations = selectedRows.some((invoice) => Number(amounts[invoice.id]) > 0);
  const invalidAllocation = selectedRows.some((invoice) => !Number.isFinite(Number(amounts[invoice.id])) || Number(amounts[invoice.id]) <= 0 || Number(amounts[invoice.id]) > invoice.balanceAmount);
  const footerHelp = !selectedRows.length ? "Select at least one invoice to continue." : invalidAllocation ? "Enter a valid payment amount to continue." : "";

  function requestCustomerChange(nextCustomerId: string) {
    if (nextCustomerId === customerId) return;
    if (Object.keys(amounts).length) { setPendingCustomerId(nextCustomerId); return; }
    setCustomerId(nextCustomerId);
  }

  async function submit() {
    const allocations = rows.filter((invoice) => Number(amounts[invoice.id]) > 0).map((invoice) => ({ invoiceId: invoice.id, amount: Number(amounts[invoice.id]) }));
    if (!allocations.length) return;
    setSubmitting(true);
    try { await api.post("/payments", { customerId, paymentDateUtc: new Date(`${paymentDateUtc}T00:00:00Z`).toISOString(), method, reference: reference.trim() || null, allocations }); navigate("/payments"); } finally { setSubmitting(false); }
  }

  return <div className="page"><FormPageHeader backLabel="Back to Payments" backHref="/payments" breadcrumbs={<><span>Payments</span><span>/</span><span>New Payment</span></>} /><TransactionFormCard title="Payment details" description="Allocate a payment across outstanding invoices.">
    <section className="card"><div className="master-data-form-grid master-data-form-grid-wide"><label className="form-label master-data-form-wide">Customer<select value={customerId} onChange={(event) => requestCustomerChange(event.target.value)}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="form-label">Payment date<input className="text-input" type="date" value={paymentDateUtc} onChange={(event) => setPaymentDateUtc(event.target.value)} /></label><label className="form-label">Payment method<select value={method} onChange={(event) => setMethod(event.target.value)}><option>Bank transfer</option><option>Cash</option><option>Cheque</option><option>Other</option></select></label><label className="form-label master-data-form-wide">Payment reference<input className="text-input" value={reference} onChange={(event) => setReference(event.target.value)} /></label></div></section>
    <section className="card"><div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Invoice Allocations</h3><p className="muted">Select outstanding invoices and enter the amount to allocate.</p></div>{rows.length > 1 ? <button type="button" className="button button-secondary button-compact" onClick={() => setAmounts(Object.fromEntries(rows.map((invoice) => [invoice.id, String(invoice.balanceAmount)])))}>Select all</button> : null}</div>{!customerId ? <p className="muted">Select a customer to view outstanding invoices.</p> : rows.length === 0 ? <div className="empty-state"><h4>No outstanding invoices</h4><p>This customer has no invoices available for payment.</p></div> : <><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead><tr><th>Select</th><th>Invoice</th><th>Due Date</th><th>Outstanding</th><th>Amount Paid</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id}><td><input type="checkbox" checked={invoice.id in amounts} onChange={(event) => setAmounts((current) => { const next = { ...current }; if (event.target.checked) next[invoice.id] = String(invoice.balanceAmount); else delete next[invoice.id]; return next; })} /></td><td><button type="button" className="inline-link" onClick={() => setSelectedInvoice(invoice)}>{invoice.invoiceNumber}</button></td><td>{new Date(invoice.dueDateUtc).toLocaleDateString()}</td><td>{formatCurrency(invoice.balanceAmount, invoice.currency)}</td><td><input className="text-input" inputMode="decimal" disabled={!(invoice.id in amounts)} value={amounts[invoice.id] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [invoice.id]: event.target.value }))} /></td></tr>)}</tbody></table></div><div className="page-meta-row page-meta-row-inline payment-allocation-total"><span>{selectedRows.length} invoice{selectedRows.length === 1 ? "" : "s"} selected<br />Payment total</span><strong>{formatCurrency(total, rows[0]?.currency ?? "")}</strong></div></>}</section>
    <div className="contact-page-actions form-footer-create"><span>{footerHelp}</span><button type="button" className="button button-secondary" disabled={submitting} onClick={() => navigate("/payments")}>Cancel</button><button type="button" className="button button-primary" disabled={!customerId || !hasAllocations || invalidAllocation || submitting} onClick={() => void submit()}>{submitting ? "Posting..." : "Post payment"}</button></div>
  </TransactionFormCard><ConfirmModal open={pendingCustomerId !== null} title="Change customer?" description="Changing the customer will clear the current invoice allocations." confirmLabel="Change customer" onConfirm={async () => { setCustomerId(pendingCustomerId ?? ""); setAmounts({}); setPendingCustomerId(null); }} onCancel={() => setPendingCustomerId(null)} />{selectedInvoice ? <RecordDetailsModal eyebrow="Invoice" title={selectedInvoice.invoiceNumber} subtitle={selectedInvoice.customerName} onClose={() => setSelectedInvoice(null)}><RecordDetailSection title="Invoice summary"><RecordDetailField label="Status" value={selectedInvoice.statusLabel || selectedInvoice.status} /><RecordDetailField label="Issue date" value={new Date(selectedInvoice.issueDateUtc).toLocaleDateString()} /><RecordDetailField label="Due date" value={new Date(selectedInvoice.dueDateUtc).toLocaleDateString()} /><RecordDetailField label="Subtotal" value={formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)} /><RecordDetailField label="Tax" value={formatCurrency(selectedInvoice.taxAmount, selectedInvoice.currency)} /><RecordDetailField label="Total" value={formatCurrency(selectedInvoice.total, selectedInvoice.currency)} /><RecordDetailField label="Payments recorded" value={formatCurrency(selectedInvoice.paidAmount, selectedInvoice.currency)} /><RecordDetailField label="Credit notes" value={formatCurrency(selectedInvoice.creditedAmount, selectedInvoice.currency)} /><RecordDetailField label="Outstanding" value={formatCurrency(selectedInvoice.balanceAmount, selectedInvoice.currency)} /></RecordDetailSection><section className="product-preview-section"><h4>Items</h4><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{selectedInvoice.lineItems.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{formatCurrency(line.totalAmount ?? line.lineTotal, selectedInvoice.currency)}</td></tr>)}</tbody></table></div></section></RecordDetailsModal> : null}</div>;
}
