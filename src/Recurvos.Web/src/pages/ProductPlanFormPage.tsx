import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { FormActionSection } from "../components/ui/FormActionSection";
import { FormPageBody } from "../components/ui/FormPageBody";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { fetchProductPlans } from "../hooks/useProductPlans";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { normalizeProductCode } from "../utils/products";
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
  unitAmount: "0.00",
  taxBehavior: "Unspecified",
  isDefault: false,
  isActive: true,
  sortOrder: "0",
};

function normalizePlanCode(value: string) {
  return normalizeProductCode(value);
}

export function ProductPlanFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<CompanyInvoiceSettings | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [editingPlan, setEditingPlan] = useState<ProductPlan | null>(null);
  const billingTermsLocked = editingPlan?.isInUse ?? false;

  useEffect(() => {
    async function load() {
      const [productsResult, editingPlanResult, invoiceSettingsResult] = await Promise.all([
        fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 100 }),
        id ? api.get<ProductPlan>(`/product-plans/${id}`) : Promise.resolve(null),
        api.get<CompanyInvoiceSettings>("/settings/invoice-settings").catch(() => null),
      ]);

      setProducts(productsResult.items);
      setInvoiceSettings(invoiceSettingsResult);

      const duplicatePlanId = location.state && typeof location.state === "object" && "duplicatePlanId" in location.state
        ? location.state.duplicatePlanId
        : null;

      if (!id && typeof duplicatePlanId === "string") {
        const duplicatePlansResult = await fetchProductPlans({ productId: undefined, billingType: "all", isActive: "all", page: 1, pageSize: 200 });
        const duplicatePlan = duplicatePlansResult.items.find((item) => item.id === duplicatePlanId) ?? null;
        if (duplicatePlan) {
          setForm({
            id: undefined,
            productId: duplicatePlan.productId,
            planName: `${duplicatePlan.planName} Copy`,
            planCode: normalizePlanCode(`${duplicatePlan.planCode}-COPY`),
            billingType: duplicatePlan.billingType,
            intervalUnit: duplicatePlan.intervalUnit,
            intervalCount: String(duplicatePlan.intervalCount),
            currency: duplicatePlan.currency,
            unitAmount: String(duplicatePlan.unitAmount),
            taxBehavior: duplicatePlan.taxBehavior,
            isDefault: false,
            isActive: true,
            sortOrder: String(duplicatePlan.sortOrder),
          });
          return;
        }
      }

      if (!id) {
        setForm((current) => ({ ...current, productId: current.productId || productsResult.items[0]?.id || "" }));
        return;
      }

      const plan = editingPlanResult;
      if (!plan) {
        setFormError("Plan not found.");
        return;
      }

      setEditingPlan(plan);
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
        taxBehavior: plan.taxBehavior,
        isDefault: plan.isDefault,
        isActive: plan.isActive,
        sortOrder: String(plan.sortOrder),
      });
    }

    void load();
  }, [id, location.state]);

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

          navigate("/plans", {
            replace: true,
            state: { flashMessage: form.id ? `Plan updated: ${payload.planName || "Plan"}.` : `Plan created: ${payload.planName || "Plan"}.` },
          });
        } catch (error) {
          const nextError = error instanceof Error ? error.message : "Unable to save plan.";
          setFormError(nextError);
          throw new Error(nextError);
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  return (
    <div className="page form-page">
      <FormPageHeader backLabel="Back to Plans" backHref="/plans" breadcrumbs={<><span>Plans</span><span>/</span><span>{form.id ? "Edit Plan" : "New Plan"}</span></>} />
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <FormPageBody>
          <div className="form-page-content">
          <section className="form-section-card">
            <div className="form-section-card-header"><span className="form-section-card-number">01</span><div><h3>Plan details</h3><p>Product, billing cycle and pricing settings.</p></div></div>
            <div className="form-section-card-body form-page-field-grid">
          {billingTermsLocked ? (
            <HelperText>This plan already has subscribed customers. Billing terms are locked here. Duplicate the plan to create new pricing for future subscriptions.</HelperText>
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
          {calculateTaxInclusiveAmount(Number(form.unitAmount)) ? (
            <HelperText>{`Incl. ${invoiceSettings?.taxName || "SST"} ${invoiceSettings?.taxRate}%: ${formatCurrency(calculateTaxInclusiveAmount(Number(form.unitAmount)) ?? Number(form.unitAmount), "MYR")}`}</HelperText>
          ) : null}
          <label className="checkbox-row"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))} /> Default plan</label>
          <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
            </div>
          </section>
          {formError ? <HelperText tone="error">{formError}</HelperText> : <HelperText>{billingTermsLocked ? "Safe edits only: name, code, default flag, and active status. Duplicate the plan to change price or billing cycle." : "Use an uppercase code like STARTER-MONTHLY."}</HelperText>}
          </div>
          <FormActionSection>
            <p>{billingTermsLocked ? "Only safe plan details can be changed while subscriptions exist." : form.id ? "Review your changes before updating." : "Complete the required fields before creating this record."}</p>
            <div>
            <Button type="button" variant="secondary" onClick={() => navigate("/plans")}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !form.productId}>{isSubmitting ? "Saving..." : form.id ? "Update plan" : "Create plan"}</Button>
            </div>
          </FormActionSection>
          </FormPageBody>
        </form>
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
