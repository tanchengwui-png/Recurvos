import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { useClientPagination } from "../hooks/useClientPagination";
import { fetchPlansForProduct } from "../hooks/useProductPlans";
import { fetchProduct } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyInvoiceSettings, ProductDetails, ProductPlan } from "../types";

const emptyPlanForm = {
  planName: "",
  planCode: "",
  billingType: "Recurring",
  intervalUnit: "Month",
  intervalCount: "1",
  currency: "MYR",
  unitAmount: "49.00",
  trialDays: "0",
  taxBehavior: "Unspecified",
  isDefault: false,
  isActive: true,
  sortOrder: "0",
};

export function ProductDetailsPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [plans, setPlans] = useState<ProductPlan[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const pagination = useClientPagination(plans, [plans.length]);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [actionError, setActionError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    if (!id) return;
    const [productData, plansData, invoiceSettingsData] = await Promise.all([
      fetchProduct(id),
      fetchPlansForProduct(id),
      api.get<CompanyInvoiceSettings>("/settings/invoice-settings").catch(() => null),
    ]);
    setProduct(productData);
    setPlans(plansData);
    setInvoiceSettings(invoiceSettingsData);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function createPlan() {
    if (!id) return;
    setConfirmState({
      title: "Create plan",
      description: `Create ${planForm.planName || "this plan"} under ${product?.name || "this product"}?`,
      action: async () => {
        await api.post(`/products/${id}/plans`, {
          productId: id,
          planName: planForm.planName,
          planCode: planForm.planCode.toUpperCase(),
          billingType: planForm.billingType,
          intervalUnit: planForm.billingType === "OneTime" ? "None" : planForm.intervalUnit,
          intervalCount: planForm.billingType === "OneTime" ? 0 : Number(planForm.intervalCount),
          currency: "MYR",
          unitAmount: Number(planForm.unitAmount),
          trialDays: planForm.billingType === "OneTime" ? 0 : Number(planForm.trialDays),
          taxBehavior: planForm.taxBehavior,
          isDefault: planForm.isDefault,
          isActive: planForm.isActive,
          sortOrder: Number(planForm.sortOrder),
        });
        setPlanForm(emptyPlanForm);
        setConfirmState(null);
        await load();
      },
    });
  }

  function calculateTaxInclusiveAmount(amount: number) {
    if (!invoiceSettings?.isTaxEnabled || !invoiceSettings.taxRate) {
      return null;
    }

    return amount + (amount * invoiceSettings.taxRate / 100);
  }

  if (!product) {
    return <div className="page"><section className="card"><p className="muted">Loading product details...</p></section></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Product details</p>
          <h2>{product.name}</h2>
          <p className="muted">{product.description || "Manage plans, defaults, and pricing for this product."}</p>
        </div>
      </header>

      <div className="metrics-grid">
        <section className="card metric-card"><p className="muted">Total Plans</p><h3>{product.plansCount}</h3></section>
        <section className="card metric-card"><p className="muted">Active Plans</p><h3>{product.activePlansCount}</h3></section>
        <section className="card metric-card"><p className="muted">Default Plan</p><h3>{product.defaultPlan?.planName || "-"}</h3></section>
        <section className="card metric-card"><p className="muted">Starting Price</p><h3>{product.startingPrice ? formatCurrency(product.startingPrice) : "-"}</h3></section>
      </div>

      <div className="grid-two">
        <section className="card">
          <div className="row">
            <div>
              <p className="eyebrow">Plans</p>
              <h3>Product Plans</h3>
            </div>
          </div>
          {actionError ? <HelperText tone="error">{actionError}</HelperText> : null}
          {plans.length === 0 ? (
            <div className="empty-state">
              <h3>No plans added for this product yet</h3>
              <p className="muted">Add monthly, quarterly, yearly, or one-time plans to make the product billable.</p>
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Plan Name</th>
                      <th>Plan Code</th>
                      <th>Billing Type</th>
                      <th>Interval</th>
                      <th>Amount</th>
                      <th>Default</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pagedItems.map((plan) => (
                      <tr key={plan.id}>
                        <td>
                          <div className="stack">
                            <span>{plan.planName}</span>
                            <div className="table-meta">
                              <span className="table-meta-item">
                                <span className={`table-meta-dot ${plan.isActive ? "table-meta-dot-active" : "table-meta-dot-inactive"}`} aria-hidden="true" />
                                {plan.isActive ? "Active" : "Inactive"}
                              </span>
                              {plan.isDefault ? <span className="table-meta-item">Default</span> : null}
                            </div>
                          </div>
                        </td>
                        <td>{plan.planCode}</td>
                        <td><span className="badge">{plan.billingType === "OneTime" ? "One-Time" : "Recurring"}</span></td>
                        <td>{plan.billingLabel}</td>
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
                        <td>{plan.isDefault ? "Yes" : "No"}</td>
                        <td className="actions-cell">
                          {!plan.isDefault ? <button type="button" className="button button-secondary" onClick={() => {
                            setActionError("");
                            setConfirmState({
                              title: "Set default plan",
                              description: `Make ${plan.planName} the default plan for ${product.name}?`,
                              action: async () => {
                                try {
                                  await api.patch(`/product-plans/${plan.id}/default`, { isDefault: true });
                                  setConfirmState(null);
                                  await load();
                                } catch (error) {
                                  setConfirmState(null);
                                  setActionError(error instanceof Error ? error.message : "Unable to set default plan.");
                                }
                              },
                            });
                          }}>Set default</button> : null}
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={plan.isActive && plan.isDefault}
                            title={plan.isActive && plan.isDefault ? `This is the default plan for ${product.name}. Set another plan in the same product as default before deactivating it.` : undefined}
                            onClick={() => {
                              setActionError("");
                              setConfirmState({
                                title: `${plan.isActive ? "Deactivate" : "Activate"} plan`,
                                description: `${plan.planName} will ${plan.isActive ? "stop" : "start"} appearing as an active option.`,
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
                            }}
                          >
                            {plan.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button type="button" className="button button-secondary" onClick={() => {
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
                          }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
            </>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">Add plan</p>
          <div className="form-stack">
            <FormLabel htmlFor="detail-plan-name">Plan Name<TextInput id="detail-plan-name" value={planForm.planName} onChange={(event) => setPlanForm((current) => ({ ...current, planName: event.target.value }))} /></FormLabel>
            <FormLabel htmlFor="detail-plan-code">Plan Code<TextInput id="detail-plan-code" value={planForm.planCode} onChange={(event) => setPlanForm((current) => ({ ...current, planCode: event.target.value.toUpperCase() }))} /></FormLabel>
            <FormLabel htmlFor="detail-billing-type">Billing Type<select id="detail-billing-type" value={planForm.billingType} onChange={(event) => setPlanForm((current) => ({ ...current, billingType: event.target.value }))}><option value="Recurring">Recurring</option><option value="OneTime">One-Time</option></select></FormLabel>
            {planForm.billingType === "Recurring" ? (
              <div className="inline-fields">
                <FormLabel htmlFor="detail-interval-unit">Interval<select id="detail-interval-unit" value={planForm.intervalUnit} onChange={(event) => setPlanForm((current) => ({ ...current, intervalUnit: event.target.value }))}><option value="Month">Monthly</option><option value="Quarter">Quarterly</option><option value="Year">Yearly</option></select></FormLabel>
                <FormLabel htmlFor="detail-interval-count">Count<TextInput id="detail-interval-count" value={planForm.intervalCount} onChange={(event) => setPlanForm((current) => ({ ...current, intervalCount: event.target.value }))} /></FormLabel>
              </div>
            ) : null}
            <div className="inline-fields">
              <FormLabel htmlFor="detail-amount">Amount<TextInput id="detail-amount" value={planForm.unitAmount} onChange={(event) => setPlanForm((current) => ({ ...current, unitAmount: event.target.value }))} /></FormLabel>
              <FormLabel htmlFor="detail-currency">Currency<TextInput id="detail-currency" value="MYR" readOnly /></FormLabel>
            </div>
            {planForm.billingType === "Recurring" ? (
              <FormLabel htmlFor="detail-trial-days">Trial Days<TextInput id="detail-trial-days" value={planForm.trialDays} onChange={(event) => setPlanForm((current) => ({ ...current, trialDays: event.target.value }))} /></FormLabel>
            ) : null}
            <label className="checkbox-row"><input type="checkbox" checked={planForm.isDefault} onChange={(event) => setPlanForm((current) => ({ ...current, isDefault: event.target.checked }))} /> Make default plan</label>
            <Button type="button" onClick={() => void createPlan()}>Add Plan</Button>
          </div>
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
