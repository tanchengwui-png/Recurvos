import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { api } from "../lib/api";
import { openCreatedRecord } from "../lib/postCreateNavigation";
import { formatCurrency } from "../lib/format";
import type { PurchaseBill, PurchaseCreditNote } from "../types";

type LineForm = { purchaseBillLineId: string; description: string; originalQuantity: number; quantity: string; unitAmount: number; taxRate: number; sourceTaxAmount: number };

function buildCreditNoteLines(bill: PurchaseBill): LineForm[] {
  return bill.lines.map((line) => ({ purchaseBillLineId: line.id, description: line.productNameSnapshot || line.description, originalQuantity: line.quantity, quantity: String(line.quantity), unitAmount: line.unitPrice, taxRate: line.taxRate, sourceTaxAmount: line.taxAmount }));
}

function lineTaxAmount(line: LineForm) {
  const quantity = Number(line.quantity);
  return Number.isFinite(quantity) && line.originalQuantity > 0 ? Number((line.sourceTaxAmount * quantity / line.originalQuantity).toFixed(2)) : 0;
}

export function PurchaseCreditNoteFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const purchaseBillId = searchParams.get("purchaseBillId") ?? "";
  const [purchaseBill, setPurchaseBill] = useState<PurchaseBill | null>(null);
  const [issuedAtUtc, setIssuedAtUtc] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!purchaseBillId) return;
    void api.get<PurchaseBill>(`/purchases/bills/${purchaseBillId}`).then((bill) => { setPurchaseBill(bill); setLines(buildCreditNoteLines(bill)); });
  }, [purchaseBillId]);

  function updateQuantity(index: number, quantity: string) {
    if (quantity !== "" && !/^\d*(?:\.\d*)?$/.test(quantity)) return;
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity } : line));
  }

  function normalizeQuantity(index: number) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const quantity = Number(line.quantity);
      return { ...line, quantity: Number.isFinite(quantity) && quantity > 0 ? String(Math.min(quantity, line.originalQuantity)) : "" };
    }));
  }

  const currency = purchaseBill?.currency ?? "";
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * line.unitAmount, 0);
  const tax = lines.reduce((sum, line) => sum + lineTaxAmount(line), 0);
  const total = subtotal + tax;

  async function submit() {
    if (!purchaseBill) { setError("Purchase bill is required."); return; }
    if (!reason.trim()) { setError("Reason is required."); return; }
    if (!lines.length || lines.some((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || Number(line.quantity) > line.originalQuantity)) { setError("Enter a credit quantity within the remaining quantity for every item."); return; }
    setConfirmState({ title: "Create purchase credit note", description: "Apply this purchase credit note to the selected purchase bill?", action: async () => {
      const result = await api.post<PurchaseCreditNote>("/purchases/credit-notes", { purchaseBillId: purchaseBill.id, reason, issuedAtUtc: new Date(`${issuedAtUtc}T00:00:00Z`).toISOString(), lines: lines.map((line) => ({ purchaseBillLineId: line.purchaseBillLineId, quantity: Number(line.quantity) })) });
      openCreatedRecord(navigate, "/purchases/credit-notes", "/purchases/credit-notes", result.id);
    }});
  }

  return <div className="page">
    <FormPageHeader backLabel="Back to Credit Notes" backHref="/purchases/credit-notes" breadcrumbs={<><span>Credit Notes</span><span>/</span><span>New Credit Note</span></>} />
    {error ? <HelperText tone="error">{error}</HelperText> : null}
    <TransactionFormCard title="Credit note details" description="Supplier, bill details and credit note items.">
      <section className="card"><div className="master-data-form-grid master-data-form-grid-wide">
        <label className="form-label">Purchase Bill<input className="text-input" value={purchaseBill?.purchaseBillNumber ?? ""} readOnly /></label><label className="form-label">Supplier<input className="text-input" value={purchaseBill?.contactName ?? ""} readOnly /></label><label className="form-label">Issued Date<input type="date" className="text-input" value={issuedAtUtc} onChange={(event) => setIssuedAtUtc(event.target.value)} /></label><label className="form-label">Remaining Credit<input className="text-input" value={purchaseBill ? formatCurrency(purchaseBill.amountDue, currency) : ""} readOnly /></label><label className="form-label master-data-form-wide">Reason<input className="text-input" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </div></section>
      <section className="card"><div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Credit Note Items</h3></div></div><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead><tr><th>Item</th><th>Original Qty</th><th>Remaining Qty</th><th>Credit Qty</th><th>Unit Price</th><th>Tax</th><th>Credit Amount</th><th /></tr></thead><tbody>{lines.map((line, index) => { const quantity = Number(line.quantity) || 0; const taxAmount = lineTaxAmount(line); return <tr key={line.purchaseBillLineId}><td>{line.description}</td><td>{line.originalQuantity}</td><td>{line.originalQuantity}</td><td><input type="text" inputMode="decimal" className="text-input" value={line.quantity} onChange={(event) => updateQuantity(index, event.target.value)} onBlur={() => normalizeQuantity(index)} /></td><td>{formatCurrency(line.unitAmount, currency)}</td><td>{`${line.taxRate}% (${formatCurrency(taxAmount, currency)})`}</td><td>{formatCurrency((quantity * line.unitAmount) + taxAmount, currency)}</td><td><button type="button" className="button button-secondary button-compact" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button></td></tr>; })}</tbody></table></div><div className="page-meta-row page-meta-row-inline"><div className="page-meta-chips"><span className="page-meta-chip"><span className="page-meta-chip-label">Subtotal</span><strong className="page-meta-chip-value">{formatCurrency(subtotal, currency)}</strong></span><span className="page-meta-chip"><span className="page-meta-chip-label">Tax</span><strong className="page-meta-chip-value">{formatCurrency(tax, currency)}</strong></span><span className="page-meta-chip"><span className="page-meta-chip-label">Credit Total</span><strong className="page-meta-chip-value">{formatCurrency(total, currency)}</strong></span></div></div></section>
      <div className="contact-page-actions form-footer-create"><button type="button" className="button button-secondary" onClick={() => navigate("/purchases/credit-notes")}>Cancel</button><button type="button" className="button button-primary" onClick={() => void submit()}>Apply credit note</button></div>
    </TransactionFormCard>
    <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
  </div>;
}
