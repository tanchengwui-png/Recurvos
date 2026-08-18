import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { FormActionSection } from "../components/ui/FormActionSection";
import { FormPageBody } from "../components/ui/FormPageBody";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { api } from "../lib/api";
import { resolveActiveCompanyId } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import type { BillingReadiness, CompanyLookup, Customer, ProductPlan, Subscription } from "../types";

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getEarliestSubscriptionStartDate() {
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - 3);
  return toDateInputValue(earliest);
}

export function NewSubscriptionPage() {
  const earliestSubscriptionStartDate = getEarliestSubscriptionStartDate();
  const navigate = useNavigate();
  const loadRequestIdRef = useRef(0);
  const companySyncRequestIdRef = useRef(0);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<ProductPlan[]>([]);
  const [items, setItems] = useState<Subscription[]>([]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [form, setForm] = useState({
    companyId: "",
    customerId: "",
    productPlanId: "",
    trialDays: "0",
    quantity: "1",
    items: [] as { productPlanId: string; quantity: number }[],
    startDateUtc: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const selectedPlan = plans.find((plan) => plan.id === form.productPlanId);
  const trialDays = Number(form.trialDays || "0");
  const trialPreviewEnd = trialDays > 0
    ? new Date(new Date(form.startDateUtc).getTime() + trialDays * 24 * 60 * 60 * 1000)
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
    const requestId = ++loadRequestIdRef.current;
    const [subscriptions, customerList, companyList] = await Promise.all([
      api.get<Subscription[]>("/subscriptions"),
      api.get<Customer[]>("/customers"),
      api.get<CompanyLookup[]>("/companies"),
    ]);

    if (requestId !== loadRequestIdRef.current) {
      return;
    }

    setItems(subscriptions);
    setCustomers(customerList);
    setCompanies(companyList);

    const activeCompanyId = form.companyId || resolveActiveCompanyId(companyList);
    if (!activeCompanyId) {
      setPlans([]);
      return;
    }

    const companyPlans = await api.get<ProductPlan[]>(`/companies/${activeCompanyId}/product-plans`);
    const readiness = await api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${activeCompanyId}`);
    if (requestId !== loadRequestIdRef.current) {
      return;
    }

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

      const requestId = ++companySyncRequestIdRef.current;
      const companyPlans = await api.get<ProductPlan[]>(`/companies/${form.companyId}/product-plans`);
      const readiness = await api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${form.companyId}`);
      if (requestId !== companySyncRequestIdRef.current) {
        return;
      }

      setPlans(companyPlans);
      setBillingReadiness(readiness);
      setForm((current) => ({
        ...current,
        customerId: customers.some((customer) => customer.id === current.customerId && customer.companyId === current.companyId) ? current.customerId : customers.find((customer) => customer.companyId === current.companyId)?.id ?? "",
        productPlanId: companyPlans.some((plan) => plan.id === current.productPlanId) ? current.productPlanId : companyPlans[0]?.id ?? "",
      }));
    }

    void syncSelectedCompany();
  }, [form.companyId, customers]);

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

  const companyCustomers = customers.filter((customer) => customer.companyId === form.companyId);

  function removeDraftItem(productPlanId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.productPlanId !== productPlanId),
    }));
  }

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
            trialDays,
            notes: form.notes,
            items: form.items,
          });

          navigate("/subscriptions", {
            replace: true,
            state: { flashMessage: `Subscription created for ${selectedCustomer?.name || "the selected customer"}.` },
          });
        } catch (submitError) {
          const nextError = submitError instanceof Error ? submitError.message : "Unable to create subscription.";
          setError(nextError);
          throw new Error(nextError);
        }
      },
    });
  }

  return (
    <div className="page">
      <FormPageHeader backLabel="Back to Subscriptions" backHref="/subscriptions" breadcrumbs={<><span>Subscriptions</span><span>/</span><span>New Subscription</span></>} />
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Complete the company billing profile before starting subscriptions: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}
      <TransactionFormCard title="Subscription details" description="Customer, plans, billing schedule and subscription items.">
      <section className="card subscription-create-page-card">
        <form id="subscription-create-form" className="form-stack" onSubmit={createSubscription}>
          <FormPageBody>
          <div className="form-page-content">
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
              {companyCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          {hasDuplicateSubscriptionWarning ? <HelperText tone="error">{duplicateSubscriptionMessage}</HelperText> : null}
          <label className="form-label">
            Plan
            <select value={form.productPlanId} onChange={(event) => setForm((current) => ({ ...current, productPlanId: event.target.value }))}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.planName} - {formatCurrency(plan.unitAmount, plan.currency)}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Trial days
            <input className="text-input" value={form.trialDays} onChange={(event) => setForm((current) => ({ ...current, trialDays: event.target.value }))} />
          </label>
          {trialDays > 0 ? (
            <HelperText>{`${trialDays}-day trial${trialPreviewEnd ? ` | First invoice date ${trialPreviewEnd.toISOString().slice(0, 10)}` : ""}`}</HelperText>
          ) : (
            <HelperText>No trial on this subscription</HelperText>
          )}
          {selectedPlan ? (
            <HelperText>{`Price: ${formatCurrency(selectedPlan.unitAmount, selectedPlan.currency)} | Billing: ${selectedPlan.billingLabel} | Auto Renew: ${selectedPlan.billingType === "Recurring" ? "Yes" : "No"} | Trial applies to all items in this subscription`}</HelperText>
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
          </div>
          <FormActionSection className="subscription-create-actions">
            <p>Complete the required fields before creating this record.</p>
            <div><button type="button" className="button button-secondary" onClick={() => navigate("/subscriptions")}>Cancel</button><button type="submit" className="button button-primary" disabled={form.items.length === 0 || billingReadiness === null}>Create subscription</button></div>
          </FormActionSection>
          </FormPageBody>
        </form>
      </section>
      </TransactionFormCard>
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
