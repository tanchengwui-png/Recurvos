import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchasePayment, PurchasePaymentListItem, PurchaseRefund } from "../types";

type AllocationForm = {
  purchasePaymentAllocationId: string;
  purchaseBillId: string;
  purchaseBillNumber: string;
  allocatedAmount: number;
  refundedAmount: number;
  refundAmount: number;
};

export function PurchaseRefundFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPurchasePaymentId = searchParams.get("purchasePaymentId") ?? "";
  const [paymentOptions, setPaymentOptions] = useState<PurchasePaymentListItem[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState(initialPurchasePaymentId);
  const [payment, setPayment] = useState<PurchasePayment | null>(null);
  const [refundDateUtc, setRefundDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<AllocationForm[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const payments = await api.get<PurchasePaymentListItem[]>("/purchases/payments");
      const refundable = payments.filter((item) => item.status === "Posted" && item.refundedAmount < item.totalAmount);
      setPaymentOptions(refundable);
      setSelectedPaymentId((current) => {
        if (current && refundable.some((item) => item.id === current)) {
          return current;
        }

        return refundable[0]?.id ?? "";
      });
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    async function loadPayment() {
      if (!selectedPaymentId) {
        setPayment(null);
        setAllocations([]);
        return;
      }

      const document = await api.get<PurchasePayment>(`/purchases/payments/${selectedPaymentId}`);
      setPayment(document);
      setAllocations(document.allocations.map((allocation) => ({
        purchasePaymentAllocationId: allocation.id,
        purchaseBillId: allocation.purchaseBillId,
        purchaseBillNumber: allocation.purchaseBillNumber,
        allocatedAmount: allocation.amount,
        refundedAmount: allocation.refundedAmount,
        refundAmount: 0,
      })));
    }

    void loadPayment();
  }, [selectedPaymentId]);

  function updateAllocation(purchasePaymentAllocationId: string, nextAmount: number) {
    setAllocations((current) => current.map((item) => {
      if (item.purchasePaymentAllocationId !== purchasePaymentAllocationId) {
        return item;
      }

      const remainingRefundable = Math.max(0, item.allocatedAmount - item.refundedAmount);
      return { ...item, refundAmount: Math.min(Math.max(0, nextAmount), remainingRefundable) };
    }));
  }

  const activeAllocations = useMemo(() => allocations.filter((item) => item.refundAmount > 0), [allocations]);
  const total = activeAllocations.reduce((sum, item) => sum + item.refundAmount, 0);

  async function submit() {
    if (!selectedPaymentId) {
      setError("A refundable purchase payment is required.");
      return;
    }

    if (activeAllocations.length === 0) {
      setError("At least one purchase refund allocation is required.");
      return;
    }

    setConfirmState({
      title: "Record purchase refund",
      description: "Record this supplier refund?",
      action: async () => {
        const result = await api.post<PurchaseRefund>(`/purchases/refunds/payments/${selectedPaymentId}`, {
          refundDateUtc: new Date(`${refundDateUtc}T00:00:00Z`).toISOString(),
          referenceNo,
          notes,
          allocations: activeAllocations.map((item) => ({
            purchasePaymentAllocationId: item.purchasePaymentAllocationId,
            amount: Number(item.refundAmount),
          })),
        });
        navigate(`/purchases/refunds/${result.id}`);
      },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Record Purchase Refund</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/refunds")}>Back</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">
            Purchase Payment
            <select className="text-input" value={selectedPaymentId} onChange={(event) => setSelectedPaymentId(event.target.value)}>
              {paymentOptions.length === 0 ? <option value="">No refundable purchase payments</option> : null}
              {paymentOptions.map((item) => (
                <option key={item.id} value={item.id}>{`${item.purchasePaymentNumber} | ${item.contactName} | ${formatCurrency(item.totalAmount - item.refundedAmount, item.currency)} refundable`}</option>
              ))}
            </select>
          </label>
          <label className="form-label">Supplier<input className="text-input" value={payment?.contactName ?? ""} readOnly /></label>
          <label className="form-label">Refund Date<input type="date" className="text-input" value={refundDateUtc} onChange={(event) => setRefundDateUtc(event.target.value)} /></label>
          <label className="form-label">Currency<input className="text-input" value={payment?.currency ?? ""} readOnly /></label>
          <label className="form-label">Reference No<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label>
          <label className="form-label master-data-form-wide">Notes<input className="text-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Refund Allocations</h3></div></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Purchase Bill</th><th>Paid</th><th>Already Refunded</th><th>Remaining Refundable</th><th>Refund</th></tr></thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr><td colSpan={5} className="empty-table-cell">No refundable purchase payment allocations are available.</td></tr>
              ) : allocations.map((item) => {
                const remainingRefundable = Math.max(0, item.allocatedAmount - item.refundedAmount);
                return (
                  <tr key={item.purchasePaymentAllocationId}>
                    <td>{item.purchaseBillNumber}</td>
                    <td>{formatCurrency(item.allocatedAmount, payment?.currency ?? "")}</td>
                    <td>{formatCurrency(item.refundedAmount, payment?.currency ?? "")}</td>
                    <td>{formatCurrency(remainingRefundable, payment?.currency ?? "")}</td>
                    <td><input type="number" min="0" max={remainingRefundable} step="0.01" className="text-input" value={item.refundAmount} onChange={(event) => updateAllocation(item.purchasePaymentAllocationId, Number(event.target.value))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="page-meta-row page-meta-row-inline">
          <div className="page-meta-chips">
            <span className="page-meta-chip"><span className="page-meta-chip-label">Refund Total</span><strong className="page-meta-chip-value">{formatCurrency(total, payment?.currency ?? "")}</strong></span>
          </div>
        </div>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/refunds")}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void submit()}>Record refund</button>
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
