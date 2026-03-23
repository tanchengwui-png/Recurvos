import { Fragment, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { BillingReadiness, CompanyLookup, Customer, ProductPlan, Subscription } from "../types";

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

function getEarliestSubscriptionStartDate() {
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - 3);
  return toDateInputValue(earliest);
}

export function SubscriptionsPage() {
  const earliestSubscriptionStartDate = getEarliestSubscriptionStartDate();
  const navigate = useNavigate();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const pricingFormRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Subscription[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<ProductPlan[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelSchedule, setCancelSchedule] = useState<{ id: string; date: string } | null>(null);
  const [pricingEdit, setPricingEdit] = useState<{ id: string; unitPrice: string; currency: string; intervalUnit: "None" | "Month" | "Quarter" | "Year"; intervalCount: string; quantity: string; reason: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pagination = useClientPagination(items, [items.length], 20);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, expandedId, pagination.currentPage, pagination.pageSize]);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [dueInvoiceCount, setDueInvoiceCount] = useState<number | null>(null);
  const [form, setForm] = useState({
    companyId: "",
    customerId: "",
    productPlanId: "",
    quantity: "1",
    items: [] as { productPlanId: string; quantity: number }[],
    startDateUtc: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const selectedPlan = plans.find((plan) => plan.id === form.productPlanId);
  const trialPreviewEnd = selectedPlan?.trialDays && selectedPlan.trialDays > 0
    ? new Date(new Date(form.startDateUtc).getTime() + selectedPlan.trialDays * 24 * 60 * 60 * 1000)
    : null;
  const missingBillingItems = billingReadiness?.items.filter((item) => item.required && !item.done) ?? [];
  const customerExistingSubscriptions = items.filter((item) => item.companyId === form.companyId
    && item.customerId === form.customerId
    && !item.endedAtUtc
    && item.status !== "Cancelled");
  const duplicateDraftItems = form.items
    .map((draftItem) => {
      const plan = plans.find((planOption) => planOption.id === draftItem.productPlanId);
      const existingSubscriptions = customerExistingSubscriptions.filter((subscription) => subscription.items.some((subscriptionItem) => subscriptionItem.productPlanId === draftItem.productPlanId));

      return existingSubscriptions.length > 0
        ? {
            productPlanId: draftItem.productPlanId,
            planName: plan?.planName ?? draftItem.productPlanId,
            count: existingSubscriptions.length,
          }
        : null;
    })
    .filter((item): item is { productPlanId: string; planName: string; count: number } => item !== null);
  const hasDuplicateSubscriptionWarning = customerExistingSubscriptions.length > 0;
  const duplicateSubscriptionMessage = duplicateDraftItems.length > 0
    ? `This customer already has ${duplicateDraftItems.map((item) => `${item.planName} (${item.count})`).join(", ")} on another active subscription. Double-check before creating another one.`
    : hasDuplicateSubscriptionWarning
      ? `This customer already has ${customerExistingSubscriptions.length} active or paused subscription${customerExistingSubscriptions.length === 1 ? "" : "s"}. Double-check before creating another one.`
      : "";

  async function load() {
    const [subscriptions, customerList, companyList, dueInvoices] = await Promise.all([
      api.get<Subscription[]>("/subscriptions"),
      api.get<Customer[]>("/customers"),
      api.get<CompanyLookup[]>("/companies"),
      api.get<{ count: number }>("/subscriptions/due-invoices/count"),
    ]);

    setItems(subscriptions);
    setCustomers(customerList);
    setCompanies(companyList);
    setDueInvoiceCount(dueInvoices.count);

    const activeCompanyId = form.companyId || companyList[0]?.id || "";
    if (!activeCompanyId) {
      setPlans([]);
      return;
    }

    const companyPlans = await api.get<ProductPlan[]>(`/companies/${activeCompanyId}/product-plans`);
    const readiness = await api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${activeCompanyId}`);
    setPlans(companyPlans);
    setBillingReadiness(readiness);
    setForm((current) => ({
      ...current,
      companyId: activeCompanyId,
      customerId: customerList.some((customer) => customer.id === current.customerId) ? current.customerId : customerList[0]?.id ?? "",
      productPlanId: companyPlans.some((plan) => plan.id === current.productPlanId) ? current.productPlanId : companyPlans[0]?.id ?? "",
    }));
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    async function syncSelectedCompany() {
      if (!form.companyId) {
        return;
      }

      const companyPlans = await api.get<ProductPlan[]>(`/companies/${form.companyId}/product-plans`);
      const readiness = await api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${form.companyId}`);
      setPlans(companyPlans);
      setBillingReadiness(readiness);
      setForm((current) => ({
        ...current,
        customerId: customers.some((customer) => customer.id === current.customerId) ? current.customerId : customers[0]?.id ?? "",
        productPlanId: companyPlans.some((plan) => plan.id === current.productPlanId) ? current.productPlanId : companyPlans[0]?.id ?? "",
      }));
    }

    void syncSelectedCompany();
  }, [form.companyId, customers]);

  useEffect(() => {
    if (!pricingEdit) {
      return;
    }

    pricingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pricingEdit]);

  async function createSubscription(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (billingReadiness && !billingReadiness.isReady) {
      setConfirmState(null);
      setError(`Complete the company billing profile before starting subscriptions: ${missingBillingItems.map((item) => item.title).join(", ")}.`);
      return;
    }

    if (form.items.length === 0) {
      setConfirmState(null);
      setError("Add at least one plan before creating a subscription.");
      return;
    }

    const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
    setConfirmState({
      title: "Create subscription",
      description: hasDuplicateSubscriptionWarning
        ? `${selectedCustomer?.name || "This customer"} already has another active subscription. Create another one anyway?`
        : `Create a subscription for ${selectedCustomer?.name || "the selected customer"}?`,
      action: async () => {
        try {
          if (form.startDateUtc < earliestSubscriptionStartDate) {
            throw new Error("Start date cannot be more than 3 months in the past.");
          }

          await api.post("/subscriptions", {
            customerId: form.customerId,
            startDateUtc: new Date(form.startDateUtc).toISOString(),
            notes: form.notes,
            items: form.items,
          });
          setConfirmState(null);
          setForm((current) => ({ ...current, items: [] }));
          await load();
        } catch (submitError) {
          setConfirmState(null);
          setError(submitError instanceof Error ? submitError.message : "Unable to create subscription.");
        }
      },
    });
  }

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
      ? { endOfPeriod: false }
      : {
          endOfPeriod: true,
          effectiveDateUtc: new Date(cancelSchedule.date).toISOString(),
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

  function addDraftItem() {
    if (!form.productPlanId) {
      return;
    }

    setForm((current) => {
      const existing = current.items.find((item) => item.productPlanId === current.productPlanId);
      if (existing) {
        return {
          ...current,
          quantity: "1",
          items: current.items.map((item) => item.productPlanId === current.productPlanId
            ? { ...item, quantity: item.quantity + Number(current.quantity || "1") }
            : item),
        };
      }

      return {
        ...current,
        quantity: "1",
        items: [...current.items, { productPlanId: current.productPlanId, quantity: Number(current.quantity || "1") }],
      };
    });
  }

  function removeDraftItem(productPlanId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.productPlanId !== productPlanId),
    }));
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Lifecycle management</p>
          <h2>Subscriptions</h2>
          {dueInvoiceCount !== null ? (
            <p className="muted">
              {dueInvoiceCount > 0
                ? `${dueInvoiceCount} subscription${dueInvoiceCount === 1 ? "" : "s"} ${dueInvoiceCount === 1 ? "is" : "are"} ready for invoice generation.`
                : "No subscriptions are waiting for invoice generation right now."}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setConfirmState({
            title: "Run due invoices now",
            description: "Generate invoices for all subscriptions that are currently due? This uses the same due-invoice logic as the scheduled billing run.",
            action: async () => {
              await runDueInvoicesNow();
              setConfirmState(null);
            },
          })}
        >
          Run due invoices now
        </button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Complete the company billing profile before starting subscriptions: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}
      <div className="grid-two">
        <section className="card">
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
                  <th>Current period</th>
                  <th>Next billing</th>
                  <th>Lifecycle</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pagedItems.map((item) => (
                  <Fragment key={item.id}>
                    <tr key={item.id}>
                      <td className="sticky-cell sticky-cell-left table-primary-cell">
                        <div className="table-primary-cell-stack">
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
                          <RowActionMenu
                            items={[
                              {
                                label: expandedId === item.id ? "Hide details" : "View details",
                                onClick: () => setExpandedId((current) => current === item.id ? null : item.id),
                              },
                              {
                                label: "Preview invoice",
                                onClick: () => setConfirmState({
                                  title: "Preview renewal invoice",
                                  description: `Generate a preview invoice for ${item.customerName} without saving it?`,
                                  action: async () => {
                                    try {
                                      await downloadSubscriptionPreview(item.id);
                                      setMessage(`Preview invoice downloaded for ${item.customerName}. No invoice record was saved.`);
                                      setError("");
                                      setConfirmState(null);
                                    } catch (previewError) {
                                      setMessage("");
                                      setConfirmState(null);
                                      setError(previewError instanceof Error ? previewError.message : "Unable to generate preview invoice.");
                                    }
                                  },
                                }),
                              },
                              {
                                label: "Generate invoice now",
                                onClick: () => setConfirmState({
                                  title: "Generate invoice now",
                                  description: `Create a real subscription invoice now for ${item.customerName}? This uses the current billing cycle and saves an invoice record.`,
                                  action: async () => {
                                    try {
                                      await api.post(`/subscriptions/${item.id}/generate-invoice`);
                                      setMessage(`Invoice generated for ${item.customerName}.`);
                                      setError("");
                                      setConfirmState(null);
                                      await load();
                                    } catch (generationError) {
                                      setMessage("");
                                      setConfirmState(null);
                                      setError(generationError instanceof Error ? generationError.message : "Unable to generate invoice.");
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
                                }),
                              }] : []),
                            ]}
                          />
                        </div>
                      </td>
                      <td>
                        <div>{item.status}</div>
                        {item.cancelAtPeriodEnd && item.currentPeriodEndUtc ? (
                          <div className="eyebrow">{`Scheduled to end on ${new Date(item.currentPeriodEndUtc).toLocaleDateString()}`}</div>
                        ) : null}
                      </td>
                      <td>
                        <div>{item.hasMixedBillingIntervals ? "Mixed billing" : item.intervalUnit === "None" ? "One-time" : `${item.intervalCount} ${item.intervalUnit}`}</div>
                        <div className="eyebrow">{item.hasMixedBillingIntervals ? `${item.items.length} item schedules` : `${formatCurrency(item.unitPrice, item.currency)} x ${item.quantity}`}</div>
                      </td>
                      <td>
                        {item.currentPeriodStartUtc && item.currentPeriodEndUtc
                          ? `${new Date(item.currentPeriodStartUtc).toLocaleDateString()} to ${new Date(item.currentPeriodEndUtc).toLocaleDateString()}`
                          : "-"}
                      </td>
                      <td>{item.nextBillingUtc ? new Date(item.nextBillingUtc).toLocaleDateString() : "-"}</td>
                      <td>
                        {item.endedAtUtc ? `Ended ${new Date(item.endedAtUtc).toLocaleDateString()}` : item.cancelAtPeriodEnd && item.currentPeriodEndUtc
                          ? `Cancels ${new Date(item.currentPeriodEndUtc).toLocaleDateString()}`
                          : item.autoRenew ? "Auto renew on" : "No auto renew"}
                      </td>
                      <td>{item.items.map((child) => `${child.productPlanName} x${child.quantity}${child.intervalUnit !== "None" ? ` (${child.intervalCount} ${child.intervalUnit})` : ""}`).join(", ")}</td>
                    </tr>
                    {expandedId === item.id ? (
                      <tr>
                        <td colSpan={7} className="subscription-details-cell">
                          <div className="subscription-details-grid">
                            <div>
                              <p className="eyebrow">Trial</p>
                              <p>{item.isTrialing && item.trialEndUtc ? `Ends ${new Date(item.trialEndUtc).toLocaleDateString()}` : "No active trial"}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Billing Snapshot</p>
                              <p>{item.hasMixedBillingIntervals ? "This subscription contains multiple billing cadences. See item schedules below." : `${formatCurrency(item.unitPrice, item.currency)} | ${item.intervalUnit === "None" ? "One-time" : `${item.intervalCount} ${item.intervalUnit}`} | Quantity ${item.quantity}`}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Effective Billing</p>
                              <p>{formatCurrency(item.effectiveBillingAmount, item.currency)}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Auto Renew</p>
                              <p>{item.autoRenew ? "Yes" : "No"}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Cancel At Period End</p>
                              <p>{item.cancelAtPeriodEnd ? "Yes" : "No"}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Effective Cancel Date</p>
                              <p>{item.cancelAtPeriodEnd && item.currentPeriodEndUtc ? new Date(item.currentPeriodEndUtc).toLocaleDateString() : "-"}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Canceled At</p>
                              <p>{item.canceledAtUtc ? new Date(item.canceledAtUtc).toLocaleString() : "-"}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Ended At</p>
                              <p>{item.endedAtUtc ? new Date(item.endedAtUtc).toLocaleString() : "-"}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Created</p>
                              <p>{new Date(item.createdAtUtc).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="eyebrow">Updated</p>
                              <p>{item.updatedAtUtc ? new Date(item.updatedAtUtc).toLocaleString() : "-"}</p>
                            </div>
                            <div className="subscription-detail-wide">
                              <p className="eyebrow">Notes</p>
                              <p>{item.notes || "-"}</p>
                            </div>
                            <div className="subscription-detail-wide">
                              <p className="eyebrow">Item Schedules</p>
                              <div className="stack dashboard-list">
                                {item.items.map((child) => (
                                  <div key={child.id} className="dashboard-list-item">
                                    <div>
                                      <strong>{child.productPlanName}</strong>
                                      <p className="muted">{`${formatCurrency(child.unitAmount, child.currency)} x ${child.quantity} | ${child.intervalUnit === "None" ? "One-time" : `${child.intervalCount} ${child.intervalUnit}`} | Auto renew: ${child.autoRenew ? "Yes" : "No"}`}</p>
                                    </div>
                                    <div className="dashboard-list-metric">
                                      <strong>{child.nextBillingUtc ? new Date(child.nextBillingUtc).toLocaleDateString() : "-"}</strong>
                                      <p className="muted">{child.currentPeriodStartUtc && child.currentPeriodEndUtc ? `${new Date(child.currentPeriodStartUtc).toLocaleDateString()} to ${new Date(child.currentPeriodEndUtc).toLocaleDateString()}` : "No active period"}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="subscription-detail-wide">
                              <div className="row">
                                <div>
                                  <p className="eyebrow">Future Billing Price</p>
                                  <p>{item.items.length === 1 ? "Affects next renewal only. Historical invoices stay unchanged." : "Single-item subscriptions only for now."}</p>
                                </div>
                                <button
                                  type="button"
                                  className="button button-secondary"
                                  disabled={item.items.length !== 1}
                                  onClick={() => setPricingEdit({
                                    id: item.id,
                                    unitPrice: String(item.unitPrice),
                                    currency: item.currency,
                                    intervalUnit: item.intervalUnit,
                                    intervalCount: String(item.intervalCount),
                                    quantity: String(item.quantity),
                                    reason: "",
                                  })}
                                >
                                  Edit pricing
                                </button>
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
            {items.length === 0 ? (
              <div className="empty-state">
                <h3>No subscriptions yet</h3>
                <p className="muted">A subscription links one customer to a recurring plan and drives renewal invoices automatically.</p>
                <div className="empty-state-actions">
                  <button type="submit" className="button button-primary" form="subscription-create-form">Create first subscription</button>
                  <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
          <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
          {cancelSchedule ? (
            <div className="form-stack" style={{ marginTop: "1rem" }}>
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
              <HelperText>Today cancels immediately. A future date schedules cancellation within the current billing period.</HelperText>
              <div className="button-stack">
                <button type="button" className="button button-primary" onClick={() => setConfirmState({
                  title: "Cancel subscription",
                  description: cancelSchedule.date === toDateInputValue(new Date())
                    ? "Cancel this subscription immediately?"
                    : `Schedule this subscription to cancel on ${cancelSchedule.date}?`,
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
            <div ref={pricingFormRef} className="form-stack" style={{ marginTop: "1rem" }}>
              <p className="eyebrow">Update future billing</p>
              <HelperText>Changes here affect the next renewal only. The current period and historical invoices stay unchanged.</HelperText>
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
        </section>
        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Create subscription</p>
              <h3 className="section-title">Start customer billing</h3>
              <p className="muted form-intro">Pick the customer and plans to start billing. One-time items are billed on the first invoice only.</p>
            </div>
          </div>
          <form id="subscription-create-form" className="form-stack" onSubmit={createSubscription}>
            <label className="form-label">
              Company
              <select value={form.companyId} onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Customer
              <select value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
            {hasDuplicateSubscriptionWarning ? (
              <HelperText tone="error">
                {duplicateSubscriptionMessage}
              </HelperText>
            ) : null}
            <label className="form-label">
              Plan
              <select value={form.productPlanId} onChange={(event) => setForm((current) => ({ ...current, productPlanId: event.target.value }))}>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.planName} - {formatCurrency(plan.unitAmount, plan.currency)}</option>
                ))}
              </select>
            </label>
            {selectedPlan?.trialDays && selectedPlan.trialDays > 0 ? (
              <HelperText>{`${selectedPlan.trialDays}-day trial${trialPreviewEnd ? ` | Trial ends on ${trialPreviewEnd.toISOString().slice(0, 10)}` : ""}`}</HelperText>
            ) : (
              <HelperText>No trial on this plan</HelperText>
            )}
            {selectedPlan ? (
              <HelperText>{`Price: ${formatCurrency(selectedPlan.unitAmount, selectedPlan.currency)} | Billing: ${selectedPlan.billingLabel} | Auto Renew: ${selectedPlan.billingType === "Recurring" ? "Yes" : "No"} | Billing snapshot stored on subscription`}</HelperText>
            ) : null}
            <label className="form-label">
              Quantity
              <input className="text-input" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
            </label>
            <button type="button" className="button button-secondary" onClick={addDraftItem}>Add item</button>
            {form.items.length > 0 ? (
              <div className="stack">
                {form.items.map((item) => {
                  const plan = plans.find((planOption) => planOption.id === item.productPlanId);
                  return (
                    <div key={item.productPlanId} className="dashboard-list-item">
                      <div>
                        <strong>{plan?.planName ?? item.productPlanId}</strong>
                        <p className="muted">{`${formatCurrency(plan?.unitAmount ?? 0, plan?.currency ?? "MYR")} x ${item.quantity} | ${plan?.billingLabel ?? "Billing unavailable"}`}</p>
                      </div>
                      <button type="button" className="button button-secondary" onClick={() => removeDraftItem(item.productPlanId)}>Remove</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <HelperText>Add one or more plans. Mixed recurring and one-time items are allowed.</HelperText>
            )}
            <label className="form-label">
              Start date
              <input className="text-input" type="date" min={earliestSubscriptionStartDate} value={form.startDateUtc} onChange={(event) => setForm((current) => ({ ...current, startDateUtc: event.target.value }))} />
            </label>
            <HelperText>You can backdate the start date by up to 3 months.</HelperText>
            <label className="form-label">
              Notes
              <input className="text-input" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            {error ? <HelperText tone="error">{error}</HelperText> : null}
            {billingReadiness && !billingReadiness.isReady ? (
              <HelperText tone="error">
                {`Before creating a subscription, complete: ${missingBillingItems.map((item) => item.title).join(", ")}.`}
              </HelperText>
            ) : null}
            <button type="submit" className="button button-primary" disabled={form.items.length === 0 || billingReadiness === null}>Create subscription</button>
          </form>
        </section>
      </div>
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
