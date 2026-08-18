import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { FilePreviewModal } from "../components/FilePreviewModal";
import { ListCardHeader } from "../components/ListCardHeader";
import { RecordDetailField, RecordDetailSection, RecordDetailsModal } from "../components/RecordDetailsModal";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { openCreatedEmbeddedRecord } from "../lib/postCreateNavigation";
import { hasFeature } from "../lib/features";
import type { FeatureAccess, Payment, PaymentConfirmation } from "../types";

function getPaymentStatusClassName(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("paid") || normalized.includes("success") || normalized.includes("approved")) {
    return "subscription-mobile-status-active";
  }

  if (normalized.includes("pending") || normalized.includes("processing") || normalized.includes("review")) {
    return "subscription-mobile-status-warning";
  }

  if (normalized.includes("refund")) {
    return "subscription-mobile-status-refunded";
  }

  if (normalized.includes("reject") || normalized.includes("fail") || normalized.includes("cancel")) {
    return "subscription-mobile-status-cancelled";
  }

  return "subscription-mobile-status-inactive";
}

type UnifiedPaymentRecord = {
  id: string;
  kind: "payment" | "confirmation";
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  refundedAmount: number;
  netAmount: number;
  paidAtUtc?: string | null;
  reference?: string | null;
  hasProof: boolean;
  reviewNote?: string | null;
};

