import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { ListCardHeader } from "../components/ListCardHeader";
import { ListToolbar } from "../components/ListToolbar";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { ResponseToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchasePayment, PurchasePaymentListItem } from "../types";

export function PurchasePaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const pagination = useClientPagination(filtered, [search, status]);

  function getActions(item: PurchasePaymentListItem) {
    return [
      { label: "View details", onClick: () => navigate(`/purchases/payments/${item.id}`, { state: { backgroundLocation: location } }) },
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
      <ListToolbar>
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search payment number or supplier" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Posted">Posted</option>
          <option value="Reversed">Reversed</option>
        </select>
      </ListToolbar>
      <ResponseToast message={message} tone="success" />
      <section className="card">
        <ListCardHeader title="Purchase payments" count={pagination.totalItems} countLabel={pagination.totalItems === 1 ? "payment" : "payments"} actions={<div className="invoice-detail-inline-actions"><button type="button" className="button button-secondary" onClick={() => navigate("/purchases/refunds")}>View refunds</button><button type="button" className="button button-secondary" onClick={() => navigate("/purchases/bills")}>Create from purchase bills</button></div>} />
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
              ) : pagination.pagedItems.map((item) => (
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
        <TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={pagination.totalItems} totalPages={pagination.totalPages} rangeStart={pagination.rangeStart} rangeEnd={pagination.rangeEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
