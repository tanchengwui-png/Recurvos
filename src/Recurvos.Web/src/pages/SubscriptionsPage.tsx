import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { RowActionMenu } from "../components/RowActionMenu";
import { SubscriptionDetailDrawer } from "../components/subscriptions/SubscriptionDetailDrawer";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { ResponseToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { BillingReadiness, CompanyLookup, ProductPlan, Subscription } from "../types";

function canPauseSubscription(subscription: Subscription) {
  return subscription.status === "Active" && !subscription.endedAtUtc && !subscription.cancelAtPeriodEnd;
}

function canResumeSubscription(subscription: Subscription) {
  return !subscription.endedAtUtc && (subscription.status === "Paused" || subscription.cancelAtPeriodEnd);
}

function canCancelSubscription(subscription: Subscription) {
  return !subscription.endedAtUtc && subscription.status !== "Cancelled";
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getGenerateInvoiceAvailability(subscription: Subscription) {
  if (subscription.isDue) {
    return { disabled: false, title: undefined as string | undefined };
  }

  if (subscription.nextBillingUtc) {
    return {
      disabled: true,
      title: `Available when the next service period starts on ${new Date(subscription.nextBillingUtc).toLocaleDateString()}.`,
    };
  }

  return {
    disabled: true,
    title: "No subscription items are due for invoicing yet.",
  };
}

function formatSubscriptionDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function getSubscriptionBillingLabel(subscription: Subscription) {
  if (subscription.hasMixedBillingIntervals) {
    return "Mixed billing";
  }

  if (subscription.intervalUnit === "None") {
    return "One-time";
  }

  return `${subscription.intervalCount} ${subscription.intervalUnit}`;
}

function getSubscriptionBillingMeta(subscription: Subscription) {
  return subscription.hasMixedBillingIntervals
    ? `${subscription.items.length} schedules`
    : `${formatCurrency(subscription.unitPrice, subscription.currency)} x ${subscription.quantity}`;
}

function getSubscriptionPeriodLabel(subscription: Subscription) {
  if (subscription.currentPeriodStartUtc && subscription.currentPeriodEndUtc) {
    return `${formatSubscriptionDate(subscription.currentPeriodStartUtc)} to ${formatSubscriptionDate(subscription.currentPeriodEndUtc)}`;
  }

  if (subscription.endedAtUtc) {
    return `Ended ${formatSubscriptionDate(subscription.endedAtUtc)}`;
  }

  return "No active period";
}

function getSubscriptionItemsPreview(subscription: Subscription) {
  if (subscription.items.length === 0) {
    return "No items";
  }

  const [firstItem, ...remainingItems] = subscription.items;
  return remainingItems.length === 0
    ? firstItem.productPlanName
    : `${firstItem.productPlanName} + ${remainingItems.length} more`;
}

function getSubscriptionStatusClass(status: Subscription["status"], cancelAtPeriodEnd: boolean) {
  if (status === "Cancelled") {
    return "subscriptions-project-badge-danger";
  }

  if (status === "Paused") {
    return "subscriptions-project-badge-muted";
  }

  if (cancelAtPeriodEnd) {
    return "subscriptions-project-badge-warning";
  }

  if (status === "Active") {
    return "subscriptions-project-badge-success";
  }

  return "subscriptions-project-badge-primary";
}

function getSubscriptionStatusLabel(status: Subscription["status"], cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd && status !== "Cancelled") {
    return "Scheduled";
  }

  return status;
}

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const actionFormRef = useRef<HTMLDivElement | null>(null);
  const loadRequestIdRef = useRef(0);
  const [items, setItems] = useState<Subscription[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelSchedule, setCancelSchedule] = useState<{ id: string; date: string; reason: string } | null>(null);
  const [pricingEdit, setPricingEdit] = useState<{ id: string; unitPrice: string; currency: string; intervalUnit: "None" | "Month" | "Quarter" | "Year"; intervalCount: string; quantity: string; reason: string } | null>(null);
  const [migrationEdit, setMigrationEdit] = useState<{ subscriptionId: string; subscriptionItemId: string; currentPlanName: string; targetProductPlanId: string; reason: string } | null>(null);
  const [migrationPlans, setMigrationPlans] = useState<ProductPlan[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const selectedSubscription = expandedId ? items.find((item) => item.id === expandedId) ?? null : null;
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "scheduled" | "cancelled">(() => {
    const value = searchParams.get("status");
    return value === "active" || value === "paused" || value === "scheduled" || value === "cancelled" ? value : "all";
  });
  const [billingFilter, setBillingFilter] = useState<"all" | "due" | "recurring" | "one-time" | "mixed">(() => {
    const value = searchParams.get("billing");
    return value === "due" || value === "recurring" || value === "one-time" || value === "mixed" ? value : "all";
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedSearchQuery
      || [
        item.customerName,
        item.companyName,
        item.status,
        item.notes ?? "",
        ...item.items.map((subscriptionItem) => subscriptionItem.productPlanName),
      ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));

    if (!matchesSearch) {
      return false;
    }

    if (statusFilter === "active" && item.status !== "Active") {
      return false;
    }

    if (statusFilter === "paused" && item.status !== "Paused") {
      return false;
    }

    if (statusFilter === "scheduled" && !item.cancelAtPeriodEnd) {
      return false;
    }

    if (statusFilter === "cancelled" && item.status !== "Cancelled") {
      return false;
    }

    if (billingFilter === "due" && !item.isDue) {
      return false;
    }

    if (billingFilter === "recurring" && (item.hasMixedBillingIntervals || item.intervalUnit === "None")) {
      return false;
    }

    if (billingFilter === "one-time" && (item.hasMixedBillingIntervals || item.intervalUnit !== "None")) {
      return false;
    }

    if (billingFilter === "mixed" && !item.hasMixedBillingIntervals) {
      return false;
    }

    return true;
  });
  const pagination = useClientPagination(filteredItems, [filteredItems.length, searchQuery, statusFilter, billingFilter], 20);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, expandedId, pagination.currentPage, pagination.pageSize]);

  async function load() {
    const requestId = ++loadRequestIdRef.current;
    const [subscriptions, companyList] = await Promise.all([
      api.get<Subscription[]>("/subscriptions"),
      api.get<CompanyLookup[]>("/companies"),
    ]);

    if (requestId !== loadRequestIdRef.current) {
      return;
    }

    setItems(subscriptions);

    const activeCompanyId = companyList[0]?.id || "";
    if (!activeCompanyId) {
      return;
    }

    const readiness = await api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${activeCompanyId}`);
    if (requestId !== loadRequestIdRef.current) {
      return;
    }

    setBillingReadiness(readiness);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedSearch = searchQuery.trim();

    if (trimmedSearch) {
      nextParams.set("search", trimmedSearch);
    } else {
      nextParams.delete("search");
    }

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    if (billingFilter !== "all") {
      nextParams.set("billing", billingFilter);
    } else {
      nextParams.delete("billing");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [billingFilter, searchQuery, searchParams, setSearchParams, statusFilter]);

  useEffect(() => {
    if (!cancelSchedule && !pricingEdit && !migrationEdit) {
      return;
    }

    actionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cancelSchedule, pricingEdit, migrationEdit]);

  useEffect(() => {
    if (!selectedSubscription) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSubscription]);

  useEffect(() => {
    if (!selectedSubscription) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedSubscription]);

  useEffect(() => {
    const state = location.state;
    const flashMessage = state && typeof state === "object" && "flashMessage" in state ? state.flashMessage : null;

    if (typeof flashMessage !== "string" || !flashMessage) {
      return;
    }

    setMessage(flashMessage);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  async function act(id: string, action: "pause" | "resume" | "cancel") {
    await api.post(`/subscriptions/${id}/${action}`, action === "cancel" ? { endOfPeriod: true } : {});
    await load();
  }

  async function submitScheduledCancel() {
    if (!cancelSchedule) {
      return;
    }

    const isImmediateCancel = cancelSchedule.date === toDateInputValue(new Date());

    await api.post(`/subscriptions/${cancelSchedule.id}/cancel`, isImmediateCancel
      ? { endOfPeriod: false, reason: cancelSchedule.reason || null }
      : {
          endOfPeriod: true,
          effectiveDateUtc: new Date(cancelSchedule.date).toISOString(),
          reason: cancelSchedule.reason || null,
        });
    setCancelSchedule(null);
    await load();
  }

  async function submitPricingUpdate() {
    if (!pricingEdit) {
      return;
    }

    await api.patch(`/subscriptions/${pricingEdit.id}/pricing`, {
      unitPrice: Number(pricingEdit.unitPrice),
      currency: pricingEdit.currency,
      intervalUnit: pricingEdit.intervalUnit,
      intervalCount: Number(pricingEdit.intervalCount),
      quantity: Number(pricingEdit.quantity),
      reason: pricingEdit.reason || null,
    });

    setPricingEdit(null);
    await load();
  }

  async function startMigrationEdit(subscription: Subscription, subscriptionItemId: string, currentPlanId: string, currentPlanName: string) {
    setExpandedId(null);
    const companyPlans = await api.get<ProductPlan[]>(`/companies/${subscription.companyId}/product-plans`);
    const targetPlans = companyPlans.filter((plan) => plan.id !== currentPlanId && plan.isActive);
    setMigrationPlans(targetPlans);
    setPricingEdit(null);
    setMigrationEdit({
      subscriptionId: subscription.id,
      subscriptionItemId,
      currentPlanName,
      targetProductPlanId: targetPlans[0]?.id ?? "",
      reason: "",
    });
  }

  async function submitItemMigration() {
    if (!migrationEdit) {
      return;
    }

    await api.post(`/subscriptions/${migrationEdit.subscriptionId}/items/${migrationEdit.subscriptionItemId}/migrate-plan`, {
      targetProductPlanId: migrationEdit.targetProductPlanId,
      reason: migrationEdit.reason || null,
    });

    setMigrationEdit(null);
    setMigrationPlans([]);
    await load();
  }

  async function runDueInvoicesNow() {
    try {
      const result = await api.post<{ created: number }>("/subscriptions/run-due-invoices");
      setMessage(result.created > 0
        ? `${result.created} subscription invoice${result.created === 1 ? "" : "s"} generated.`
        : "No subscriptions were ready for invoice generation.");
      setError("");
      await load();
    } catch (runError) {
      setMessage("");
      setError(runError instanceof Error ? runError.message : "Unable to run due invoices.");
    }
  }

  async function downloadSubscriptionPreview(id: string) {
    const file = await api.download(`/subscriptions/${id}/preview-invoice`);
    const objectUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.fileName ?? "subscription-preview.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function beginPricingEdit(subscription: Subscription) {
    setMigrationEdit(null);
    setMigrationPlans([]);
    setExpandedId(null);
    setPricingEdit({
      id: subscription.id,
      unitPrice: String(subscription.unitPrice),
      currency: subscription.currency,
      intervalUnit: subscription.intervalUnit,
      intervalCount: String(subscription.intervalCount),
      quantity: String(subscription.quantity),
      reason: "",
    });
  }

  function getSubscriptionActions(item: Subscription) {
      return [
      {
        label: "View details",
        onClick: () => setExpandedId(item.id),
      },
      {
        label: "Preview invoice",
        onClick: () => setConfirmState({
          title: "Preview next invoice",
          description: `Generate a preview of the next invoice for ${item.customerName} without saving it?`,
          action: async () => {
            try {
              await downloadSubscriptionPreview(item.id);
              setMessage(`Preview invoice downloaded for ${item.customerName}. No invoice record was saved.`);
              setError("");
              setConfirmState(null);
            } catch (previewError) {
              setMessage("");
              const nextError = previewError instanceof Error ? previewError.message : "Unable to generate preview invoice.";
              setError(nextError);
              throw new Error(nextError);
            }
          },
        }),
      },
      {
        label: "Generate invoice now",
        disabled: getGenerateInvoiceAvailability(item).disabled,
        title: getGenerateInvoiceAvailability(item).title,
        onClick: () => setConfirmState({
          title: "Generate invoice now",
          description: `Create the next real subscription invoice now for ${item.customerName}? This saves an invoice record for the current invoice date.`,
          action: async () => {
            try {
              await api.post(`/subscriptions/${item.id}/generate-invoice`);
              setMessage(`Invoice generated for ${item.customerName}.`);
              setError("");
              setConfirmState(null);
              await load();
            } catch (generationError) {
              setMessage("");
              const nextError = generationError instanceof Error ? generationError.message : "Unable to generate invoice.";
              setError(nextError);
              throw new Error(nextError);
            }
          },
        }),
      },
      ...(canPauseSubscription(item) ? [{
        label: "Pause subscription",
        onClick: () => setConfirmState({
          title: "Pause subscription",
          description: `Pause ${item.customerName}'s subscription?`,
          action: async () => {
            await act(item.id, "pause");
            setConfirmState(null);
          },
        }),
      }] : []),
      ...(canResumeSubscription(item) ? [{
        label: "Resume subscription",
        onClick: () => setConfirmState({
          title: "Resume subscription",
          description: `Resume ${item.customerName}'s subscription?`,
          action: async () => {
            await act(item.id, "resume");
            setConfirmState(null);
          },
        }),
      }] : []),
      ...(canCancelSubscription(item) ? [{
        label: "Cancel subscription",
        tone: "danger" as const,
        onClick: () => setCancelSchedule({
          id: item.id,
          date: toDateInputValue(new Date()),
          reason: "",
        }),
      }] : []),
    ];
  }

  return (
    <div className="page subscriptions-page">
      <ResponseToast message={message} tone="success" />
      <ResponseToast message={error} tone="error" />
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Complete the company billing profile before starting subscriptions: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}
      <div className="catalog-toolbar card subtle-card pwa-filter-bar subscription-filter-bar subscriptions-theme-toolbar">
        <label className="form-label subscription-filter-search">
          Search
          <input
            aria-label="Search subscriptions"
            className="text-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search customer, company, plan, status, or notes"
          />
        </label>
        <label className="form-label subscription-filter-select">
          Status
          <select aria-label="Filter subscriptions by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "paused" | "scheduled" | "cancelled")}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="scheduled">Scheduled to end</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="form-label subscription-filter-select">
          Billing
          <select aria-label="Filter subscriptions by billing type" value={billingFilter} onChange={(event) => setBillingFilter(event.target.value as "all" | "due" | "recurring" | "one-time" | "mixed")}>
            <option value="all">All billing</option>
            <option value="due">Due now</option>
            <option value="recurring">Recurring</option>
            <option value="one-time">One-time</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
      </div>
      <section className="card subscriptions-page-card">
        <div className="card-section-header">
          <div>
            <h3 className="section-title">Subscription records</h3>
          </div>
          <div className="subscriptions-record-actions">
            <button type="button" className="button button-primary" onClick={() => navigate("/subscriptions/new")}>Add subscription</button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setConfirmState({
                title: "Run invoices now",
                description: "Generate invoices for all subscriptions whose invoice date has been reached? This uses the same invoice-date logic as the scheduled billing run.",
                action: async () => {
                  await runDueInvoicesNow();
                  setConfirmState(null);
                },
              })}
            >
              Run invoices now
            </button>
          </div>
        </div>
        {searchQuery || statusFilter !== "all" || billingFilter !== "all" ? (
          <HelperText>{`${filteredItems.length} matching subscription${filteredItems.length === 1 ? "" : "s"} found.`}</HelperText>
        ) : null}
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => {
            const rowActions = getSubscriptionActions(item);

            return (
              <article key={item.id} className="subscription-mobile-card">
                <div className="subscription-mobile-card-header">
                  <div className="subscription-mobile-identity">
                    <strong>{item.customerName}</strong>
                    <div className="eyebrow">{item.companyName}</div>
                  </div>
                  <div className="subscription-mobile-actions">
                    <RowActionMenu items={rowActions} label="More" />
                  </div>
                </div>
                <div className="subscription-mobile-summary">
                  <div className="subscription-mobile-amount">{formatCurrency(item.effectiveBillingAmount, item.currency)}</div>
                  <div className="subscription-mobile-cadence">{getSubscriptionBillingLabel(item)}</div>
                </div>
                <div className="subscription-mobile-card-topline">
                  <span className={`subscription-mobile-status subscription-mobile-status-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                  <span className="subscription-mobile-inline-note">{`Next invoice ${formatSubscriptionDate(item.nextBillingUtc)}`}</span>
                  {item.cancelAtPeriodEnd && item.currentPeriodEndUtc ? (
                    <span className="subscription-mobile-inline-note">{`Ends ${formatSubscriptionDate(item.currentPeriodEndUtc)}`}</span>
                  ) : null}
                </div>
                <div className="subscription-mobile-meta">
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Billing</span>
                    <span className="subscription-mobile-meta-value">{getSubscriptionBillingMeta(item)}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Period</span>
                    <span className="subscription-mobile-meta-value">{getSubscriptionPeriodLabel(item)}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Items</span>
                    <span className="subscription-mobile-meta-value">{`${item.items.length} item${item.items.length === 1 ? "" : "s"} | ${getSubscriptionItemsPreview(item)}`}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="subscription-table-shell">
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
            <table className="catalog-table subscription-table">
              <thead>
                <tr>
                  <th className="sticky-cell sticky-cell-left">Customer</th>
                  <th>Status</th>
                  <th>Billing</th>
                  <th>Next invoice</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pagedItems.map((item) => {
                  const rowActions = getSubscriptionActions(item);

                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td className="sticky-cell sticky-cell-left table-primary-cell">
                          <div className="subscriptions-project-primary">
                            <div className="subscriptions-project-avatar" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="4" y="4" width="16" height="16" rx="3" />
                                <path d="M8 8h8" />
                                <path d="M8 12h8" />
                                <path d="M8 16h5" />
                              </svg>
                            </div>
                            <div className="stack">
                              <div>{item.customerName}</div>
                              <div className="eyebrow">{item.companyName}</div>
                              {item.status === "Paused" ? (
                                <div className="table-meta">
                                  <span className="table-meta-item">
                                    <span className="table-meta-dot table-meta-dot-inactive" aria-hidden="true" />
                                    Paused
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`subscriptions-project-badge ${getSubscriptionStatusClass(item.status, item.cancelAtPeriodEnd)}`.trim()}>
                            {getSubscriptionStatusLabel(item.status, item.cancelAtPeriodEnd)}
                          </span>
                          {item.cancelAtPeriodEnd && item.currentPeriodEndUtc ? (
                            <div className="eyebrow">{`Scheduled to end on ${formatSubscriptionDate(item.currentPeriodEndUtc)}`}</div>
                          ) : null}
                        </td>
                        <td>
                          <div>{getSubscriptionBillingLabel(item)}</div>
                          <div className="eyebrow">{`${formatCurrency(item.effectiveBillingAmount, item.currency)} | ${getSubscriptionBillingMeta(item)}`}</div>
                        </td>
                        <td>
                          <div>{formatSubscriptionDate(item.nextBillingUtc)}</div>
                          <div className="eyebrow">{getSubscriptionPeriodLabel(item)}</div>
                        </td>
                        <td>
                          <div>{item.items.length} item{item.items.length === 1 ? "" : "s"}</div>
                          <div className="eyebrow">{item.items.map((child) => child.productPlanName).join(", ")}</div>
                        </td>
                        <td className="subscriptions-project-actions-cell">
                          <RowActionMenu items={rowActions} label="..." />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
        </div>
        {items.length === 0 ? (
          <div className="empty-state">
            <h3>No subscriptions yet</h3>
            <p className="muted">A subscription links one customer to a recurring plan and drives renewal invoices automatically.</p>
            <div className="empty-state-actions">
              <button type="button" className="button button-primary" onClick={() => navigate("/subscriptions/new")}>Create first subscription</button>
              <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            <h3>No matching subscriptions</h3>
            <p className="muted">Try a different search term or filter to find the subscription you want.</p>
          </div>
        ) : null}
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
        {cancelSchedule ? (
          <div ref={actionFormRef} className="form-stack" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Cancel subscription</p>
            <label className="form-label">
              Effective date
              <input
                className="text-input"
                type="date"
                value={cancelSchedule.date}
                onChange={(event) => setCancelSchedule((current) => current ? { ...current, date: event.target.value } : current)}
              />
            </label>
            <label className="form-label">
              Reason
              <input
                className="text-input"
                value={cancelSchedule.reason}
                onChange={(event) => setCancelSchedule((current) => current ? { ...current, reason: event.target.value } : current)}
                placeholder="Why is this subscription being cancelled?"
              />
            </label>
            <HelperText>Today cancels immediately. A future date stops renewal within the current billing period and does not prorate charges automatically.</HelperText>
            <div className="button-stack">
              <button type="button" className="button button-primary" onClick={() => setConfirmState({
                title: "Cancel subscription",
                description: cancelSchedule.date === toDateInputValue(new Date())
                  ? "Cancel this subscription immediately?"
                  : `Schedule this subscription to cancel on ${cancelSchedule.date}? This stops renewal on that date and does not prorate charges automatically.`,
                action: async () => {
                  await submitScheduledCancel();
                  setConfirmState(null);
                },
              })}>Confirm cancellation</button>
              <button type="button" className="button button-secondary" onClick={() => setCancelSchedule(null)}>Close</button>
            </div>
          </div>
        ) : null}
        {pricingEdit ? (
          <div ref={actionFormRef} className="form-stack" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Update future billing</p>
            <HelperText>Changes here affect the next invoice onward. The current period and historical invoices stay unchanged.</HelperText>
            <div className="inline-fields">
              <label className="form-label">
                Unit price
                <input className="text-input" value={pricingEdit.unitPrice} onChange={(event) => setPricingEdit((current) => current ? { ...current, unitPrice: event.target.value } : current)} />
              </label>
              <label className="form-label">
                Currency
                <input className="text-input" value={pricingEdit.currency} maxLength={3} onChange={(event) => setPricingEdit((current) => current ? { ...current, currency: event.target.value.toUpperCase() } : current)} />
              </label>
            </div>
            <div className="inline-fields">
              <label className="form-label">
                Interval
                <select value={pricingEdit.intervalUnit} onChange={(event) => setPricingEdit((current) => current ? { ...current, intervalUnit: event.target.value as "None" | "Month" | "Quarter" | "Year" } : current)}>
                  <option value="None">One-time</option>
                  <option value="Month">Month</option>
                  <option value="Quarter">Quarter</option>
                  <option value="Year">Year</option>
                </select>
              </label>
              <label className="form-label">
                Interval count
                <input className="text-input" value={pricingEdit.intervalCount} onChange={(event) => setPricingEdit((current) => current ? { ...current, intervalCount: event.target.value } : current)} />
              </label>
            </div>
            <div className="inline-fields">
              <label className="form-label">
                Quantity
                <input className="text-input" value={pricingEdit.quantity} onChange={(event) => setPricingEdit((current) => current ? { ...current, quantity: event.target.value } : current)} />
              </label>
              <label className="form-label">
                Reason
                <input className="text-input" value={pricingEdit.reason} onChange={(event) => setPricingEdit((current) => current ? { ...current, reason: event.target.value } : current)} />
              </label>
            </div>
            <div className="button-stack">
              <button type="button" className="button button-primary" onClick={() => setConfirmState({
                title: "Update subscription pricing",
                description: "Apply this billing snapshot to future renewals only?",
                action: async () => {
                  await submitPricingUpdate();
                  setConfirmState(null);
                },
              })}>Save future billing</button>
              <button type="button" className="button button-secondary" onClick={() => setPricingEdit(null)}>Close</button>
            </div>
          </div>
        ) : null}
        {migrationEdit ? (
          <div ref={actionFormRef} className="form-stack" style={{ marginTop: "1rem" }}>
            <p className="eyebrow">Migrate subscription item</p>
            <HelperText>Use this when the wrong plan was attached. This changes future billing for the selected item only and keeps historical invoices intact.</HelperText>
            <div className="inline-fields">
              <label className="form-label">
                Current plan
                <input className="text-input" value={migrationEdit.currentPlanName} readOnly />
              </label>
              <label className="form-label">
                Target plan
                <select
                  value={migrationEdit.targetProductPlanId}
                  onChange={(event) => setMigrationEdit((current) => current ? { ...current, targetProductPlanId: event.target.value } : current)}
                >
                  {migrationPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{`${plan.planName} | ${plan.billingLabel} | ${formatCurrency(plan.unitAmount, plan.currency)}`}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-label">
              Reason
              <input className="text-input" value={migrationEdit.reason} onChange={(event) => setMigrationEdit((current) => current ? { ...current, reason: event.target.value } : current)} />
            </label>
            {migrationPlans.length === 0 ? (
              <HelperText tone="error">No alternative active plans are available for this company.</HelperText>
            ) : (
              <HelperText>If the old invoice was created by mistake, void it separately before generating a new one from the migrated item.</HelperText>
            )}
            <div className="button-stack">
              <button
                type="button"
                className="button button-primary"
                disabled={!migrationEdit.targetProductPlanId}
                onClick={() => setConfirmState({
                  title: "Migrate subscription item",
                  description: "Move this item to the selected plan for future billing only?",
                  action: async () => {
                    await submitItemMigration();
                    setConfirmState(null);
                  },
                })}
              >
                Save migration
              </button>
              <button type="button" className="button button-secondary" onClick={() => { setMigrationEdit(null); setMigrationPlans([]); }}>Close</button>
            </div>
          </div>
        ) : null}
      </section>
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
      {selectedSubscription ? (
        <SubscriptionDetailDrawer
          selectedSubscription={selectedSubscription}
          onClose={() => setExpandedId(null)}
          onEditPricing={() => beginPricingEdit(selectedSubscription)}
          onMigrateItem={(subscriptionItemId, currentPlanId, currentPlanName) => {
            void startMigrationEdit(selectedSubscription, subscriptionItemId, currentPlanId, currentPlanName);
          }}
        />
      ) : null}
    </div>
  );
}
