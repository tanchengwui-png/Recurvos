import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { Button } from "../components/ui/Button";
import { HelperText } from "../components/ui/HelperText";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { fetchProductPlans } from "../hooks/useProductPlans";
import { fetchProducts } from "../hooks/useProducts";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyInvoiceSettings, Product, ProductPlan } from "../types";

export function ProductPlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<ProductPlan[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(() => {
    const value = searchParams.get("status");
    return value === "active" || value === "inactive" ? value : "all";
  });
  const [billingFilter, setBillingFilter] = useState<"all" | "OneTime" | "Recurring">(() => {
    const value = searchParams.get("billing");
    return value === "OneTime" || value === "Recurring" ? value : "all";
  });
  const [selectedProductId, setSelectedProductId] = useState(searchParams.get("product") ?? "");
  const [currentPage, setCurrentPage] = useState(() => {
    const value = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize") ?? "20");
    return Number.isFinite(value) && value > 0 ? value : 20;
  });
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(totalCount, currentPage * pageSize);
  const selectedPlan = expandedId ? plans.find((item) => item.id === expandedId) ?? null : null;
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([
    plans.length,
    expandedId,
    currentPage,
    pageSize,
    selectedProductId,
    billingFilter,
    statusFilter,
  ]);

  async function load() {
    const [productsResult, plansResult, invoiceSettingsResult] = await Promise.all([
      fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 100 }),
      fetchProductPlans({ productId: selectedProductId || undefined, billingType: billingFilter, isActive: statusFilter, page: currentPage, pageSize }),
      api.get<CompanyInvoiceSettings>("/settings/invoice-settings").catch(() => null),
    ]);
    setProducts(productsResult.items);
    setPlans(plansResult.items);
    setTotalCount(plansResult.totalCount);
    setInvoiceSettings(invoiceSettingsResult);
  }

  useEffect(() => {
    void load();
  }, [selectedProductId, billingFilter, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedProductId, billingFilter, statusFilter]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (selectedProductId) {
      nextParams.set("product", selectedProductId);
    } else {
      nextParams.delete("product");
    }

    if (billingFilter !== "all") {
      nextParams.set("billing", billingFilter);
    } else {
      nextParams.delete("billing");
    }

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    if (currentPage > 1) {
      nextParams.set("page", String(currentPage));
    } else {
      nextParams.delete("page");
    }

    if (pageSize !== 20) {
      nextParams.set("pageSize", String(pageSize));
    } else {
      nextParams.delete("pageSize");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [billingFilter, currentPage, pageSize, searchParams, selectedProductId, setSearchParams, statusFilter]);

  useEffect(() => {
    const state = location.state;
    const flashMessage = state && typeof state === "object" && "flashMessage" in state ? state.flashMessage : null;

    if (typeof flashMessage !== "string" || !flashMessage) {
      return;
    }

    setMessage(flashMessage);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!selectedPlan) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPlan]);

  useEffect(() => {
    if (!selectedPlan) {
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
  }, [selectedPlan]);

  function calculateTaxInclusiveAmount(amount: number) {
    if (!invoiceSettings?.isTaxEnabled || !invoiceSettings.taxRate) {
      return null;
    }

    return amount + (amount * invoiceSettings.taxRate / 100);
  }

  function getPlanStatusClassName(plan: ProductPlan) {
    return plan.isActive ? "subscription-mobile-status-active" : "subscription-mobile-status-inactive";
  }

  function getPlanActions(plan: ProductPlan) {
    return [
      { label: expandedId === plan.id ? "Hide details" : "View details", onClick: () => setExpandedId((current) => current === plan.id ? null : plan.id) },
      { label: "Edit plan", onClick: () => navigate(`/plans/${plan.id}/edit`) },
      ...(plan.isInUse ? [{ label: "Duplicate plan", onClick: () => navigate("/plans/new", { state: { duplicatePlanId: plan.id } }) }] : []),
      plan.isActive && plan.isDefault
        ? {
            label: "Deactivate plan",
            title: `This is the default plan for ${plan.productName}. Set another plan in the same product as default before deactivating it.`,
            onClick: () => {
              setConfirmState(null);
              setActionError(`This is the default plan for ${plan.productName}. Set another plan in the same product as default before deactivating it.`);
            },
          }
        : {
            label: plan.isActive ? "Deactivate plan" : "Activate plan",
            onClick: () => {
              setActionError("");
              setConfirmState({
                title: `${plan.isActive ? "Deactivate" : "Activate"} plan`,
                description: `${plan.planName} will ${plan.isActive ? "stop" : "start"} appearing as an active plan.`,
                action: async () => {
                  try {
                    await api.patch(`/product-plans/${plan.id}/status`, { isActive: !plan.isActive });
                    setConfirmState(null);
                    await load();
                  } catch (error) {
                    const nextError = error instanceof Error ? error.message : "Unable to update plan status.";
                    setActionError(nextError);
                    throw new Error(nextError);
                  }
                },
              });
            },
          },
      {
        label: "Delete plan",
        tone: "danger" as const,
        onClick: () => {
          setActionError("");
          setConfirmState({
            title: "Delete plan",
            description: `Delete ${plan.planName}? This is blocked if the plan is linked to subscriptions.`,
            action: async () => {
              try {
                await api.delete(`/product-plans/${plan.id}`);
                setConfirmState(null);
                await load();
              } catch (error) {
                const nextError = error instanceof Error ? error.message : "Unable to delete plan.";
                setActionError(nextError);
                throw new Error(nextError);
              }
            },
          });
        },
      },
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing catalog</p>
          <h2>Plans</h2>
          <p className="muted">Monthly, quarterly, yearly, and one-time billing plans for your products.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => navigate("/plans/new")}>Add plan</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}

      <div className="catalog-toolbar card subtle-card pwa-filter-bar">
        <select aria-label="Filter plans by product" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
          <option value="">All products</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select aria-label="Filter plans by billing type" value={billingFilter} onChange={(event) => setBillingFilter(event.target.value as "all" | "OneTime" | "Recurring")}>
          <option value="all">All billing types</option>
          <option value="Recurring">Recurring</option>
          <option value="OneTime">One-Time</option>
        </select>
        <select aria-label="Filter plans by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <section className="card">
        {actionError ? <HelperText tone="error">{actionError}</HelperText> : null}
        <div className="subscription-mobile-list">
          {plans.map((plan) => {
            const taxInclusiveAmount = calculateTaxInclusiveAmount(plan.unitAmount);

            return (
              <article key={plan.id} className="subscription-mobile-card">
                <div className="subscription-mobile-card-header">
                  <div className="subscription-mobile-identity">
                    <strong>{plan.planName}</strong>
                    <div className="eyebrow">{plan.productName}</div>
                  </div>
                  <div className="subscription-mobile-actions">
                    <RowActionMenu items={getPlanActions(plan)} label="More" />
                  </div>
                </div>
                <div className="subscription-mobile-summary">
                  <div className="subscription-mobile-amount">{formatCurrency(plan.unitAmount, plan.currency)}</div>
                  <div className="subscription-mobile-cadence">{plan.billingLabel}</div>
                </div>
                <div className="subscription-mobile-card-topline">
                  <span className={`subscription-mobile-status ${getPlanStatusClassName(plan)}`}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </span>
                  {plan.isDefault ? <span className="subscription-mobile-inline-note">Default plan</span> : null}
                  {plan.isInUse ? <span className="subscription-mobile-inline-note">In use</span> : null}
                </div>
                <div className="subscription-mobile-meta">
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Product</span>
                    <span className="subscription-mobile-meta-value">{plan.productName}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Plan code</span>
                    <span className="subscription-mobile-meta-value">{plan.planCode}</span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Billing</span>
                    <span className="subscription-mobile-meta-value">
                      {`${plan.billingType === "OneTime" ? "One-time charge" : "Recurring billing"} | ${plan.billingLabel}`}
                    </span>
                  </div>
                  <div className="subscription-mobile-meta-row">
                    <span className="subscription-mobile-meta-label">Tax</span>
                    <span className="subscription-mobile-meta-value">
                      {taxInclusiveAmount
                        ? `Incl. tax ${formatCurrency(taxInclusiveAmount, plan.currency)}`
                        : `${plan.currency} | ${plan.taxBehavior}`}
                    </span>
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
            <table className="catalog-table subscription-table plans-table">
              <thead>
                <tr>
                  <th className="sticky-cell sticky-cell-left">Plan</th>
                  <th>Status</th>
                  <th>Billing</th>
                  <th>Amount</th>
                  <th>Product</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="sticky-cell sticky-cell-left table-primary-cell">
                      <div className="table-primary-cell-stack">
                        <div className="stack">
                          <div>{plan.planName}</div>
                          <div className="eyebrow">{plan.productName}</div>
                          {plan.isDefault || plan.isInUse ? (
                            <div className="table-meta">
                              {plan.isDefault ? (
                                <span className="table-meta-item">
                                  <span className="table-meta-dot table-meta-dot-active" aria-hidden="true" />
                                  Default
                                </span>
                              ) : null}
                              {plan.isDefault && plan.isInUse ? <span className="table-meta-item">In use</span> : null}
                              {!plan.isDefault && plan.isInUse ? <span className="table-meta-item">In use</span> : null}
                            </div>
                          ) : null}
                        </div>
                        <RowActionMenu items={getPlanActions(plan)} />
                      </div>
                    </td>
                    <td>
                      <div>{plan.isActive ? "Active" : "Inactive"}</div>
                      <div className="eyebrow">{plan.isInUse ? "Linked to subscriptions" : "Ready to use"}</div>
                    </td>
                    <td>
                      <div>{plan.billingLabel}</div>
                      <div className="eyebrow">{plan.billingType === "OneTime" ? "One-time charge" : "Recurring billing"}</div>
                    </td>
                    <td>
                      <div>{formatCurrency(plan.unitAmount, plan.currency)}</div>
                      <div className="eyebrow">
                        {calculateTaxInclusiveAmount(plan.unitAmount)
                          ? `Incl. tax ${formatCurrency(calculateTaxInclusiveAmount(plan.unitAmount) ?? plan.unitAmount, plan.currency)}`
                          : `${plan.currency} | ${plan.taxBehavior}`}
                      </div>
                    </td>
                    <td>
                      <div>{plan.planCode}</div>
                      <div className="eyebrow">{selectedProductId ? "Filtered product" : "Catalog product"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
        </div>
        {plans.length === 0 ? (
          <div className="empty-state">
            <h3>No plans yet</h3>
            <p className="muted">Plans define how often and how much customers are charged. Start with a monthly or yearly plan.</p>
            <div className="empty-state-actions">
              <Button type="button" onClick={() => navigate("/plans/new")}>Create first plan</Button>
              <Button type="button" variant="secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</Button>
            </div>
          </div>
        ) : null}
        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>
      {selectedPlan ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div className="card invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="plan-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Plan detail</p>
                <h3 id="plan-detail-title">{selectedPlan.planName}</h3>
                <p className="muted">{selectedPlan.productName}</p>
              </div>
              <div className="button-stack">
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  onClick={() => {
                    setExpandedId(null);
                    navigate(`/plans/${selectedPlan.id}/edit`);
                  }}
                >
                  Edit plan
                </button>
                <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
              </div>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat"><p className="eyebrow">Amount</p><strong>{formatCurrency(selectedPlan.unitAmount, selectedPlan.currency)}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Billing</p><strong>{selectedPlan.billingLabel}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Status</p><strong>{selectedPlan.isActive ? "Active" : "Inactive"}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Default</p><strong>{selectedPlan.isDefault ? "Yes" : "No"}</strong></div>
                </div>
                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Terms</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Plan code</span><strong>{selectedPlan.planCode}</strong></div>
                        <div className="invoice-detail-list-row"><span>Billing type</span><strong>{selectedPlan.billingType === "OneTime" ? "One-Time" : "Recurring"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Interval</span><strong>{selectedPlan.billingLabel}</strong></div>
                        <div className="invoice-detail-list-row"><span>Tax behavior</span><strong>{selectedPlan.taxBehavior}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="invoice-detail-aside">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Usage</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Product</span><strong>{selectedPlan.productName}</strong></div>
                        <div className="invoice-detail-list-row"><span>In use</span><strong>{selectedPlan.isInUse ? "Yes" : "No"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Default plan</span><strong>{selectedPlan.isDefault ? "Yes" : "No"}</strong></div>
                        {calculateTaxInclusiveAmount(selectedPlan.unitAmount) ? (
                          <div className="invoice-detail-list-row invoice-detail-list-row-top"><span>Incl. tax</span><strong className="invoice-detail-align-right">{formatCurrency(calculateTaxInclusiveAmount(selectedPlan.unitAmount) ?? selectedPlan.unitAmount, selectedPlan.currency)}</strong></div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
