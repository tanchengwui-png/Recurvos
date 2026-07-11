import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, SalesOrderListItem } from "../types";

export function SalesOrdersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<SalesOrderListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
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

  function getActions(item: SalesOrderListItem) {
    return [
      { label: "View", onClick: () => navigate(`/sales/orders/${item.id}`) },
      ...((item.status === "Draft" || item.status === "Confirmed") ? [{ label: "Edit", onClick: () => navigate(`/sales/orders/${item.id}/edit`) }] : []),
      ...(item.status === "Draft" ? [{ label: "Confirm", onClick: async () => { await api.patch(`/sales/orders/${item.id}/status`, { status: "Confirmed" }); await load(); } }] : []),
      ...((item.status === "Confirmed" || item.status === "PartiallyDelivered") ? [{ label: "Create Delivery Order", onClick: () => navigate(`/sales/delivery-orders/new?salesOrderId=${item.id}`) }] : []),
      ...((item.status === "Confirmed" || item.status === "PartiallyDelivered" || item.status === "FullyDelivered") ? [{ label: "Create Invoice", onClick: () => navigate(`/sales/invoices/new?source=sales-order&sourceId=${item.id}`) }] : []),
      ...((item.status === "Confirmed" || item.status === "PartiallyDelivered" || item.status === "FullyDelivered") ? [{ label: "Close", onClick: async () => { await api.patch(`/sales/orders/${item.id}/status`, { status: "Closed" }); await load(); } }] : []),
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
      <header className="page-header">
        <div className="page-header-copy"><h2>Sales Orders</h2></div>
        <button type="button" className="button button-primary" onClick={() => navigate("/sales/orders/new")}>Create sales order</button>
      </header>
      <div className="catalog-toolbar card subtle-card">
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
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Sales Order No</th><th>Date</th><th>Contact</th><th>Source Quotation</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {items.length === 0 ? <EmptyTableRow colSpan={7} title="No sales orders yet" description="Create a sales order manually or convert a quotation." actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/orders/new")}>Create sales order</button>} /> : items.map((item) => (
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
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
