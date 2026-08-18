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
import type { CompanyLookup, SalesQuotationListItem } from "../types";

export function SalesQuotationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<SalesQuotationListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"date-desc" | "date-asc" | "number" | "amount-desc">("date-desc");
  const [loading, setLoading] = useState(true);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (companyId) query.set("companyId", companyId);
    if (status) query.set("status", status);
    try {
      const [quotations, companyList] = await Promise.all([api.get<SalesQuotationListItem[]>(`/sales/quotations${query.toString() ? `?${query}` : ""}`), api.get<CompanyLookup[]>("/companies")]);
      setItems(quotations); setCompanies(companyList);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [search, companyId, status]);
  const sortedItems = useMemo(() => [...items].sort((a, b) => sort === "number" ? a.quotationNumber.localeCompare(b.quotationNumber, undefined, { numeric: true }) : sort === "amount-desc" ? b.totalAmount - a.totalAmount : (sort === "date-asc" ? 1 : -1) * (new Date(a.documentDateUtc).getTime() - new Date(b.documentDateUtc).getTime())), [items, sort]);
  const pagination = useClientPagination(sortedItems, [search, companyId, status, sort]);

  function getActions(item: SalesQuotationListItem) {
    return [
      { label: "View details", onClick: () => navigate(`/sales/quotations/${item.id}`, { state: { backgroundLocation: location } }) },
      ...(!item.isTransactionallyLocked && item.status !== "Converted" ? [{ label: "Edit", onClick: () => navigate(`/sales/quotations/${item.id}/edit`) }] : []),
      ...(item.conversionStatus !== "FullyConverted" && item.status !== "Converted" ? [{ label: "Convert to Sales Order", disabled: item.status !== "Accepted", title: "Mark this quotation as accepted before converting it to a Sales Order.", onClick: () => navigate(`/sales/quotations/${item.id}`, { state: { backgroundLocation: location } }) }] : []),
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
      <ListToolbar>
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation number, contact, or reference" />
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">All companies</option>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select aria-label="Sort quotations" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="number">Quotation number</option><option value="amount-desc">Highest total</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="Expired">Expired</option>
          <option value="Converted">Converted</option>
        </select>
      </ListToolbar>
      <section className="card">
        <ListCardHeader
          title="Quotations"
          count={sortedItems.length}
          countLabel={sortedItems.length === 1 ? "quotation" : "quotations"}
          actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/quotations/new")}>Create quotation</button>}
        />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Quotation No</th><th>Date</th><th>Expiry</th><th>Contact</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {loading ? <EmptyTableRow colSpan={7} title="Loading quotations" description="Fetching the latest sales quotations." /> : sortedItems.length === 0 ? <EmptyTableRow colSpan={7} title="No quotations yet" description="Create a sales quotation to begin the sales workflow." actions={<button type="button" className="button button-primary" onClick={() => navigate("/sales/quotations/new")}>Create quotation</button>} /> : pagination.pagedItems.map((item) => (
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
        <TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={pagination.totalItems} totalPages={pagination.totalPages} rangeStart={pagination.rangeStart} rangeEnd={pagination.rangeEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