export function PaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingTableScrollRef = useDragToScroll<HTMLDivElement>();
  const historyTableScrollRef = useDragToScroll<HTMLDivElement>();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Payment[]>([]);
  const [confirmations, setConfirmations] = useState<PaymentConfirmation[]>([]);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [previewedProof, setPreviewedProof] = useState<UnifiedPaymentRecord | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("invoice-desc");
  const [refundForm, setRefundForm] = useState<{ paymentId: string; invoiceId: string; amount: string; reason: string; externalRefundId: string } | null>(null);
  const [reviewForm, setReviewForm] = useState<{ id: string; invoiceNumber: string; action: "approve" | "reject"; reviewNote: string } | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refundError, setRefundError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const matchesConfirmationSearch = (item: PaymentConfirmation) => !normalizedSearch || [item.invoiceNumber, item.customerName, item.payerName, item.transactionReference, item.notes, item.reviewNote].some((value) => value?.toLowerCase().includes(normalizedSearch));
  const pendingConfirmations = confirmations.filter((item) => item.status === "Pending");
  const selectedPayment = expandedPaymentId ? items.find((item) => item.id === expandedPaymentId) ?? null : null;
  const processedConfirmations = confirmations
    .filter((item) => item.status !== "Pending")
    .sort((left, right) => new Date(right.paidAtUtc).getTime() - new Date(left.paidAtUtc).getTime());
  const filteredPendingConfirmations = pendingConfirmations.filter(matchesConfirmationSearch);
  const filteredProcessedConfirmations = processedConfirmations.filter((item) => matchesConfirmationSearch(item) && (statusFilter === "all" || item.status === statusFilter));
  const confirmationPagination = useClientPagination(filteredPendingConfirmations, [filteredPendingConfirmations.length, search], 10);
  const historyPagination = useClientPagination(filteredProcessedConfirmations, [filteredProcessedConfirmations.length, search, statusFilter], 10);
  const filteredItems = items
    .filter((item) => {
      const matchesSearch = !normalizedSearch
        || item.invoiceNumber.toLowerCase().includes(normalizedSearch)
        || item.gatewayName.toLowerCase().includes(normalizedSearch)
        || item.status.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesMethod = methodFilter === "all" || item.gatewayName === methodFilter;
      return matchesSearch && matchesStatus && matchesMethod;
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "invoice-asc":
          return left.invoiceNumber.localeCompare(right.invoiceNumber);
        case "amount-desc":
          return right.amount - left.amount;
        case "amount-asc":
          return left.amount - right.amount;
        case "status":
          return left.status.localeCompare(right.status);
        case "invoice-desc":
        default:
          return right.invoiceNumber.localeCompare(left.invoiceNumber);
      }
    });
  const pagination = useClientPagination(filteredItems, [filteredItems.length, search, statusFilter, methodFilter, sortBy]);
  const unifiedRecords: UnifiedPaymentRecord[] = [
    ...items.map((item) => ({ id: item.id, kind: "payment" as const, invoiceId: item.invoiceId, invoiceNumber: item.invoiceNumber, customerName: "—", method: item.gatewayName, status: item.status, amount: item.amount, currency: item.currency, refundedAmount: item.refundedAmount, netAmount: item.netCollectedAmount, paidAtUtc: item.paidAtUtc, reference: item.externalPaymentId, hasProof: item.hasProof })),
    ...confirmations.map((item) => ({ id: item.id, kind: "confirmation" as const, invoiceId: item.invoiceId, invoiceNumber: item.invoiceNumber, customerName: item.customerName, method: "Customer confirmation", status: item.status, amount: item.amount, currency: item.currency, refundedAmount: 0, netAmount: item.amount, paidAtUtc: item.paidAtUtc, reference: item.transactionReference, hasProof: item.hasProof, reviewNote: item.reviewNote })),
  ];
  const filteredUnifiedRecords = unifiedRecords
    .filter((item) => {
      const matchesSearch = !normalizedSearch || [item.invoiceNumber, item.customerName, item.method, item.status, item.reference, item.reviewNote].some((value) => value?.toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesMethod = methodFilter === "all" || item.method === methodFilter;
      const paidAt = item.paidAtUtc ? new Date(item.paidAtUtc) : null;
      const now = new Date();
      const matchesDate = dateFilter === "all" || (paidAt && (dateFilter === "last-30" ? now.getTime() - paidAt.getTime() <= 30 * 24 * 60 * 60 * 1000 : dateFilter === "this-year" ? paidAt.getFullYear() === now.getFullYear() : true));
      return matchesSearch && matchesStatus && matchesMethod && matchesDate;
    })
    .sort((left, right) => sortBy === "amount-desc" ? right.amount - left.amount : sortBy === "amount-asc" ? left.amount - right.amount : sortBy === "status" ? left.status.localeCompare(right.status) : new Date(right.paidAtUtc ?? 0).getTime() - new Date(left.paidAtUtc ?? 0).getTime());
  const unifiedPagination = useClientPagination(filteredUnifiedRecords, [filteredUnifiedRecords.length, search, statusFilter, methodFilter, dateFilter, sortBy]);
  const {
    topScrollRef: pendingTopScrollRef,
    topInnerRef: pendingTopInnerRef,
    contentScrollRef: pendingContentScrollRef,
    bottomScrollRef: pendingBottomScrollRef,
    bottomInnerRef: pendingBottomInnerRef,
  } = useSyncedHorizontalScroll([confirmationPagination.pagedItems.length, confirmationPagination.currentPage, confirmationPagination.pageSize]);
  const {
    topScrollRef: historyTopScrollRef,
    topInnerRef: historyTopInnerRef,
    contentScrollRef: historyContentScrollRef,
    bottomScrollRef: historyBottomScrollRef,
    bottomInnerRef: historyBottomInnerRef,
  } = useSyncedHorizontalScroll([historyPagination.pagedItems.length, historyPagination.currentPage, historyPagination.pageSize]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);

  async function load() {
    const access = await api.get<FeatureAccess>("/settings/feature-access").catch(() => null);
    const paymentConfirmationsEnabled = hasFeature(access, "public_payment_confirmation");

    const [payments, confirmationList] = await Promise.all([
      api.get<Payment[]>("/payments"),
      paymentConfirmationsEnabled ? api.get<PaymentConfirmation[]>("/payment-confirmations") : Promise.resolve([] as PaymentConfirmation[]),
    ]);

    setItems(payments);
    setConfirmations(confirmationList);
    if (paymentConfirmationsEnabled) {
      window.dispatchEvent(new Event("payment-confirmations-updated"));
    }
  }

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const openRecordId = (location.state as { openRecordId?: string } | null)?.openRecordId;
    if (!openRecordId || !items.some((item) => item.id === openRecordId)) return;
    setExpandedPaymentId(openRecordId);
    navigate(location.pathname, { replace: true, state: null });
  }, [items, location.pathname, location.state, navigate]);

  function getReceiptSendSummary(item: Payment) {
    const sendCount = item.history.filter((entry) =>
      entry.action === "payment.receipt-sent" || entry.action === "payment.receipt-auto-sent").length;

    if (sendCount === 0) {
      return null;
    }

    return sendCount === 1 ? "Receipt sent" : `Receipt sent x${sendCount}`;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Payments</h2>
        </div>
      </header>
      {successMessage ? <HelperText>{successMessage}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="catalog-toolbar card subtle-card invoice-filter-bar payments-filter-bar">
        <input
          className="text-input"
          aria-label="Search payments"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search payment, customer, invoice, or reference"
        />
        <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {Array.from(new Set(unifiedRecords.map((item) => item.status))).sort().map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select aria-label="Filter by method" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
          <option value="all">All methods</option>
          {Array.from(new Set(unifiedRecords.map((item) => item.method))).sort().map((method) => <option key={method} value={method}>{method}</option>)}
        </select>
        <select aria-label="Filter by date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option value="all">All dates</option><option value="last-30">Last 30 days</option><option value="this-year">This year</option></select>
      </section>
      <section className="card payments-records-card">
        <ListCardHeader title="Sales payments" count={unifiedPagination.totalItems} countLabel={unifiedPagination.totalItems === 1 ? "payment" : "payments"} actions={<div className="invoice-detail-inline-actions"><button type="button" className="button button-secondary" onClick={() => navigate("/refunds")}>View refunds</button><button type="button" className="button button-primary" onClick={() => navigate("/invoices")}>Create from invoices</button><select className="payments-sort-select" aria-label="Sort payments" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="invoice-desc">Newest paid date</option><option value="amount-desc">Amount high-low</option><option value="amount-asc">Amount low-high</option><option value="status">Status</option></select></div>} />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table payments-table">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Method</th><th>Status</th><th>Amount</th><th>Refunded</th><th>Net</th><th>Date</th><th>Reference</th><th>Proof</th><th>Action</th></tr></thead>
            <tbody>{unifiedPagination.pagedItems.map((item) => <tr key={`${item.kind}-${item.id}`}>
              <td>{item.invoiceNumber}</td><td>{item.customerName}</td><td>{item.method}</td><td><span className={`subscription-mobile-status ${getPaymentStatusClassName(item.status)}`}>{item.status}</span></td><td>{formatCurrency(item.amount, item.currency)}</td><td>{item.kind === "payment" ? formatCurrency(item.refundedAmount, item.currency) : "—"}</td><td>{formatCurrency(item.netAmount, item.currency)}</td><td>{item.paidAtUtc ? new Date(item.paidAtUtc).toLocaleDateString() : "—"}</td><td>{item.reference || "—"}</td>
              <td>{item.hasProof ? <button type="button" className="inline-link button-link" onClick={() => setPreviewedProof(item)}>View proof</button> : "—"}</td>
              <td className="actions-cell">{item.kind === "confirmation" && item.status === "Pending" ? <button type="button" className="button button-secondary button-compact" onClick={() => setReviewForm({ id: item.id, invoiceNumber: item.invoiceNumber, action: "approve", reviewNote: "" })}>Review</button> : item.kind === "payment" ? <RowActionMenu items={[{ label: "View details", onClick: () => setExpandedPaymentId(item.id) }, { label: "Record refund", onClick: () => { setRefundError(""); setRefundForm({ paymentId: item.id, invoiceId: item.invoiceId, amount: String(item.netAmount), reason: "", externalRefundId: "" }); }}]} /> : <span className="muted">{item.reviewNote || "Reviewed"}</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {unifiedPagination.pagedItems.length === 0 ? <div className="payments-empty-state"><strong>No payment records found.</strong><span>Try changing the search or filters.</span></div> : null}
        <TablePagination {...unifiedPagination} onPageChange={unifiedPagination.setCurrentPage} onPageSizeChange={unifiedPagination.setPageSize} />
      </section>
      {false ? (
        <section className="card payments-card finance-card payments-records-card">
          <div className="card-section-header">
            <div>
              <h3 className="section-title">Pending payment reviews</h3>
            </div>
        </div>
        {pendingConfirmations.length > 0 ? (
          <>
            <div className="payments-mobile-list">
              {confirmationPagination.pagedItems.map((item) => (
                <article key={item.id} className="subscription-mobile-card">
                  <div className="subscription-mobile-card-header">
                    <div className="subscription-mobile-identity">
                      <strong>{item.invoiceNumber}</strong>
                      <div className="eyebrow">{item.customerName}</div>
                    </div>
                  </div>
                  <div className="subscription-mobile-card-topline">
                    <span className={`subscription-mobile-status ${getPaymentStatusClassName(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="subscription-mobile-inline-note">{new Date(item.paidAtUtc).toLocaleDateString()}</span>
                  </div>
                  <div className="subscription-mobile-summary">
                    <div className="subscription-mobile-amount">{formatCurrency(item.amount, item.currency)}</div>
                    <div className="subscription-mobile-cadence">{item.payerName}</div>
                  </div>
                  <div className="subscription-mobile-meta">
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Customer</span>
                      <span className="subscription-mobile-meta-value">{item.customerName}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Payer</span>
                      <span className="subscription-mobile-meta-value">{item.payerName}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Reference</span>
                      <span className="subscription-mobile-meta-value">{item.transactionReference || "-"}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Proof</span>
                      <span className="subscription-mobile-meta-value">
                        {item.hasProof ? (
                          <button
                            type="button"
                            className="inline-link button-link"
                            onClick={async () => {
                              try {
                                const file = await api.download(`/payment-confirmations/${item.id}/proof`);
                                const url = URL.createObjectURL(file.blob);
                                window.open(url, "_blank", "noopener,noreferrer");
                                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                              } catch (downloadError) {
                                setError(downloadError instanceof Error ? downloadError.message : "Unable to open submitted proof.");
                              }
                            }}
                          >
                            Open
                          </button>
                        ) : "-"}
                      </span>
                    </div>
                  </div>
                  <div className="button-stack">
                    {item.status === "Pending" ? (
                      <button
                        type="button"
                        className="button button-compact payment-review-open"
                        onClick={() => setReviewForm({ id: item.id, invoiceNumber: item.invoiceNumber, action: "approve", reviewNote: "" })}
                      >
                        Review
                      </button>
                    ) : (
                      <span className="muted">{item.status}</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="payments-table-shell">
            <div ref={pendingTopScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
              <div ref={pendingTopInnerRef} />
            </div>
            <div
              ref={(node) => {
                pendingTableScrollRef.current = node;
                pendingContentScrollRef.current = node;
              }}
              className="table-scroll table-scroll-bounded table-scroll-draggable"
            >
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Payer</th>
                    <th>Amount</th>
                    <th>Paid at</th>
                    <th>Reference</th>
                    <th>Proof</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmationPagination.pagedItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.invoiceNumber}</td>
                      <td>{item.customerName}</td>
                      <td>{item.payerName}</td>
                      <td>{formatCurrency(item.amount, item.currency)}</td>
                      <td>{new Date(item.paidAtUtc).toLocaleDateString()}</td>
                      <td>{item.transactionReference || "-"}</td>
                      <td>
                        {item.hasProof ? (
                          <button
                            type="button"
                            className="inline-link button-link"
                            onClick={async () => {
                              try {
                                const file = await api.download(`/payment-confirmations/${item.id}/proof`);
                                const url = URL.createObjectURL(file.blob);
                                window.open(url, "_blank", "noopener,noreferrer");
                                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                              } catch (downloadError) {
                                setError(downloadError instanceof Error ? downloadError.message : "Unable to open submitted proof.");
                              }
                            }}
                          >
                            Open
                          </button>
                        ) : "-"}
                      </td>
                      <td>{item.status}</td>
                      <td className="actions-cell">
                        {item.status === "Pending" ? (
                          <button
                            type="button"
                            className="button button-compact payment-review-open"
                            onClick={() => setReviewForm({ id: item.id, invoiceNumber: item.invoiceNumber, action: "approve", reviewNote: "" })}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="muted">{item.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div ref={pendingBottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
              <div ref={pendingBottomInnerRef} />
            </div>
            </div>
            <TablePagination {...confirmationPagination} onPageChange={confirmationPagination.setCurrentPage} onPageSizeChange={confirmationPagination.setPageSize} />
          </>
        ) : (
          <div className="payments-empty-state"><strong>No pending customer payment confirmations.</strong><span>New submitted payment confirmations will appear here for review.</span></div>
        )}
        </section>
      ) : null}
      {false ? (
      <section className="card payments-card finance-card payments-records-card">
        <div className="card-section-header">
          <div>
            <h3 className="section-title">Payment review history</h3>
          </div>
        </div>
        {processedConfirmations.length > 0 ? (
          <>
            <div className="payments-mobile-list">
              {historyPagination.pagedItems.map((item) => (
                <article key={item.id} className="subscription-mobile-card">
                  <div className="subscription-mobile-card-header">
                    <div className="subscription-mobile-identity">
                      <strong>{item.invoiceNumber}</strong>
                      <div className="eyebrow">{item.customerName}</div>
                    </div>
                  </div>
                  <div className="subscription-mobile-card-topline">
                    <span className={`subscription-mobile-status ${getPaymentStatusClassName(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="subscription-mobile-inline-note">{new Date(item.paidAtUtc).toLocaleDateString()}</span>
                  </div>
                  <div className="subscription-mobile-summary">
                    <div className="subscription-mobile-amount">{formatCurrency(item.amount, item.currency)}</div>
                    <div className="subscription-mobile-cadence">{item.payerName}</div>
                  </div>
                  <div className="subscription-mobile-meta">
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Payer</span>
                      <span className="subscription-mobile-meta-value">{item.payerName}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Paid at</span>
                      <span className="subscription-mobile-meta-value">{new Date(item.paidAtUtc).toLocaleDateString()}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Review note</span>
                      <span className="subscription-mobile-meta-value">{item.reviewNote || "-"}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="payments-table-shell">
            <div ref={historyTopScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
              <div ref={historyTopInnerRef} />
            </div>
            <div
              ref={(node) => {
                historyTableScrollRef.current = node;
                historyContentScrollRef.current = node;
              }}
              className="table-scroll table-scroll-bounded table-scroll-draggable"
            >
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Payer</th>
                    <th>Amount</th>
                    <th>Paid at</th>
                    <th>Status</th>
                    <th>Review note</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPagination.pagedItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.invoiceNumber}</td>
                      <td>{item.customerName}</td>
                      <td>{item.payerName}</td>
                      <td>{formatCurrency(item.amount, item.currency)}</td>
                      <td>{new Date(item.paidAtUtc).toLocaleDateString()}</td>
                      <td>{item.status}</td>
                      <td>{item.reviewNote || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div ref={historyBottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
              <div ref={historyBottomInnerRef} />
            </div>
            </div>
            <TablePagination {...historyPagination} onPageChange={historyPagination.setCurrentPage} onPageSizeChange={historyPagination.setPageSize} />
          </>
        ) : (
          <div className="payments-empty-state"><strong>No payment review history yet.</strong><span>Reviewed confirmations will appear here.</span></div>
        )}
      </section>
      ) : null}
      {false ? (
      <section className="card payments-card payments-table-card payments-records-card">
        <div className="card-section-header"><h3 className="section-title">Payment records</h3><select className="payments-sort-select" aria-label="Sort payments" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="invoice-desc">Invoice newest</option><option value="invoice-asc">Invoice oldest</option><option value="amount-desc">Amount high-low</option><option value="amount-asc">Amount low-high</option><option value="status">Status</option></select></div>
        {pagination.pagedItems.length > 0 ? (
          <div className="payments-mobile-list">
            {pagination.pagedItems.map((item) => (
              <article key={item.id} className="subscription-mobile-card">
                <div className="subscription-mobile-card-header">
                  <div className="subscription-mobile-identity">
                    <strong>{item.invoiceNumber}</strong>
                    <div className="eyebrow">{item.gatewayName}</div>
                  </div>
                  <div className="subscription-mobile-actions">
                    <RowActionMenu
                      items={[
                        {
                          label: "View details",
                          onClick: () => setExpandedPaymentId(item.id),
                        },
                        {
                          label: "Record refund",
                          onClick: () => {
                            setRefundError("");
                            setRefundForm({
                              paymentId: item.id,
                              invoiceId: item.invoiceId,
                              amount: String(item.netCollectedAmount),
                              reason: "",
                              externalRefundId: "",
                            });
                          },
                        },
                        ...(item.hasReceipt ? [{
                          label: "Download receipt",
                          onClick: () => void api.download(`/payments/${item.id}/receipt`).then((file) => {
                            const objectUrl = URL.createObjectURL(file.blob);
                            const anchor = document.createElement("a");
                            anchor.href = objectUrl;
                            anchor.download = file.fileName ?? `${item.invoiceNumber}-receipt.pdf`;
                            document.body.appendChild(anchor);
                            anchor.click();
                            anchor.remove();
                            URL.revokeObjectURL(objectUrl);
                          }).catch((downloadError) => {
                            setError(downloadError instanceof Error ? downloadError.message : "Unable to download receipt.");
                          }),
                        }, {
                          label: "Send receipt",
                          onClick: () => setConfirmState({
                            title: "Send receipt",
                            description: `Send receipt for ${item.invoiceNumber} to the customer by email?`,
                            action: async () => {
                              try {
                                setError("");
                                await api.post(`/payments/${item.id}/send-receipt`);
                                setSuccessMessage(`Receipt sent for ${item.invoiceNumber}.`);
                                setConfirmState(null);
                              } catch (sendError) {
                                setSuccessMessage("");
                                const nextError = sendError instanceof Error ? sendError.message : "Unable to send receipt.";
                                setError(nextError);
                                throw new Error(nextError);
                              }
                            },
                          }),
                        }] : []),
                      ]}
                    />
                  </div>
                </div>
                <div className="subscription-mobile-card-topline">
                  <span className={`subscription-mobile-status ${getPaymentStatusClassName(item.status)}`}>
                    {item.status}
                  </span>
                  <span className="subscription-mobile-inline-note">{item.attempts.length} attempts</span>
                </div>
                <div className="subscription-mobile-summary">
                  <div className="subscription-mobile-amount">{formatCurrency(item.netCollectedAmount, "MYR")}</div>
                  <div className="subscription-mobile-cadence">{getReceiptSendSummary(item) || "No receipt activity"}</div>
                </div>
                <div className="subscription-mobile-meta">
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Method</span>
                    <span className="subscription-mobile-meta-value">{item.gatewayName}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Amount</span>
                    <span className="subscription-mobile-meta-value">{formatCurrency(item.amount, "MYR")}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Refunded</span>
                    <span className="subscription-mobile-meta-value">{formatCurrency(item.refundedAmount, "MYR")}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Link</span>
                    <span className="subscription-mobile-meta-value">
                      {item.paymentLinkUrl ? (
                        <a href={item.paymentLinkUrl} target="_blank" rel="noreferrer">Open</a>
                      ) : "-"}
                    </span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Proof</span>
                    <span className="subscription-mobile-meta-value">
                      {item.hasProof ? <button type="button" className="inline-link button-link" onClick={async () => {
                        try {
                          const file = await api.download(`/payments/${item.id}/proof`);
                          const objectUrl = URL.createObjectURL(file.blob);
                          const anchor = document.createElement("a");
                          anchor.href = objectUrl;
                          anchor.download = file.fileName ?? "payment-proof";
                          document.body.appendChild(anchor);
                          anchor.click();
                          anchor.remove();
                          URL.revokeObjectURL(objectUrl);
                        } catch (downloadError) {
                          setError(downloadError instanceof Error ? downloadError.message : "Unable to download payment proof.");
                        }
                      }}>Open</button> : item.hasReceipt ? <button type="button" className="inline-link button-link" onClick={async () => {
                        try {
                          const file = await api.download(`/payments/${item.id}/receipt`);
                          const objectUrl = URL.createObjectURL(file.blob);
                          const anchor = document.createElement("a");
                          anchor.href = objectUrl;
                          anchor.download = file.fileName ?? `${item.invoiceNumber}-receipt.pdf`;
                          document.body.appendChild(anchor);
                          anchor.click();
                          anchor.remove();
                          URL.revokeObjectURL(objectUrl);
                        } catch (downloadError) {
                          setError(downloadError instanceof Error ? downloadError.message : "Unable to download receipt.");
                        }
                      }}>Receipt</button> : "-"}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <div className="payments-table-shell">
        <div ref={topScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
          <div ref={topInnerRef} />
        </div>
        <div
          ref={(node) => {
            tableScrollRef.current = node;
            contentScrollRef.current = node;
          }}
          className="table-scroll table-scroll-bounded table-scroll-draggable"
        >
          <table className="catalog-table payments-table">
            <thead>
              <tr>
                <th className="sticky-cell sticky-cell-left">Invoice</th>
                <th>Method</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Refunded</th>
                <th>Net</th>
                <th>Attempts</th>
                <th>Link</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pagedItems.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td className="sticky-cell sticky-cell-left table-primary-cell">
                      <div className="table-primary-cell-inner">
                        <div>
                          <span>{item.invoiceNumber}</span>
                          {getReceiptSendSummary(item) ? (
                            <div className="table-meta">
                              <span className="table-meta-item">
                                <span className="table-meta-dot table-meta-dot-active" />
                                {getReceiptSendSummary(item)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <RowActionMenu
                          items={[
                            {
                              label: "View details",
                              onClick: () => setExpandedPaymentId(item.id),
                            },
                            {
                              label: "Record refund",
                              onClick: () => {
                                setRefundError("");
                                setRefundForm({
                                  paymentId: item.id,
                                  invoiceId: item.invoiceId,
                                  amount: String(item.netCollectedAmount),
                                  reason: "",
                                  externalRefundId: "",
                                });
                              },
                            },
                            ...(item.hasReceipt ? [{
                              label: "Download receipt",
                              onClick: () => void api.download(`/payments/${item.id}/receipt`).then((file) => {
                                const objectUrl = URL.createObjectURL(file.blob);
                                const anchor = document.createElement("a");
                                anchor.href = objectUrl;
                                anchor.download = file.fileName ?? `${item.invoiceNumber}-receipt.pdf`;
                                document.body.appendChild(anchor);
                                anchor.click();
                                anchor.remove();
                                URL.revokeObjectURL(objectUrl);
                              }).catch((downloadError) => {
                                setError(downloadError instanceof Error ? downloadError.message : "Unable to download receipt.");
                              }),
                            }, {
                              label: "Send receipt",
                              onClick: () => setConfirmState({
                                title: "Send receipt",
                                description: `Send receipt for ${item.invoiceNumber} to the customer by email?`,
                                action: async () => {
                                  try {
                                    setError("");
                                    await api.post(`/payments/${item.id}/send-receipt`);
                                    setSuccessMessage(`Receipt sent for ${item.invoiceNumber}.`);
                                    setConfirmState(null);
                                  } catch (sendError) {
                                    setSuccessMessage("");
                                    const nextError = sendError instanceof Error ? sendError.message : "Unable to send receipt.";
                                    setError(nextError);
                                    throw new Error(nextError);
                                  }
                                },
                              }),
                            }] : []),
                          ]}
                        />
                      </div>
                    </td>
                    <td>{item.gatewayName}</td>
                    <td>{item.status}</td>
                    <td>{formatCurrency(item.amount, "MYR")}</td>
                    <td>{formatCurrency(item.refundedAmount, "MYR")}</td>
                    <td>{formatCurrency(item.netCollectedAmount, "MYR")}</td>
                    <td>{item.attempts.length}</td>
                    <td>
                      {item.paymentLinkUrl ? (
                        <a href={item.paymentLinkUrl} target="_blank" rel="noreferrer">Open</a>
                      ) : "-"}
                    </td>
                    <td>{item.hasProof ? <button type="button" className="inline-link button-link" onClick={async () => {
                      try {
                        const file = await api.download(`/payments/${item.id}/proof`);
                        const objectUrl = URL.createObjectURL(file.blob);
                        const anchor = document.createElement("a");
                        anchor.href = objectUrl;
                        anchor.download = file.fileName ?? "payment-proof";
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                        URL.revokeObjectURL(objectUrl);
                      } catch (downloadError) {
                        setError(downloadError instanceof Error ? downloadError.message : "Unable to download payment proof.");
                      }
                    }}>Open</button> : item.hasReceipt ? <button type="button" className="inline-link button-link" onClick={async () => {
                      try {
                        const file = await api.download(`/payments/${item.id}/receipt`);
                        const objectUrl = URL.createObjectURL(file.blob);
                        const anchor = document.createElement("a");
                        anchor.href = objectUrl;
                        anchor.download = file.fileName ?? `${item.invoiceNumber}-receipt.pdf`;
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                        URL.revokeObjectURL(objectUrl);
                      } catch (downloadError) {
                        setError(downloadError instanceof Error ? downloadError.message : "Unable to download receipt.");
                      }
                    }}>Receipt</button> : "-"}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
          <div ref={bottomInnerRef} />
        </div>
        </div>
        {pagination.pagedItems.length === 0 ? (
          <div className="empty-state">
            <h3>No payments found</h3>
            <p className="muted">Try a different status or search term to review manual payment records.</p>
          </div>
        ) : null}
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      ) : null}
      {previewedProof ? (
        <FilePreviewModal
          title="Payment proof"
          subtitle={`Invoice ${previewedProof.invoiceNumber}${previewedProof.reference ? ` · ${previewedProof.reference}` : ""}`}
          filePath={previewedProof.kind === "payment" ? `/payments/${previewedProof.id}/proof` : `/payment-confirmations/${previewedProof.id}/proof`}
          onClose={() => setPreviewedProof(null)}
          context={
            <RecordDetailSection title="Payment details">
              <RecordDetailField label="Invoice" value={previewedProof.invoiceNumber} />
              <RecordDetailField label="Customer" value={previewedProof.customerName} />
              <RecordDetailField label="Amount" value={formatCurrency(previewedProof.amount, previewedProof.currency)} />
              <RecordDetailField label="Method" value={previewedProof.method} />
              <RecordDetailField label="Payment date" value={previewedProof.paidAtUtc ? new Date(previewedProof.paidAtUtc).toLocaleDateString() : "—"} />
              <RecordDetailField label="Reference" value={previewedProof.reference} />
            </RecordDetailSection>
          }
        />
      ) : null}
      {selectedPayment ? (
        <RecordDetailsModal
          eyebrow="Payment summary"
          title={selectedPayment.invoiceNumber}
          subtitle={selectedPayment.gatewayName}
          onClose={() => setExpandedPaymentId(null)}
        >
          <div className="invoice-detail-panel">
            <div className="invoice-detail-summary">
              <div className="invoice-detail-stat"><p className="eyebrow">Invoice</p><p>{selectedPayment.invoiceNumber}</p></div>
              <div className="invoice-detail-stat"><p className="eyebrow">Method</p><p>{selectedPayment.gatewayName}</p></div>
              <div className="invoice-detail-stat"><p className="eyebrow">Status</p><p>{selectedPayment.status}</p></div>
              <div className="invoice-detail-stat"><p className="eyebrow">Net collected</p><p>{formatCurrency(selectedPayment.netCollectedAmount, "MYR")}</p></div>
            </div>
            <div className="invoice-detail-secondary-grid">
              <div className="invoice-detail-block"><div className="invoice-detail-block-header"><p className="eyebrow">Refund history</p></div><div className="invoice-detail-list">
                {selectedPayment.refunds.length > 0 ? selectedPayment.refunds.map((refund) => <div key={refund.id} className="invoice-detail-list-row"><span>{`${formatCurrency(refund.amount, refund.currency)} | ${refund.reason}`}</span><span className="muted">{new Date(refund.createdAtUtc).toLocaleString()}</span></div>) : <p className="muted">No refunds recorded.</p>}
              </div></div>
              {selectedPayment.attempts.length > 0 ? (
                <div className="invoice-detail-block"><div className="invoice-detail-block-header"><p className="eyebrow">Attempts</p></div><div className="invoice-detail-list">
                  {selectedPayment.attempts.map((attempt) => <div key={`${selectedPayment.id}-${attempt.attemptNumber}`} className="invoice-detail-list-row"><span>{`Attempt ${attempt.attemptNumber} | ${attempt.status}`}</span><span className="muted">{attempt.failureMessage || attempt.failureCode || "-"}</span></div>)}
                </div></div>
              ) : null}
            </div>
          </div>
        </RecordDetailsModal>
      ) : null}
      {refundForm ? (
        <section className="card" style={{ marginTop: "1rem" }}>
          <p className="eyebrow">Record refund</p>
          <div className="form-stack">
            {refundError ? <HelperText tone="error">{refundError}</HelperText> : null}
            <label className="form-label">
              Amount
              <input className="text-input" value={refundForm.amount} onChange={(event) => setRefundForm((current) => current ? { ...current, amount: event.target.value } : current)} />
            </label>
            <label className="form-label">
              Reason
              <input className="text-input" value={refundForm.reason} onChange={(event) => setRefundForm((current) => current ? { ...current, reason: event.target.value } : current)} />
            </label>
            <label className="form-label">
              Refund reference
              <input className="text-input" placeholder="Enter bank or payment provider reference (optional)" value={refundForm.externalRefundId} onChange={(event) => setRefundForm((current) => current ? { ...current, externalRefundId: event.target.value } : current)} />
            </label>
            <div className="button-stack">
              <button type="button" className="button button-primary" onClick={() => setConfirmState({
                title: "Record refund",
                description: "Record this refund against the payment?",
                action: async () => {
                  if (!refundForm) {
                    return;
                  }

                  try {
                    const created = await api.post<{ id: string }>(`/refunds/payments/${refundForm.paymentId}`, {
                      invoiceId: refundForm.invoiceId,
                      amount: Number(refundForm.amount),
                      reason: refundForm.reason,
                      externalRefundId: refundForm.externalRefundId || null,
                    });
                    window.dispatchEvent(new Event("recurvos:payment-state-changed"));
                    setConfirmState(null);
                    setRefundError("");
                    setRefundForm(null);
                    await load();
                    openCreatedEmbeddedRecord(navigate, "/refunds", created.id);
                  } catch (submitError) {
                    const nextError = submitError instanceof Error ? submitError.message : "Unable to record refund.";
                    setRefundError(nextError);
                    throw new Error(nextError);
                  }
                },
              })}>Save refund</button>
              <button type="button" className="button button-secondary" onClick={() => {
                setRefundError("");
                setRefundForm(null);
              }}>Close</button>
            </div>
          </div>
        </section>
      ) : null}
      {reviewForm ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card card payment-review-modal" role="dialog" aria-modal="true" aria-labelledby="payment-review-title">
            <div className="payment-review-modal-header">
              <div>
                <p className="eyebrow">Customer confirmation</p>
                <h3 id="payment-review-title">Review payment confirmation</h3>
                <p className="muted">{reviewForm.invoiceNumber}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setReviewForm(null)}>Close</button>
            </div>
            <div className="payment-review-choice-grid">
              <button
                type="button"
                className={`payment-review-choice ${reviewForm.action === "approve" ? "payment-review-choice-active-approve" : ""}`}
                onClick={() => setReviewForm((current) => current ? { ...current, action: "approve" } : current)}
              >
                <span className="settings-stat-label">Approve</span>
                <strong>Mark as paid</strong>
              </button>
              <button
                type="button"
                className={`payment-review-choice ${reviewForm.action === "reject" ? "payment-review-choice-active-reject" : ""}`}
                onClick={() => setReviewForm((current) => current ? { ...current, action: "reject" } : current)}
              >
                <span className="settings-stat-label">Reject</span>
                <strong>Reject submission</strong>
              </button>
            </div>
            <label className="form-label">
              Review note
              <input
                className="text-input"
                value={reviewForm.reviewNote}
                onChange={(event) => setReviewForm((current) => current ? { ...current, reviewNote: event.target.value } : current)}
                placeholder={reviewForm.action === "approve" ? "Optional note for your team" : "Optional reason"}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className={`button ${reviewForm.action === "approve" ? "button-primary" : "payment-review-submit-reject"}`}
                onClick={() => setConfirmState({
                  title: reviewForm.action === "approve" ? "Approve payment confirmation" : "Reject payment confirmation",
                  description: `${reviewForm.action === "approve" ? "Approve" : "Reject"} the submitted confirmation for ${reviewForm.invoiceNumber}?`,
                  action: async () => {
                    try {
                      await api.post(`/payment-confirmations/${reviewForm.id}/${reviewForm.action}`, {
                        reviewNote: reviewForm.reviewNote || null,
                      });
                      setConfirmState(null);
                      setReviewForm(null);
                      await load();
                    } catch (submitError) {
                      const nextError = submitError instanceof Error ? submitError.message : "Unable to review payment confirmation.";
                      setError(nextError);
                      throw new Error(nextError);
                    }
                  },
                })}
              >
                {reviewForm.action === "approve" ? "Approve confirmation" : "Reject confirmation"}
              </button>
              <button type="button" className="button button-secondary" onClick={() => setReviewForm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
