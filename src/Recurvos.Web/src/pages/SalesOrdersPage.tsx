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
import type { CompanyLookup, SalesOrderListItem } from "../types";

export function SalesOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<SalesOrderListItem[]>([]);
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
      api.get<SalesOrderListItem[]>(`/sales/orders${query.toString() ? `?${query}` : ""}`),
      api.get<CompanyLookup[]>("/companies"),
    ]);
    setItems(orders);
    setCompanies(companyList);
  }

  useEffect(() => { void load(); }, [search, companyId, status]);

  const sortedItems = useMemo(() => [...items].sort((left, right) => {
    if (sort === "number") return left.salesOrderNumber.localeCompare(right.salesOrderNumber, undefined, { numeric: true });
    if (sort === "amount-desc") return right.totalAmount - left.totalAmount;
    const result = new Date(left.documentDateUtc).getTime() - new Date(right.documentDateUtc).getTime();
    return sort === "date-asc" ? result : -result;
  }), [items, sort]);
  const pagination = useClientPagination(sortedItems, [search, companyId, status, sort]);

  function getActions(item: SalesOrderListItem) {
    return [
      { label: "View details", onClick: () => navigate(`/sales/orders/${item.id}`, { state: { backgroundLocation: location } }) },
      ...((item.status === "Draft" || item.status === "Confirmed") ? [{ label: "Edit", onClick: () => navigate(`/sales/orders/${item.id}/edit`) }] : []),
      ...(item.status === "Draft" ? [{ label: "Confirm", onClick: async () => { await api.patch(`/sales/orders/${item.id}/status`, { status: "Confirmed" }); await load(); } }] : []),
      ...((item.status === "Confirmed" || item.status === "PartiallyDelivered") ? [{ label: "Create Delivery Order", onClick: () => navigate(`/sales/delivery-orders/new?salesOrderId=${item.id}`) }] : []),
      ...(item.hasDirectInvoiceableQuantity && (item.status === "Confirmed" || item.status === "PartiallyDelivered") ? [{ label: "Create Invoice", onClick: () => navigate(`/sales/invoices/new?source=sales-order&sourceId=${item.id}`) }] : []),
      ...(item.hasOutstandingQuantity && (item.status === "Confirmed" || item.status === "PartiallyDelivered" || item.status === "FullyDelivered") ? [{ label: "Close", onClick: () => setConfirmState({ title: "Close sales order?", description: "This sales order still has outstanding quantities. Closing it will prevent any further deliveries or invoices from being created from the remaining balance.", action: async () => { await api.patch(`/sales/orders/${item.id}/status`, { status: "Closed" }); setConfirmState(null); await load(); } }) }] : []),
      ...(item.status === "Draft" ? [{
        label: "Cancel",
        onClick: async () => { await api.patch(`/sales/orders/${item.id}/status`, { status: "Cancelled" }); await load(); },
      }] : []),
      ...(item.status === "Draft" ? [{
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete sales order",
          description: `Delete ${item.salesOrderNumber}?`,
          action: async () => {
            await api.delete(`/sales/orders/${item.id}`);
            setConfirmState(null);
            await load();
          },
        }),
      }] : []),
    ];
  }

  return (
    <div className="page">
      <ListToolbar>
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sales order number, contact, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Confirmed">Confirmed</option>
          <option value="PartiallyDelivered">Partially Delivered</option>
          <option value="FullyDelivered">Fully Delivered</option>
          <option value="Closed">Closed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select aria-label="Sort sales orders" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="number">Order number</option><option value="amount-desc">Highest total</option></select>
      </ListToolbar>
      <section className="card">
        <ListCardHeader
          title="Sales orders"
          count={sortedItems.length}
          countLabel={sortedItems.length === 1 ? "order" : "orders"}
          actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/orders/new")}>Create sales order</button>}
        />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Sales Order No</th><th>Date</th><th>Contact</th><th>Source Quotation</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {sortedItems.length === 0 ? <EmptyTableRow colSpan={7} title="No sales orders yet" description="Create a sales order manually or convert a quotation." actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/orders/new")}>Create sales order</button>} /> : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.salesOrderNumber}</td>
                  <td>{new Date(item.documentDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{item.salesQuotationId ? "Quoted" : "-"}</td>
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
