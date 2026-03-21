import { Fragment, useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { Payment, PaymentConfirmation } from "../types";

export function PaymentsPage() {
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Payment[]>([]);
  const [confirmations, setConfirmations] = useState<PaymentConfirmation[]>([]);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("invoice-desc");
  const [refundForm, setRefundForm] = useState<{ paymentId: string; invoiceId: string; amount: string; reason: string; externalRefundId: string } | null>(null);
  const [reviewForm, setReviewForm] = useState<{ id: string; invoiceNumber: string; action: "approve" | "reject"; reviewNote: string } | null>(null);
  const [error, setError] = useState("");
  const [refundError, setRefundError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const pendingConfirmations = confirmations.filter((item) => item.status === "Pending");
  const processedConfirmations = confirmations
    .filter((item) => item.status !== "Pending")
    .sort((left, right) => new Date(right.paidAtUtc).getTime() - new Date(left.paidAtUtc).getTime());
  const confirmationPagination = useClientPagination(pendingConfirmations, [pendingConfirmations.length], 10);
  const historyPagination = useClientPagination(processedConfirmations, [processedConfirmations.length], 10);
  const filteredItems = items
    .filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query
        || item.invoiceNumber.toLowerCase().includes(query)
        || item.gatewayName.toLowerCase().includes(query)
        || item.status.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
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
  const pagination = useClientPagination(filteredItems, [filteredItems.length, search, statusFilter, sortBy]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);

  async function load() {
    const [payments, confirmationList] = await Promise.all([
      api.get<Payment[]>("/payments"),
      api.get<PaymentConfirmation[]>("/payment-confirmations"),
    ]);
    setItems(payments);
    setConfirmations(confirmationList);
    window.dispatchEvent(new Event("payment-confirmations-updated"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gateway tracking</p>
          <h2>Payments</h2>
        </div>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <div className="payments-grid">
        <section className="card payments-card finance-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Customer confirmations</p>
              <h3 className="section-title">Pending payment review</h3>
              <p className="muted form-intro">This queue only shows submissions that still need action.</p>
            </div>
          </div>
        {pendingConfirmations.length > 0 ? (
          <>
            <div className="table-scroll">
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
                          <>
                            <button
                              type="button"
                              className="button button-secondary button-compact"
                              onClick={() => setReviewForm({ id: item.id, invoiceNumber: item.invoiceNumber, action: "approve", reviewNote: "" })}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="button button-secondary button-compact"
                              onClick={() => setReviewForm({ id: item.id, invoiceNumber: item.invoiceNumber, action: "reject", reviewNote: "" })}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="muted">{item.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...confirmationPagination} onPageChange={confirmationPagination.setCurrentPage} onPageSizeChange={confirmationPagination.setPageSize} />
          </>
        ) : (
          <p className="muted">No pending customer payment confirmations.</p>
        )}
        {reviewForm ? (
          <div className="form-stack invoice-inline-panel" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">{reviewForm.action === "approve" ? "Approve confirmation" : "Reject confirmation"}</p>
            <label className="form-label">
              Review note
              <input
                className="text-input"
                value={reviewForm.reviewNote}
                onChange={(event) => setReviewForm((current) => current ? { ...current, reviewNote: event.target.value } : current)}
                placeholder={reviewForm.action === "approve" ? "Optional note for your team" : "Optional reason"}
              />
            </label>
            <div className="button-stack">
              <button
                type="button"
                className="button button-primary"
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
                      setConfirmState(null);
                      setError(submitError instanceof Error ? submitError.message : "Unable to review payment confirmation.");
                    }
                  },
                })}
              >
                {reviewForm.action === "approve" ? "Approve confirmation" : "Reject confirmation"}
              </button>
              <button type="button" className="button button-secondary" onClick={() => setReviewForm(null)}>Close</button>
            </div>
          </div>
        ) : null}
        </section>
      </div>
      <section className="card payments-card finance-card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">Review archive</p>
            <h3 className="section-title">Processed confirmation history</h3>
            <p className="muted form-intro">Approved and rejected submissions move here so the main review queue stays clean.</p>
          </div>
        </div>
        {processedConfirmations.length > 0 ? (
          <>
            <div className="table-scroll">
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
            <TablePagination {...historyPagination} onPageChange={historyPagination.setCurrentPage} onPageSizeChange={historyPagination.setPageSize} />
          </>
        ) : (
          <p className="muted">No processed confirmation history yet.</p>
        )}
      </section>
      <section className="card payments-card payments-table-card">
        <div className="catalog-toolbar card subtle-card" style={{ marginBottom: "1rem" }}>
          <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, gateway, or status" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Array.from(new Set(items.map((item) => item.status))).sort().map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="invoice-desc">Invoice newest</option>
            <option value="invoice-asc">Invoice oldest</option>
            <option value="amount-desc">Amount high-low</option>
            <option value="amount-asc">Amount low-high</option>
            <option value="status">Status</option>
          </select>
          <p className="muted">{filteredItems.length} payments</p>
        </div>
        <div className="payments-table-panel">
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
                  <th>Gateway</th>
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
                          <span>{item.invoiceNumber}</span>
                          <RowActionMenu
                            items={[
                              {
                                label: expandedPaymentId === item.id ? "Hide details" : "View details",
                                onClick: () => setExpandedPaymentId((current) => current === item.id ? null : item.id),
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
                    {expandedPaymentId === item.id ? (
                      <tr>
                        <td colSpan={9} className="subscription-details-cell">
                          <div className="invoice-detail-panel">
                            <div className="invoice-detail-summary">
                              <div className="invoice-detail-stat">
                                <p className="eyebrow">Invoice</p>
                                <p>{item.invoiceNumber}</p>
                              </div>
                              <div className="invoice-detail-stat">
                                <p className="eyebrow">Gateway</p>
                                <p>{item.gatewayName}</p>
                              </div>
                              <div className="invoice-detail-stat">
                                <p className="eyebrow">Status</p>
                                <p>{item.status}</p>
                              </div>
                              <div className="invoice-detail-stat">
                                <p className="eyebrow">Net collected</p>
                                <p>{formatCurrency(item.netCollectedAmount, "MYR")}</p>
                              </div>
                            </div>

                            <div className="invoice-detail-secondary-grid">
                              <div className="invoice-detail-block">
                                <div className="invoice-detail-block-header">
                                  <p className="eyebrow">Refund history</p>
                                </div>
                                <div className="invoice-detail-list">
                                  {item.refunds.length > 0 ? item.refunds.map((refund) => (
                                    <div key={refund.id} className="invoice-detail-list-row">
                                      <span>{`${formatCurrency(refund.amount, refund.currency)} | ${refund.reason}`}</span>
                                      <span className="muted">{new Date(refund.createdAtUtc).toLocaleString()}</span>
                                    </div>
                                  )) : <p className="muted">No refunds recorded.</p>}
                                </div>
                              </div>

                              <div className="invoice-detail-block">
                                <div className="invoice-detail-block-header">
                                  <p className="eyebrow">Disputes</p>
                                </div>
                                <div className="invoice-detail-list">
                                  {item.disputes.length > 0 ? item.disputes.map((dispute) => (
                                    <div key={dispute.id} className="invoice-detail-list-row">
                                      <span>{`${formatCurrency(dispute.amount, "MYR")} | ${dispute.reason} | ${dispute.status}`}</span>
                                      <span className="muted">{new Date(dispute.openedAtUtc).toLocaleDateString()}</span>
                                    </div>
                                  )) : <p className="muted">No disputes. Future capability remains read-only.</p>}
                                </div>
                              </div>

                              <div className="invoice-detail-block">
                                <div className="invoice-detail-block-header">
                                  <p className="eyebrow">Attempts</p>
                                </div>
                                <div className="invoice-detail-list">
                                  {item.attempts.length > 0 ? item.attempts.map((attempt) => (
                                    <div key={`${item.id}-${attempt.attemptNumber}`} className="invoice-detail-list-row">
                                      <span>{`Attempt ${attempt.attemptNumber} | ${attempt.status}`}</span>
                                      <span className="muted">{attempt.failureMessage || attempt.failureCode || "-"}</span>
                                    </div>
                                  )) : <p className="muted">No attempt history.</p>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
        </div>
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
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
              External refund id
              <input className="text-input" value={refundForm.externalRefundId} onChange={(event) => setRefundForm((current) => current ? { ...current, externalRefundId: event.target.value } : current)} />
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
                    await api.post(`/refunds/payments/${refundForm.paymentId}`, {
                      invoiceId: refundForm.invoiceId,
                      amount: Number(refundForm.amount),
                      reason: refundForm.reason,
                      externalRefundId: refundForm.externalRefundId || null,
                    });
                    setConfirmState(null);
                    setRefundError("");
                    setRefundForm(null);
                    await load();
                  } catch (submitError) {
                    setConfirmState(null);
                    setRefundError(submitError instanceof Error ? submitError.message : "Unable to record refund.");
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
