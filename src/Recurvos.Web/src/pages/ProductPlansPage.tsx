import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { fetchProductPlans } from "../hooks/useProductPlans";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyInvoiceSettings, Product, ProductPlan } from "../types";

type PlanFormState = {
  id?: string;
  productId: string;
  planName: string;
  planCode: string;
  billingType: "OneTime" | "Recurring";
  intervalUnit: "None" | "Month" | "Quarter" | "Year";
  intervalCount: string;
  currency: string;
  unitAmount: string;
  trialDays: string;
  setupFeeAmount: string;
  taxBehavior: "Exclusive" | "Inclusive" | "Unspecified";
  isDefault: boolean;
  isActive: boolean;
  sortOrder: string;
};

  const emptyForm: PlanFormState = {
  productId: "",
  planName: "",
  planCode: "",
  billingType: "Recurring",
  intervalUnit: "Month",
  intervalCount: "1",
    currency: "MYR",
  unitAmount: "49.00",
  trialDays: "0",
  setupFeeAmount: "0",
  taxBehavior: "Unspecified",
  isDefault: false,
  isActive: true,
  sortOrder: "0",
};

export function ProductPlansPage() {
  const navigate = useNavigate();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<ProductPlan[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [billingFilter, setBillingFilter] = useState<"all" | "OneTime" | "Recurring">("all");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(totalCount, currentPage * pageSize);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([plans.length, selectedProductId, billingFilter, statusFilter, currentPage, pageSize]);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const editingPlan = form.id ? plans.find((plan) => plan.id === form.id) ?? null : null;
  const billingTermsLocked = editingPlan?.isInUse ?? false;

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
    if (!form.productId && productsResult.items[0]) {
      setForm((current) => ({ ...current, productId: productsResult.items[0].id }));
    }
  }

  useEffect(() => {
    void load();
  }, [selectedProductId, billingFilter, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedProductId, billingFilter, statusFilter]);

  function normalizePlanCode(value: string) {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
  }

  function calculateTaxInclusiveAmount(amount: number) {
    if (!invoiceSettings?.isTaxEnabled || !invoiceSettings.taxRate) {
      return null;
    }

    return amount + (amount * invoiceSettings.taxRate / 100);
  }

  async function submit() {
    setFormError("");
    const payload = {
      productId: form.productId,
      planName: form.planName,
      planCode: normalizePlanCode(form.planCode),
      billingType: form.billingType,
      intervalUnit: form.billingType === "OneTime" ? "None" : form.intervalUnit,
      intervalCount: form.billingType === "OneTime" ? 0 : Number(form.intervalCount),
      currency: "MYR",
      unitAmount: Number(form.unitAmount),
      trialDays: form.billingType === "OneTime" ? 0 : Number(form.trialDays),
      setupFeeAmount: Number(form.setupFeeAmount),
      taxBehavior: form.taxBehavior,
      isDefault: form.isDefault,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder),
    };

    setConfirmState({
      title: form.id ? "Update plan" : "Create plan",
      description: form.id
        ? `Save changes to ${form.planName || "this plan"}?`
        : `Create ${form.planName || "this plan"} for the selected product?`,
      action: async () => {
        setIsSubmitting(true);
        try {
          if (form.id) {
            await api.put(`/product-plans/${form.id}`, payload);
          } else {
            await api.post(`/products/${form.productId}/plans`, payload);
          }

          setForm((current) => ({ ...emptyForm, productId: current.productId }));
          setConfirmState(null);
          await load();
        } catch (error) {
          setConfirmState(null);
          setFormError(error instanceof Error ? error.message : "Unable to save plan.");
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  function startEdit(plan: ProductPlan) {
    setActionError("");
    setForm({
      id: plan.id,
      productId: plan.productId,
      planName: plan.planName,
      planCode: plan.planCode,
      billingType: plan.billingType,
      intervalUnit: plan.intervalUnit,
      intervalCount: String(plan.intervalCount),
      currency: plan.currency,
      unitAmount: String(plan.unitAmount),
      trialDays: String(plan.trialDays),
      setupFeeAmount: String(plan.setupFeeAmount),
      taxBehavior: plan.taxBehavior,
      isDefault: plan.isDefault,
      isActive: plan.isActive,
      sortOrder: String(plan.sortOrder),
    });
    setFormError("");
  }

  function startDuplicate(plan: ProductPlan) {
    setActionError("");
    setForm({
      id: undefined,
      productId: plan.productId,
      planName: `${plan.planName} Copy`,
      planCode: normalizePlanCode(`${plan.planCode}-COPY`),
      billingType: plan.billingType,
      intervalUnit: plan.intervalUnit,
      intervalCount: String(plan.intervalCount),
      currency: plan.currency,
      unitAmount: String(plan.unitAmount),
      trialDays: String(plan.trialDays),
      setupFeeAmount: String(plan.setupFeeAmount),
      taxBehavior: plan.taxBehavior,
      isDefault: false,
      isActive: true,
      sortOrder: String(plan.sortOrder),
    });
    setFormError("");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing catalog</p>
          <h2>Plans</h2>
          <p className="muted">Monthly, quarterly, yearly, and one-time billing plans for your products.</p>
        </div>
      </header>

      <div className="catalog-toolbar card subtle-card">
        <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
          <option value="">All products</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select value={billingFilter} onChange={(event) => setBillingFilter(event.target.value as "all" | "OneTime" | "Recurring")}>
          <option value="all">All billing types</option>
          <option value="Recurring">Recurring</option>
          <option value="OneTime">One-Time</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="grid-two">
        <section className="card">
          {actionError ? <HelperText tone="error">{actionError}</HelperText> : null}
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
            <table className="catalog-table plans-table">
              <thead>
                <tr>
                  <th className="sticky-cell sticky-cell-left">Plan Name</th>
                  <th>Amount</th>
                  <th>Plan Code</th>
                  <th>Billing Type</th>
                  <th>Interval</th>
                  <th>Trial Days</th>
                  <th>Setup Fee</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="sticky-cell sticky-cell-left table-primary-cell">
                      <div className="table-primary-cell-inner">
                        <div className="stack">
                          <span className="table-primary-title" title={plan.planName}>{plan.planName}</span>
                          <div className="table-meta">
                            <span className="table-meta-item table-meta-item-truncate" title={plan.productName}>{plan.productName}</span>
                            <span className="table-meta-item">
                              <span className={`table-meta-dot ${plan.isActive ? "table-meta-dot-active" : "table-meta-dot-inactive"}`} aria-hidden="true" />
                              {plan.isActive ? "Active" : "Inactive"}
                            </span>
                            {plan.isDefault ? <span className="table-meta-item">Default</span> : null}
                          </div>
                        </div>
                        <RowActionMenu
                          items={[
                            { label: "Edit plan", onClick: () => startEdit(plan) },
                            ...(plan.isInUse ? [{ label: "Duplicate plan", onClick: () => startDuplicate(plan) }] : []),
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
                                          setConfirmState(null);
                                          setActionError(error instanceof Error ? error.message : "Unable to update plan status.");
                                        }
                                      },
                                    });
                                  },
                                },
                            {
                              label: "Delete plan",
                              tone: "danger",
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
                                      setConfirmState(null);
                                      setActionError(error instanceof Error ? error.message : "Unable to delete plan.");
                                    }
                                  },
                                });
                              },
                            },
                          ]}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="stack">
                        <span>{formatCurrency(plan.unitAmount, plan.currency)}</span>
                        {calculateTaxInclusiveAmount(plan.unitAmount) ? (
                          <div className="table-meta">
                            <span className="table-meta-item">
                              Incl. {invoiceSettings?.taxName || "SST"} {invoiceSettings?.taxRate}%: {formatCurrency(calculateTaxInclusiveAmount(plan.unitAmount) ?? plan.unitAmount, plan.currency)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>{plan.planCode}</td>
                    <td><span className="badge">{plan.billingType === "OneTime" ? "One-Time" : "Recurring"}</span></td>
                    <td>{plan.billingLabel}</td>
                    <td>{plan.trialDays}</td>
                    <td>{formatCurrency(plan.setupFeeAmount, plan.currency)}</td>
                    <td>{plan.isDefault ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plans.length === 0 ? (
              <div className="empty-state">
                <h3>No plans yet</h3>
                <p className="muted">Plans define how often and how much customers are charged. Start with a monthly or yearly plan.</p>
                <div className="empty-state-actions">
                  <Button type="button">Use the form to create a plan</Button>
                  <Button type="button" variant="secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</Button>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
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

        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">{form.id ? "Edit plan" : "Add plan"}</p>
              <h3 className="section-title">{form.id ? "Update billing plan" : "Create billing plan"}</h3>
              <p className="muted form-intro">Plans set the price, billing cycle, and trial for a product.</p>
            </div>
          </div>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            {billingTermsLocked ? (
              <HelperText>
                This plan already has subscribed customers. Billing terms are locked here. Duplicate the plan to create new pricing for future subscriptions.
              </HelperText>
            ) : null}
            <FormLabel htmlFor="plan-product">Product<select id="plan-product" value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></FormLabel>
            <FormLabel htmlFor="plan-name">Plan Name<TextInput id="plan-name" value={form.planName} onChange={(event) => setForm((current) => ({ ...current, planName: event.target.value }))} /></FormLabel>
            <FormLabel htmlFor="plan-code">Plan Code<TextInput id="plan-code" value={form.planCode} onChange={(event) => setForm((current) => ({ ...current, planCode: normalizePlanCode(event.target.value) }))} /></FormLabel>
            <FormLabel htmlFor="plan-billing-type">Billing Type<select id="plan-billing-type" value={form.billingType} disabled={billingTermsLocked} onChange={(event) => setForm((current) => ({ ...current, billingType: event.target.value as "OneTime" | "Recurring" }))}><option value="Recurring">Recurring</option><option value="OneTime">One-Time</option></select></FormLabel>
            {form.billingType === "Recurring" ? (
              <div className="inline-fields">
                <FormLabel htmlFor="plan-interval-unit">Interval<select id="plan-interval-unit" value={form.intervalUnit} disabled={billingTermsLocked} onChange={(event) => setForm((current) => ({ ...current, intervalUnit: event.target.value as "Month" | "Quarter" | "Year" }))}><option value="Month">Monthly</option><option value="Quarter">Quarterly</option><option value="Year">Yearly</option></select></FormLabel>
                <FormLabel htmlFor="plan-interval-count">Count<TextInput id="plan-interval-count" value={form.intervalCount} disabled={billingTermsLocked} onChange={(event) => setForm((current) => ({ ...current, intervalCount: event.target.value }))} /></FormLabel>
              </div>
            ) : null}
            <div className="inline-fields">
              <FormLabel htmlFor="plan-currency">Currency<TextInput id="plan-currency" value="MYR" readOnly /></FormLabel>
              <FormLabel htmlFor="plan-amount">Amount<TextInput id="plan-amount" value={form.unitAmount} disabled={billingTermsLocked} onChange={(event) => setForm((current) => ({ ...current, unitAmount: event.target.value }))} /></FormLabel>
            </div>
            <div className="inline-fields">
              {form.billingType === "Recurring" ? (
                <FormLabel htmlFor="plan-trial-days">Trial Days<TextInput id="plan-trial-days" value={form.trialDays} disabled={billingTermsLocked} onChange={(event) => setForm((current) => ({ ...current, trialDays: event.target.value }))} /></FormLabel>
              ) : (
                <div />
              )}
              <FormLabel htmlFor="plan-setup-fee">Setup Fee<TextInput id="plan-setup-fee" value={form.setupFeeAmount} disabled={billingTermsLocked} onChange={(event) => setForm((current) => ({ ...current, setupFeeAmount: event.target.value }))} /></FormLabel>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))} /> Default plan</label>
            <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
            {formError ? <HelperText tone="error">{formError}</HelperText> : <HelperText>{billingTermsLocked ? "Safe edits only: name, code, default flag, and active status. Duplicate the plan to change price or billing cycle." : "Use an uppercase code like STARTER-MONTHLY."}</HelperText>}
            <div className="button-stack">
              <Button type="submit" disabled={isSubmitting || !form.productId}>{isSubmitting ? "Saving..." : form.id ? "Update Plan" : "Create Plan"}</Button>
              {form.id ? <Button type="button" variant="secondary" onClick={() => { setForm((current) => ({ ...emptyForm, productId: current.productId })); setFormError(""); }}>Cancel</Button> : null}
            </div>
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
