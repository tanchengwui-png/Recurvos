import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, GoodsReceivedNote, GoodsReceivedNoteListItem } from "../types";

export function GoodsReceivedNotesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GoodsReceivedNoteListItem[]>([]);
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
    const [records, companyList] = await Promise.all([
      api.get<GoodsReceivedNoteListItem[]>(`/purchases/grns${query.toString() ? `?${query}` : ""}`),
      api.get<CompanyLookup[]>("/companies"),
    ]);
    setItems(records);
    setCompanies(companyList);
  }

  useEffect(() => { void load(); }, [search, companyId, status]);

  function getActions(item: GoodsReceivedNoteListItem) {
    return [
      { label: "View", onClick: () => navigate(`/purchases/grns/${item.id}`) },
      { label: "Edit", onClick: () => navigate(`/purchases/grns/${item.id}/edit`) },
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
      ...(item.status === "Received" ? [{
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
      ...((item.status === "Received" || item.status === "PartiallyBilled") ? [{
        label: "Create Bill",
        onClick: () => navigate(`/purchases/bills/new?source=grn&sourceId=${item.id}`),
      }] : []),
      ...(item.status === "Draft" ? [{
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
      <header className="page-header">
        <div className="page-header-copy"><h2>Goods Received Notes</h2></div>
        <button type="button" className="button button-primary" onClick={() => navigate("/purchases/grns/new")}>Create GRN</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search GRN, purchase order, supplier, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Received">Received</option>
          <option value="PartiallyBilled">Partially Billed</option>
          <option value="FullyBilled">Fully Billed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>GRN No</th><th>Date</th><th>Supplier</th><th>Source PO</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {items.length === 0 ? <EmptyTableRow colSpan={7} title="No GRNs yet" description="Create a GRN from a purchase order when goods are received." actions={<button type="button" className="button button-primary" onClick={() => navigate("/purchases/grns/new")}>Create GRN</button>} /> : items.map((item) => (
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
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
