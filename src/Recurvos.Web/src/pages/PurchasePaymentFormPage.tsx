import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { CurrencySelect } from "../components/ui/CurrencySelect";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { api } from "../lib/api";
import { openCreatedRecord } from "../lib/postCreateNavigation";
import { normaliseCurrencyCode, validateCurrency } from "../lib/currency";
import { formatCurrency } from "../lib/format";
import type { CurrencyDefinition, MasterDataSnapshot, PurchaseBill, PurchasePayment } from "../types";

type AllocationForm = {
  purchaseBillId: string;
  purchaseBillNumber: string;
  dueDateUtc: string;
  totalAmount: number;
  amountDue: number;
  allocatedAmount: number;
};

export function PurchasePaymentFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const purchaseBillId = searchParams.get("purchaseBillId") ?? "";
  const [currencies, setCurrencies] = useState<CurrencyDefinition[]>([]);
  const [paymentDateUtc, setPaymentDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("");
  const [currencyError, setCurrencyError] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [allocations, setAllocations] = useState<AllocationForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    async function load() {
      const [bills, snapshot] = await Promise.all([
        api.get<PurchaseBill[]>("/purchases/bills"),
        api.get<MasterDataSnapshot>("/master-data"),
      ]);
      const activeCurrencies = snapshot.currencies.filter((item) => item.isActive);
      setCurrencies(activeCurrencies);
      const openBills = bills.filter((item) => item.status !== "Cancelled" && item.amountDue > 0);
      if (purchaseBillId) {
        const selected = openBills.find((item) => item.id === purchaseBillId);
        if (selected) {
          const supplierBills = openBills.filter((item) => item.contactId === selected.contactId && item.companyId === selected.companyId);
          setContactName(selected.contactName);
          setCurrency(selected.currency);
          setAllocations(supplierBills.map((item) => ({
            purchaseBillId: item.id,
            purchaseBillNumber: item.purchaseBillNumber,
            dueDateUtc: item.dueDateUtc,
            totalAmount: item.totalAmount,
            amountDue: item.amountDue,
            allocatedAmount: item.id === purchaseBillId ? item.amountDue : 0,
          })));
          return;
        }
      }

      const first = openBills[0];
      if (!first) {
        setCurrency(activeCurrencies[0]?.code ?? "");
        setAllocations([]);
        return;
      }

      const supplierBills = openBills.filter((item) => item.contactId === first.contactId && item.companyId === first.companyId);
      setContactName(first.contactName);
      setCurrency(first.currency);
      setAllocations(supplierBills.map((item) => ({
        purchaseBillId: item.id,
        purchaseBillNumber: item.purchaseBillNumber,
        dueDateUtc: item.dueDateUtc,
        totalAmount: item.totalAmount,
        amountDue: item.amountDue,
        allocatedAmount: 0,
      })));
    }

    void load();
  }, [purchaseBillId]);

  function updateAllocation(purchaseBillIdValue: string, nextAmount: number) {
    setAllocations((current) => current.map((item) => item.purchaseBillId === purchaseBillIdValue
      ? { ...item, allocatedAmount: Math.min(Math.max(0, nextAmount), item.amountDue) }
      : item));
  }

  const activeAllocations = useMemo(() => allocations.filter((item) => item.allocatedAmount > 0), [allocations]);
  const total = activeAllocations.reduce((sum, item) => sum + item.allocatedAmount, 0);

  async function submit() {
    const nextCurrencyError = validateCurrency(currency, currencies);
    if (nextCurrencyError) { setCurrencyError(nextCurrencyError); document.getElementById("purchase-payment-currency")?.focus(); return; }
    if (activeAllocations.length === 0) {
      setError("At least one purchase bill allocation is required.");
      return;
    }

    setConfirmState({
      title: "Post purchase payment",
      description: "Post this supplier payment?",
      action: async () => {
        const payload = {
          paymentDateUtc: new Date(`${paymentDateUtc}T00:00:00Z`).toISOString(),
          currency: normaliseCurrencyCode(currency),
          referenceNo,
          notes,
          allocations: activeAllocations.map((item) => ({
            purchaseBillId: item.purchaseBillId,
            amount: Number(item.allocatedAmount),
          })),
        };
        const result = await api.post<PurchasePayment>("/purchases/payments", payload);
        openCreatedRecord(navigate, "/purchases/payments", "/purchases/payments", result.id);
      },
    });
  }

  return (
    <div className="page">
      <FormPageHeader backLabel="Back to Payments" backHref="/purchases/payments" breadcrumbs={<><span>Payments</span><span>/</span><span>New Payment</span></>} />
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <TransactionFormCard title="Payment details" description="Payment date, currency, reference and bill allocations.">
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">Supplier<input className="text-input" value={contactName} readOnly /></label>
          <label className="form-label">Payment Date<input type="date" className="text-input" value={paymentDateUtc} onChange={(event) => setPaymentDateUtc(event.target.value)} /></label>
          <label className="form-label">
            Currency
            <CurrencySelect id="purchase-payment-currency" value={currency} currencies={currencies} error={currencyError} onChange={(value) => { setCurrency(value); setCurrencyError(""); }} />
          </label>
          <label className="form-label">Reference No<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label>
          <label className="form-label master-data-form-wide">Notes<input className="text-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Bill Allocations</h3></div></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Bill No</th><th>Due Date</th><th>Total</th><th>Outstanding</th><th>Allocate</th></tr></thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr><td colSpan={5} className="empty-table-cell">No open purchase bills available for payment.</td></tr>
              ) : allocations.map((item) => (
                <tr key={item.purchaseBillId}>
                  <td>{item.purchaseBillNumber}</td>
                  <td>{new Date(item.dueDateUtc).toLocaleDateString()}</td>
                  <td>{formatCurrency(item.totalAmount, currency)}</td>
                  <td>{formatCurrency(item.amountDue, currency)}</td>
                  <td><input type="number" min="0" max={item.amountDue} step="0.01" className="text-input" value={item.allocatedAmount} onChange={(event) => updateAllocation(item.purchaseBillId, Number(event.target.value))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="page-meta-row page-meta-row-inline">
          <div className="page-meta-chips">
            <span className="page-meta-chip"><span className="page-meta-chip-label">Payment Total</span><strong className="page-meta-chip-value">{formatCurrency(total, currency)}</strong></span>
          </div>
        </div>
      </section>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/payments")}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void submit()}>Post payment</button>
        </div>
      </TransactionFormCard>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
