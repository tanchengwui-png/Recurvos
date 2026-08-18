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
import type { Refund } from "../types";

export function RefundsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<Refund[]>([]); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [selected, setSelected] = useState<Refund | null>(null);
  useEffect(() => { void api.get<Refund[]>("/refunds").then(setItems); }, []);
  useEffect(() => {
    const openRecordId = (location.state as { openRecordId?: string } | null)?.openRecordId;
    const record = openRecordId ? items.find((item) => item.id === openRecordId) : null;
    if (!record) return;
    setSelected(record);
    navigate(location.pathname, { replace: true, state: null });
  }, [items, location.pathname, location.state, navigate]);
  const filtered = useMemo(() => items.filter((item) => (!search.trim() || [item.reason, item.status, item.externalRefundId].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))) && (!status || item.status === status)), [items, search, status]);
  const pagination = useClientPagination(filtered, [filtered.length, search, status]);
  return <div className="page"><ListToolbar><input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search refunds" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="Succeeded">Succeeded</option><option value="Pending">Pending</option><option value="Failed">Failed</option></select></ListToolbar><section className="card"><ListCardHeader title="Sales refunds" count={pagination.totalItems} countLabel={pagination.totalItems === 1 ? "refund" : "refunds"} actions={<button type="button" className="button button-primary" onClick={() => navigate("/payments")}>Create from payment</button>} /><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead><tr><th>Refund reference</th><th>Payment</th><th>Invoice</th><th>Date</th><th>Reason</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{pagination.pagedItems.length === 0 ? <EmptyTableRow colSpan={8} title="No refunds yet" description="Refunds recorded against payments will appear here." actions={<button type="button" className="button button-primary" onClick={() => navigate("/payments")}>Create from payment</button>} /> : pagination.pagedItems.map((item) => <tr key={item.id}><td>{item.externalRefundId || "—"}</td><td>{item.paymentReference || "Payment"}</td><td>{item.invoiceNumber || "—"}</td><td>{new Date(item.createdAtUtc).toLocaleDateString()}</td><td>{item.reason}</td><td>{formatCurrency(item.amount, item.currency)}</td><td><span className="subscription-mobile-status subscription-mobile-status-refunded">{item.status}</span></td><td className="actions-cell"><RowActionMenu items={[{ label: "View details", onClick: () => setSelected(item) }]} /></td></tr>)}</tbody></table></div><TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} /></section>{selected ? <RecordDetailsModal eyebrow="Refund" title={selected.externalRefundId || "Refund"} onClose={() => setSelected(null)}><RecordDetailSection title="Related records"><RecordDetailField label="Original payment" value={selected.paymentReference || "Payment"} /><RecordDetailField label="Invoice" value={selected.invoiceNumber || "—"} /></RecordDetailSection><RecordDetailSection title="Details"><RecordDetailField label="Reason" value={selected.reason} /><RecordDetailField label="Amount" value={formatCurrency(selected.amount, selected.currency)} /></RecordDetailSection></RecordDetailsModal> : null}</div>;
}
