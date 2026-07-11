import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, PurchaseOrderListItem } from "../types";

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PurchaseOrderListItem[]>([]);
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
      api.get<PurchaseOrderListItem[]>(`/purchases/orders${query.toString() ? `?${query}` : ""}`),
      api.get<CompanyLookup[]>("/companies"),
    ]);
    setItems(orders);
    setCompanies(companyList);
  }

  useEffect(() => { void load(); }, [search, companyId, status]);

  function getActions(item: PurchaseOrderListItem) {
    return [
      { label: "View", onClick: () => navigate(`/purchases/orders/${item.id}`) },
      { label: "Edit", onClick: () => navigate(`/purchases/orders/${item.id}/edit`) },
      ...(item.status === "Draft" ? [{ label: "Mark as Sent", onClick: async () => { await api.patch(`/purchases/orders/${item.id}/status`, { status: "Sent" }); await load(); } }] : []),
      ...(item.status === "Sent" ? [{ label: "Approve", onClick: async () => { await api.patch(`/purchases/orders/${item.id}/status`, { status: "Approved" }); await load(); } }] : []),
      ...(item.status !== "Closed" && item.status !== "Cancelled" && item.status !== "FullyReceived" ? [{ label: "Create GRN", onClick: () => navigate(`/purchases/grns/new?purchaseOrderId=${item.id}`) }] : []),
      ...(item.status !== "Cancelled" ? [{ label: "Create Bill", onClick: () => navigate(`/purchases/bills/new?source=purchase-order&sourceId=${item.id}`) }] : []),
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
      <header className="page-header">
        <div className="page-header-copy"><h2>Purchase Orders</h2></div>
        <button type="button" className="button button-primary" onClick={() => navigate("/purchases/orders/new")}>Create purchase order</button>
      </header>
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search purchase order number, supplier, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
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
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Purchase Order No</th><th>Date</th><th>Supplier</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {items.length === 0 ? <EmptyTableRow colSpan={6} title="No purchase orders yet" description="Create a purchase order to start the purchases workflow." actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/orders/new")}>Create purchase order</button>} /> : items.map((item) => (
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
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
