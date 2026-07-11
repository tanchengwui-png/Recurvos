import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchasePayment, PurchasePaymentListItem } from "../types";

export function PurchasePaymentsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PurchasePaymentListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setItems(await api.get<PurchasePaymentListItem[]>("/purchases/payments"));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword
      || item.purchasePaymentNumber.toLowerCase().includes(keyword)
      || item.contactName.toLowerCase().includes(keyword);
    const matchesStatus = !status || item.status === status;
    return matchesSearch && matchesStatus;
  }), [items, search, status]);

  function getActions(item: PurchasePaymentListItem) {
    return [
      { label: "View", onClick: () => navigate(`/purchases/payments/${item.id}`) },
      ...(item.status === "Posted" && item.refundedAmount < item.totalAmount ? [{
        label: "Record Refund",
        onClick: () => navigate(`/purchases/refunds/new?purchasePaymentId=${item.id}`),
      }] : []),
      ...(item.status === "Posted" ? [{
        label: "Reverse",
        onClick: () => setConfirmState({
          title: "Reverse purchase payment",
          description: `Reverse ${item.purchasePaymentNumber}?`,
          action: async () => {
            await api.patch<PurchasePayment>(`/purchases/payments/${item.id}/reverse`, {});
            setConfirmState(null);
            setMessage(`${item.purchasePaymentNumber} reversed.`);
            await load();
          },
        }),
      }] : []),
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Payments</h2></div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/refunds")}>View refunds</button>
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/bills")}>Create from purchase bills</button>
        </div>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search payment number or supplier" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Posted">Posted</option>
          <option value="Reversed">Reversed</option>
        </select>
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Payment No</th><th>Date</th><th>Supplier</th><th>Total</th><th>Refunded</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow
                  colSpan={7}
                  title="No purchase payments yet"
                  description="Record a supplier payment from one or more purchase bills."
                  actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/bills")}>Go to purchase bills</button>}
                />
              ) : filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.purchasePaymentNumber}</td>
                  <td>{new Date(item.paymentDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{formatCurrency(item.totalAmount, item.currency)}</td>
                  <td>{formatCurrency(item.refundedAmount, item.currency)}</td>
                  <td>{item.status}</td>
                  <td className="actions-cell"><RowActionMenu items={getActions(item)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
