import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { ListCardHeader } from "../components/ListCardHeader";
import { ListToolbar } from "../components/ListToolbar";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, PurchaseOrderListItem } from "../types";

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<PurchaseOrderListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"date-desc" | "date-asc" | "number" | "amount-desc">("date-desc");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (companyId) query.set("companyId", companyId);
    if (status) query.set("status", status);
    const [orders, companyList] = await Promise.all([
      api.get<PurchaseOrderListItem[]>(`/purchases/orders${query.toString() ? `?${query}` : ""}`),
      api.get<CompanyLookup[]>("/companies"),
    ]);
    setItems(orders);
    setCompanies(companyList);
  }

  useEffect(() => { void load(); }, [search, companyId, status]);

  const sortedItems = useMemo(() => [...items].sort((left, right) => {
    if (sort === "number") return left.purchaseOrderNumber.localeCompare(right.purchaseOrderNumber, undefined, { numeric: true });
    if (sort === "amount-desc") return right.totalAmount - left.totalAmount;
    const result = new Date(left.documentDateUtc).getTime() - new Date(right.documentDateUtc).getTime();
    return sort === "date-asc" ? result : -result;
  }), [items, sort]);
  const pagination = useClientPagination(sortedItems, [search, companyId, status, sort]);

  function getActions(item: PurchaseOrderListItem) {
    return [
      { label: "View details", onClick: () => navigate(`/purchases/orders/${item.id}`, { state: { backgroundLocation: location } }) },
      ...(item.status !== "Closed" && item.status !== "Cancelled" && item.status !== "PartiallyReceived" && item.status !== "FullyReceived" ? [{ label: "Edit", onClick: () => navigate(`/purchases/orders/${item.id}/edit`) }] : []),
      ...(item.status === "Draft" ? [{ label: "Mark as Sent", onClick: async () => { await api.patch(`/purchases/orders/${item.id}/status`, { status: "Sent" }); await load(); } }] : []),
      ...(item.status === "Sent" ? [{ label: "Approve", onClick: async () => { await api.patch(`/purchases/orders/${item.id}/status`, { status: "Approved" }); await load(); } }] : []),
      ...((item.status === "Approved" || item.status === "PartiallyReceived") ? [{ label: "Create GRN", onClick: () => navigate(`/purchases/grns/new?purchaseOrderId=${item.id}`) }] : []),
      ...((item.status === "Approved" || item.status === "PartiallyReceived" || item.status === "FullyReceived") ? [{ label: "Create Bill", onClick: () => navigate(`/purchases/bills/new?source=purchase-order&sourceId=${item.id}`) }] : []),
      ...(item.status !== "Closed" && item.status !== "Cancelled" ? [{ label: "Close", onClick: async () => { await api.patch(`/purchases/orders/${item.id}/status`, { status: "Closed" }); await load(); } }] : []),
      {
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete purchase order",
          description: `Delete ${item.purchaseOrderNumber}?`,
          action: async () => {
            await api.delete(`/purchases/orders/${item.id}`);
            setConfirmState(null);
            await load();
          },
        }),
      },
    ];
  }

  return (
    <div className="page">
      <ListToolbar>
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search purchase order number, supplier, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select aria-label="Sort purchase orders" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="number">Order number</option><option value="amount-desc">Highest total</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Approved">Approved</option>
          <option value="PartiallyReceived">Partially Received</option>
          <option value="FullyReceived">Fully Received</option>
          <option value="Closed">Closed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </ListToolbar>
      <section className="card">
        <ListCardHeader title="Purchase orders" count={sortedItems.length} countLabel={sortedItems.length === 1 ? "order" : "orders"} actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/orders/new")}>Create purchase order</button>} />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Purchase Order No</th><th>Date</th><th>Supplier</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {sortedItems.length === 0 ? <EmptyTableRow colSpan={6} title="No purchase orders yet" description="Create a purchase order to start the purchases workflow." actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/orders/new")}>Create purchase order</button>} /> : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.purchaseOrderNumber}</td>
                  <td>{new Date(item.documentDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{formatCurrency(item.totalAmount, item.currency)}</td>
                  <td>{item.status}</td>
                  <td className="actions-cell"><RowActionMenu items={getActions(item)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={sortedItems.length} totalPages={pagination.totalPages} rangeStart={pagination.rangeStart} rangeEnd={pagination.rangeEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
