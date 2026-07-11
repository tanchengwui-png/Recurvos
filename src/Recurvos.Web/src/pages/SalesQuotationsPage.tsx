import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, SalesOrder, SalesQuotationListItem } from "../types";

export function SalesQuotationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<SalesQuotationListItem[]>([]);
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
    const [quotations, companyList] = await Promise.all([
      api.get<SalesQuotationListItem[]>(`/sales/quotations${query.toString() ? `?${query}` : ""}`),
      api.get<CompanyLookup[]>("/companies"),
    ]);
    setItems(quotations);
    setCompanies(companyList);
  }

  useEffect(() => { void load(); }, [search, companyId, status]);

  function getActions(item: SalesQuotationListItem) {
    return [
      { label: "View", onClick: () => navigate(`/sales/quotations/${item.id}`) },
      ...(item.status !== "Converted" ? [{ label: "Edit", onClick: () => navigate(`/sales/quotations/${item.id}/edit`) }] : []),
      ...((item.status === "Sent" || item.status === "Accepted") ? [{ label: "Convert to Sales Order", onClick: () => setConfirmState({
        title: "Convert quotation",
        description: `Convert ${item.quotationNumber} to a sales order?`,
        action: async () => {
          const result = await api.post<SalesOrder>(`/sales/quotations/${item.id}/convert-to-sales-order`, { documentDateUtc: new Date().toISOString(), referenceNo: "", notes: "" });
          setConfirmState(null);
          setMessage(`Sales order created: ${result.salesOrderNumber}.`);
          await load();
        },
      }) }] : []),
      ...(item.status === "Draft" ? [{ label: "Mark as Sent", onClick: async () => { await api.patch(`/sales/quotations/${item.id}/status`, { status: "Sent" }); await load(); } }] : []),
      ...(item.status === "Sent" ? [{ label: "Mark as Accepted", onClick: async () => { await api.patch(`/sales/quotations/${item.id}/status`, { status: "Accepted" }); await load(); } }] : []),
      ...(item.status === "Sent" ? [{ label: "Mark as Rejected", onClick: async () => { await api.patch(`/sales/quotations/${item.id}/status`, { status: "Rejected" }); await load(); } }] : []),
      ...(item.status === "Sent" ? [{ label: "Mark as Expired", onClick: async () => { await api.patch(`/sales/quotations/${item.id}/status`, { status: "Expired" }); await load(); } }] : []),
      ...(item.status === "Draft" ? [{
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete quotation",
          description: `Delete ${item.quotationNumber}?`,
          action: async () => {
            await api.delete(`/sales/quotations/${item.id}`);
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
        <div className="page-header-copy"><h2>Sales Quotations</h2></div>
        <button type="button" className="button button-primary" onClick={() => navigate("/sales/quotations/new")}>Create quotation</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation number, contact, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="Expired">Expired</option>
          <option value="Converted">Converted</option>
        </select>
      </div>
      <section className="card">
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Quotation No</th><th>Date</th><th>Expiry</th><th>Contact</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {items.length === 0 ? <EmptyTableRow colSpan={7} title="No quotations yet" description="Create a sales quotation to begin the sales workflow." actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/quotations/new")}>Create quotation</button>} /> : items.map((item) => (
                <tr key={item.id}>
                  <td>{item.quotationNumber}</td>
                  <td>{new Date(item.documentDateUtc).toLocaleDateString()}</td>
                  <td>{item.expiryDateUtc ? new Date(item.expiryDateUtc).toLocaleDateString() : "-"}</td>
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
