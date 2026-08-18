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
import type { CompanyLookup, GoodsReceivedNote, GoodsReceivedNoteListItem } from "../types";

export function GoodsReceivedNotesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<GoodsReceivedNoteListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"date-desc" | "date-asc" | "number" | "amount-desc">("date-desc");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (companyId) query.set("companyId", companyId);
    if (status) query.set("status", status);
    try {
      const [records, companyList] = await Promise.all([api.get<GoodsReceivedNoteListItem[]>(`/purchases/grns${query.toString() ? `?${query}` : ""}`), api.get<CompanyLookup[]>("/companies")]);
      setItems(records); setCompanies(companyList);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [search, companyId, status]);
  const sortedItems = useMemo(() => [...items].sort((a, b) => sort === "number" ? a.goodsReceivedNoteNumber.localeCompare(b.goodsReceivedNoteNumber, undefined, { numeric: true }) : sort === "amount-desc" ? b.totalAmount - a.totalAmount : (sort === "date-asc" ? 1 : -1) * (new Date(a.documentDateUtc).getTime() - new Date(b.documentDateUtc).getTime())), [items, sort]);
  const pagination = useClientPagination(sortedItems, [search, companyId, status, sort]);

  function getActions(item: GoodsReceivedNoteListItem) {
    return [
      { label: "View details", onClick: () => navigate(`/purchases/grns/${item.id}`, { state: { backgroundLocation: location } }) },
      ...(item.status === "Draft" ? [{ label: "Edit", onClick: () => navigate(`/purchases/grns/${item.id}/edit`) }] : []),
      ...(item.status === "Draft" ? [{
        label: "Mark as Received",
        onClick: () => setConfirmState({
          title: "Receive items",
          description: `Mark ${item.goodsReceivedNoteNumber} as received?`,
          action: async () => {
            await api.patch<GoodsReceivedNote>(`/purchases/grns/${item.id}/status`, { status: "Received" });
            setConfirmState(null);
            setMessage(`${item.goodsReceivedNoteNumber} marked as received.`);
            await load();
          },
        }),
      }] : []),
      ...(item.status === "Received" && !item.hasPurchaseBills ? [{
        label: "Cancel GRN",
        onClick: () => setConfirmState({
          title: "Cancel GRN",
          description: `Cancel ${item.goodsReceivedNoteNumber}? This will reverse received quantities on the purchase order.`,
          action: async () => {
            await api.patch<GoodsReceivedNote>(`/purchases/grns/${item.id}/status`, { status: "Cancelled" });
            setConfirmState(null);
            setMessage(`${item.goodsReceivedNoteNumber} cancelled.`);
            await load();
          },
        }),
      }] : []),
      ...(item.canCreateBill ? [{
        label: "Create Bill",
        onClick: () => navigate(`/purchases/bills/new?source=grn&sourceId=${item.id}`),
      }] : []),
      ...(item.status === "Draft" && !item.hasPurchaseBills ? [{
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete GRN",
          description: `Delete ${item.goodsReceivedNoteNumber}?`,
          action: async () => {
            await api.delete(`/purchases/grns/${item.id}`);
            setConfirmState(null);
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
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search GRN, purchase order, supplier, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select aria-label="Sort goods received notes" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="number">GRN number</option><option value="amount-desc">Highest total</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Received">Received</option>
          <option value="PartiallyBilled">Partially Billed</option>
          <option value="FullyBilled">Fully Billed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </ListToolbar>
      <section className="card">
        <ListCardHeader title="Goods received notes" count={sortedItems.length} countLabel={sortedItems.length === 1 ? "note" : "notes"} actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/grns/new")}>Create GRN</button>} />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>GRN No</th><th>Date</th><th>Supplier</th><th>Source PO</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {loading ? <EmptyTableRow colSpan={7} title="Loading goods received notes" description="Fetching the latest goods received notes." /> : sortedItems.length === 0 ? <EmptyTableRow colSpan={7} title="No GRNs yet" description="Create a GRN from a purchase order when goods are received." actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/grns/new")}>Create GRN</button>} /> : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.goodsReceivedNoteNumber}</td>
                  <td>{new Date(item.documentDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{item.purchaseOrderNumber}</td>
                  <td>{formatCurrency(item.totalAmount, item.currency)}</td>
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
