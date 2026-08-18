import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { ListCardHeader } from "../components/ListCardHeader";
import { ListToolbar } from "../components/ListToolbar";
import { RecordDetailField, RecordDetailSection, RecordDetailsModal } from "../components/RecordDetailsModal";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CreditNote } from "../types";

export function CreditNotesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<CreditNote[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<CreditNote | null>(null);
  useEffect(() => { void api.get<CreditNote[]>("/credit-notes").then(setItems); }, []);
  useEffect(() => {
    const openRecordId = (location.state as { openRecordId?: string } | null)?.openRecordId;
    const record = openRecordId ? items.find((item) => item.id === openRecordId) : null;
    if (!record) return;
    setSelected(record);
    navigate(location.pathname, { replace: true, state: null });
  }, [items, location.pathname, location.state, navigate]);
  const filtered = useMemo(() => items.filter((item) => (!search.trim() || [item.creditNoteNumber, item.reason, item.status].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))) && (!status || item.status === status)), [items, search, status]);
  const pagination = useClientPagination(filtered, [filtered.length, search, status]);
  return <div className="page"><ListToolbar><input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search credit notes" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="Issued">Issued</option><option value="Cancelled">Cancelled</option></select></ListToolbar><section className="card"><ListCardHeader title="Sales credit notes" count={pagination.totalItems} countLabel={pagination.totalItems === 1 ? "credit note" : "credit notes"} actions={<button type="button" className="button button-primary" onClick={() => navigate("/invoices")}>Create from invoice</button>} /><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead><tr><th>Credit note</th><th>Invoice</th><th>Date</th><th>Reason</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{pagination.pagedItems.length === 0 ? <EmptyTableRow colSpan={7} title="No credit notes yet" description="Issued credit notes will appear here." actions={<button type="button" className="button button-primary" onClick={() => navigate("/invoices")}>Create from invoice</button>} /> : pagination.pagedItems.map((item) => <tr key={item.id}><td>{item.creditNoteNumber}</td><td>{item.invoiceNumber || "—"}</td><td>{new Date(item.issuedAtUtc).toLocaleDateString()}</td><td>{item.reason}</td><td>{formatCurrency(item.totalReduction, item.currency)}</td><td><span className="subscription-mobile-status subscription-mobile-status-refunded">{item.status}</span></td><td className="actions-cell"><RowActionMenu items={[{ label: "View details", onClick: () => setSelected(item) }]} /></td></tr>)}</tbody></table></div><TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} /></section>{selected ? <RecordDetailsModal eyebrow="Credit Note" title={selected.creditNoteNumber} onClose={() => setSelected(null)} actions={<button type="button" className="button button-secondary button-compact" onClick={() => void api.download(`/credit-notes/${selected.id}/download`)}>Download PDF</button>}><RecordDetailSection title="Details"><RecordDetailField label="Invoice" value={selected.invoiceNumber || "—"} /><RecordDetailField label="Reason" value={selected.reason} /><RecordDetailField label="Total" value={formatCurrency(selected.totalReduction, selected.currency)} /></RecordDetailSection></RecordDetailsModal> : null}</div>;
}
