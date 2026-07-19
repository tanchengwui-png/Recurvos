import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { PurchaseCreditNote, PurchaseCreditNoteListItem } from "../types";

export function PurchaseCreditNotesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PurchaseCreditNoteListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setItems(await api.get<PurchaseCreditNoteListItem[]>("/purchases/credit-notes"));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword
      || item.purchaseCreditNoteNumber.toLowerCase().includes(keyword)
      || item.purchaseBillNumber.toLowerCase().includes(keyword)
      || item.contactName.toLowerCase().includes(keyword);
    const matchesStatus = !status || item.status === status;
    return matchesSearch && matchesStatus;
  }), [items, search, status]);
  const pagination = useClientPagination(filtered, [search, status]);

  function getActions(item: PurchaseCreditNoteListItem) {
    return [
      { label: "View", onClick: () => navigate(`/purchases/credit-notes/${item.id}`) },
      ...(item.status === "Applied" ? [{
        label: "Cancel",
        onClick: () => setConfirmState({
          title: "Cancel purchase credit note",
          description: `Cancel ${item.purchaseCreditNoteNumber}?`,
          action: async () => {
            await api.patch<PurchaseCreditNote>(`/purchases/credit-notes/${item.id}/cancel`, {});
            setConfirmState(null);
            setMessage(`${item.purchaseCreditNoteNumber} cancelled.`);
            await load();
          },
        }),
      }] : []),
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Credit Notes</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/bills")}>Create from purchase bill</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search credit note, bill, or supplier" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Applied">Applied</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Credit Note No</th><th>Date</th><th>Supplier</th><th>Purchase Bill</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow
                  colSpan={7}
                  title="No purchase credit notes yet"
                  description="Create a purchase credit note from a purchase bill."
                  actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/bills")}>Go to purchase bills</button>}
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.purchaseCreditNoteNumber}</td>
                  <td>{new Date(item.issuedAtUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{item.purchaseBillNumber}</td>
                  <td>{formatCurrency(item.totalReduction, item.currency)}</td>
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
