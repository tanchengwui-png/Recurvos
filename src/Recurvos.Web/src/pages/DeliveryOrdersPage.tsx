import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, DeliveryOrder, DeliveryOrderListItem } from "../types";

export function DeliveryOrdersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DeliveryOrderListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (companyId) query.set("companyId", companyId);
    if (status) query.set("status", status);
    const [deliveryOrders, companyList] = await Promise.all([
      api.get<DeliveryOrderListItem[]>(`/sales/delivery-orders${query.toString() ? `?${query}` : ""}`),
      api.get<CompanyLookup[]>("/companies"),
    ]);
    setItems(deliveryOrders);
    setCompanies(companyList);
  }

  useEffect(() => { void load(); }, [search, companyId, status]);

  function getActions(item: DeliveryOrderListItem) {
    return [
      { label: "View", onClick: () => navigate(`/sales/delivery-orders/${item.id}`) },
      ...(item.status === "Draft" ? [{ label: "Edit", onClick: () => navigate(`/sales/delivery-orders/${item.id}/edit`) }] : []),
      ...(item.status !== "Draft" && item.status !== "Cancelled" && item.status !== "FullyInvoiced" ? [{ label: "Create Invoice", onClick: () => navigate(`/sales/invoices/new?source=delivery-order&sourceId=${item.id}`) }] : []),
      ...(item.status === "Draft" ? [{
        label: "Mark as Delivered",
        onClick: () => setConfirmState({
          title: "Deliver items",
          description: `Mark ${item.deliveryOrderNumber} as delivered?`,
          action: async () => {
            await api.patch<DeliveryOrder>(`/sales/delivery-orders/${item.id}/status`, { status: "Delivered" });
            setConfirmState(null);
            setMessage(`${item.deliveryOrderNumber} marked as delivered.`);
            await load();
          },
        }),
      }] : []),
      ...(item.status === "Delivered" ? [{
        label: "Cancel Delivery Order",
        onClick: () => setConfirmState({
          title: "Cancel delivery order",
          description: `Cancel ${item.deliveryOrderNumber}? This will reverse delivered quantities on the sales order.`,
          action: async () => {
            await api.patch<DeliveryOrder>(`/sales/delivery-orders/${item.id}/status`, { status: "Cancelled" });
            setConfirmState(null);
            setMessage(`${item.deliveryOrderNumber} cancelled.`);
            await load();
          },
        }),
      }] : []),
      ...(item.status === "Draft" ? [{
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete delivery order",
          description: `Delete ${item.deliveryOrderNumber}?`,
          action: async () => {
            await api.delete(`/sales/delivery-orders/${item.id}`);
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
        <div className="page-header-copy"><h2>Delivery Orders</h2></div>
        <button type="button" className="button button-primary" onClick={() => navigate("/sales/delivery-orders/new")}>Create delivery order</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search delivery order, sales order, contact, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Delivered">Delivered</option>
          <option value="PartiallyInvoiced">Partially Invoiced</option>
          <option value="FullyInvoiced">Fully Invoiced</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Delivery Order No</th><th>Date</th><th>Contact</th><th>Source Sales Order</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {items.length === 0 ? <EmptyTableRow colSpan={7} title="No delivery orders yet" description="Create a delivery order from a confirmed sales order when items are ready for fulfillment." actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/delivery-orders/new")}>Create delivery order</button>} /> : items.map((item) => (
                <tr key={item.id}>
                  <td>{item.deliveryOrderNumber}</td>
                  <td>{new Date(item.documentDateUtc).toLocaleDateString()}</td>
                  <td>{item.contactName}</td>
                  <td>{item.salesOrderNumber}</td>
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
