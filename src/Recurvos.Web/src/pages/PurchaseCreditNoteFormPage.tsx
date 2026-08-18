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

type LineForm = { description: string; quantity: number; unitAmount: number; taxAmount: number };
const emptyLine: LineForm = { description: "", quantity: 1, unitAmount: 0, taxAmount: 0 };

function buildCreditNoteLines(bill: PurchaseBill): LineForm[] {
  let remainingCredit = bill.amountDue;

  return bill.lines.flatMap((line) => {
    const lineTotal = (line.quantity * line.unitPrice) + line.taxAmount;
    const creditAmount = Math.min(remainingCredit, lineTotal);
    remainingCredit -= creditAmount;
    if (creditAmount <= 0 || lineTotal <= 0) return [];

    const proportion = creditAmount / lineTotal;
    return [{
      description: line.description,
      quantity: Number((line.quantity * proportion).toFixed(6)),
      unitAmount: line.unitPrice,
      taxAmount: Number((line.taxAmount * proportion).toFixed(2)),
    }];
  });
}

export function PurchaseCreditNoteFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const purchaseBillId = searchParams.get("purchaseBillId") ?? "";
  const [purchaseBill, setPurchaseBill] = useState<PurchaseBill | null>(null);
  const [issuedAtUtc, setIssuedAtUtc] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!purchaseBillId) return;
    void api.get<PurchaseBill>(`/purchases/bills/${purchaseBillId}`).then((bill) => {
      setPurchaseBill(bill);
      const billLines = buildCreditNoteLines(bill);
      setLines(billLines.length > 0 ? billLines : [{ ...emptyLine }]);
    });
  }, [purchaseBillId]);

  function updateLine(index: number, next: Partial<LineForm>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...next } : line));
  }

  function updateCreditAmount(nextAmount: number) {
    if (!Number.isFinite(nextAmount) || nextAmount < 0) return;
    setLines((current) => {
      const currentAmount = current.reduce((sum, line) => sum + (line.quantity * line.unitAmount) + line.taxAmount, 0);
      if (currentAmount <= 0) {
        return current.map((line, index) => index === 0 ? { ...line, quantity: 1, unitAmount: nextAmount, taxAmount: 0 } : line);
      }

      const multiplier = nextAmount / currentAmount;
      return current.map((line) => ({
        ...line,
        unitAmount: Number((line.unitAmount * multiplier).toFixed(6)),
        taxAmount: Number((line.taxAmount * multiplier).toFixed(2)),
      }));
    });
  }

  const currency = purchaseBill?.currency ?? "";
  const total = lines.reduce((sum, line) => sum + (line.quantity * line.unitAmount) + line.taxAmount, 0);

  async function submit() {
    if (!purchaseBill) {
      setError("Purchase bill is required.");
      return;
    }

    setConfirmState({
      title: "Create purchase credit note",
      description: "Apply this purchase credit note to the selected purchase bill?",
      action: async () => {
        const payload = {
          purchaseBillId: purchaseBill.id,
          reason,
          issuedAtUtc: new Date(`${issuedAtUtc}T00:00:00Z`).toISOString(),
          lines: lines.map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unitAmount: Number(line.unitAmount),
            taxAmount: Number(line.taxAmount),
          })),
        };
        const result = await api.post<PurchaseCreditNote>("/purchases/credit-notes", payload);
        openCreatedRecord(navigate, "/purchases/credit-notes", "/purchases/credit-notes", result.id);
      },
    });
  }

  return (
    <div className="page">
      <FormPageHeader backLabel="Back to Credit Notes" backHref="/purchases/credit-notes" breadcrumbs={<><span>Credit Notes</span><span>/</span><span>New Credit Note</span></>} />
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <TransactionFormCard title="Credit note details" description="Supplier, bill details and credit note items.">
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">Purchase Bill<input className="text-input" value={purchaseBill?.purchaseBillNumber ?? ""} readOnly /></label>
          <label className="form-label">Supplier<input className="text-input" value={purchaseBill?.contactName ?? ""} readOnly /></label>
          <label className="form-label">Issued Date<input type="date" className="text-input" value={issuedAtUtc} onChange={(event) => setIssuedAtUtc(event.target.value)} /></label>
          <label className="form-label">Outstanding<input className="text-input" value={purchaseBill ? formatCurrency(purchaseBill.amountDue, currency) : ""} readOnly /></label>
          <label className="form-label">
            Credit Amount
            <input type="number" min="0" max={purchaseBill?.amountDue ?? undefined} step="0.01" className="text-input" value={Number(total.toFixed(2))} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateCreditAmount(Number(event.target.value))} />
          </label>
          <label className="form-label master-data-form-wide">Reason<input className="text-input" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </div>
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Credit Note Items</h3></div><button type="button" className="button button-secondary" onClick={() => setLines((current) => [...current, { ...emptyLine }])}>Add item</button></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit Amount</th><th>Tax Amount</th><th>Total</th><th /></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td><input className="text-input" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                  <td><input type="number" min="0.01" step="0.01" className="text-input" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td>
                  <td><input type="number" min="0" step="0.01" className="text-input" value={line.unitAmount} onChange={(event) => updateLine(index, { unitAmount: Number(event.target.value) })} /></td>
                  <td><input type="number" min="0" step="0.01" className="text-input" value={line.taxAmount} onChange={(event) => updateLine(index, { taxAmount: Number(event.target.value) })} /></td>
                  <td>{formatCurrency((line.quantity * line.unitAmount) + line.taxAmount, currency)}</td>
                  <td><button type="button" className="button button-secondary button-compact" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="page-meta-row page-meta-row-inline">
          <div className="page-meta-chips">
            <span className="page-meta-chip"><span className="page-meta-chip-label">Credit Total</span><strong className="page-meta-chip-value">{formatCurrency(total, currency)}</strong></span>
          </div>
        </div>
      </section>
        <div className="contact-page-actions form-footer-create">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/credit-notes")}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void submit()}>Apply credit note</button>
        </div>
      </TransactionFormCard>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
