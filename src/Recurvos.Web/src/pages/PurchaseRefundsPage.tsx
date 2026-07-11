import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchaseRefund, PurchaseRefundListItem } from "../types";

export function PurchaseRefundsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PurchaseRefundListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setItems(await api.get<PurchaseRefundListItem[]>("/purchases/refunds"));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword
      || item.purchaseRefundNumber.toLowerCase().includes(keyword)
      || item.purchasePaymentNumber.toLowerCase().includes(keyword)
      || item.contactName.toLowerCase().includes(keyword);
    const matchesStatus = !status || item.status === status;
    return matchesSearch && matchesStatus;
  }), [items, search, status]);

  function getActions(item: PurchaseRefundListItem) {
    return [
      { label: "View", onClick: () => navigate(`/purchases/refunds/${item.id}`) },
      ...(item.status === "Refunded" ? [{
        label: "Cancel",
        onClick: () => setConfirmState({
          title: "Cancel purchase refund",
          description: `Cancel ${item.purchaseRefundNumber}?`,
          action: async () => {
            await api.patch<PurchaseRefund>(`/purchases/refunds/${item.id}/cancel`, {});
            setConfirmState(null);
            setMessage(`${item.purchaseRefundNumber} cancelled.`);
            await load();
          },
        }),
      }] : []),
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Refunds</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/refunds/new")}>Create from purchase payment</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search refund number, payment, or supplier" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Refunded">Refunded</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Refund No</th><th>Date</th><th>Supplier</th><th>Payment</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow
                  colSpan={7}
                  title="No purchase refunds yet"
                  description="Record a supplier refund against a posted purchase payment."
                  actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/refunds/new")}>Record purchase refund</button>}
                />
              ) : filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.purchaseRefundNumber}</td>
                  <td>{new Date(item.refundDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{item.purchasePaymentNumber}</td>
                  <td>{formatCurrency(item.totalAmount, item.currency)}</td>
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
