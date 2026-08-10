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
import type { PurchaseBill, PurchaseBillListItem } from "../types";

export function PurchaseBillsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<PurchaseBillListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setItems(await api.get<PurchaseBillListItem[]>("/purchases/bills"));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword
      || item.purchaseBillNumber.toLowerCase().includes(keyword)
      || item.contactName.toLowerCase().includes(keyword);
    const matchesStatus = !status || item.status === status;
    return matchesSearch && matchesStatus;
  }), [items, search, status]);
  const pagination = useClientPagination(filtered, [search, status]);

  function getActions(item: PurchaseBillListItem) {
    return [
      { label: "View details", onClick: () => navigate(`/purchases/bills/${item.id}`, { state: { backgroundLocation: location } }) },
      ...(item.status !== "Cancelled" && item.amountDue > 0 ? [{ label: "Create Credit Note", onClick: () => navigate(`/purchases/credit-notes/new?purchaseBillId=${item.id}`) }] : []),
      ...(item.status !== "Cancelled" && item.amountDue > 0 ? [{ label: "Record Payment", onClick: () => navigate(`/purchases/payments/new?purchaseBillId=${item.id}`) }] : []),
      ...((item.status === "Issued" || item.status === "Overdue") ? [{
        label: "Cancel Bill",
        onClick: () => setConfirmState({
          title: "Cancel purchase bill",
          description: `Cancel ${item.purchaseBillNumber}?`,
          action: async () => {
            await api.patch<PurchaseBill>(`/purchases/bills/${item.id}/cancel`, {});
            setConfirmState(null);
            setMessage(`${item.purchaseBillNumber} cancelled.`);
            await load();
          },
        }),
      }] : []),
    ];
  }

  return (
    <div className="page">
      <ResponseToast message={message} tone="success" />
      <ListToolbar>
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bill number or supplier" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Issued">Issued</option>
          <option value="PartiallyPaid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </ListToolbar>
      <section className="card">
        <ListCardHeader title="Purchase bills" count={pagination.totalItems} countLabel={pagination.totalItems === 1 ? "bill" : "bills"} actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/bills/new")}>Create purchase bill</button>} />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Bill No</th><th>Issue Date</th><th>Due Date</th><th>Supplier</th><th>Total</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow
                  colSpan={8}
                  title="No purchase bills yet"
                  description="Create a purchase bill from a purchase order or GRN."
                  actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/bills/new")}>Create purchase bill</button>}
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.purchaseBillNumber}</td>
                  <td>{new Date(item.issueDateUtc).toLocaleDateString()}</td>
                  <td>{new Date(item.dueDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{formatCurrency(item.totalAmount, item.currency)}</td>
                  <td>{formatCurrency(item.amountDue, item.currency)}</td>
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
