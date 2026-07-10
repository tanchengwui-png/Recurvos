import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProductPlans } from "../hooks/useProductPlans";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import type { BillingReadiness, CompanyLookup, FeatureAccess } from "../types";

const setupSteps = [
  {
    key: "company",
    title: "Create your company",
    description: "Set up the business name and details that appear on your invoices.",
    actionLabel: "Open Companies",
    actionHref: "/companies",
  },
  {
    key: "product",
    title: "Create a product",
    description: "Add the service or item you bill customers for.",
    actionLabel: "Open Products",
    actionHref: "/products",
  },
  {
    key: "plan",
    title: "Create a plan",
    description: "Set the amount and billing frequency, such as monthly or yearly.",
    actionLabel: "Open Plans",
    actionHref: "/plans",
  },
  {
    key: "customer",
    title: "Add a contact",
    description: "Create a contact record for a customer, supplier, or employee before you use it.",
    actionLabel: "Open Contacts",
    actionHref: "/customers",
  },
  {
    key: "billing",
    title: "Send your first bill",
    description: "Create a one-off invoice or start a subscription for recurring billing.",
    actionLabel: "Open Invoices",
    actionHref: "/invoices",
  },
] as const;

const optionalLater = [
  {
    title: "Upload your logo",
    description: "Brand invoices and receipts after your core billing flow is ready.",
    actionLabel: "Manage Company",
    actionHref: "/companies",
  },
  {
    title: "Create subscriptions",
    description: "Use this when you want automatic recurring invoices.",
    actionLabel: "Open Subscriptions",
    actionHref: "/subscriptions",
  },
  {
    title: "Record payments",
    description: "Track bank transfer, cash, or other manual payments.",
    actionLabel: "Open Payments",
    actionHref: "/payments",
  },
];

const reminders = [
  "You only need the 5 steps above to start billing.",
  "Logo, payment reminders, and advanced settings can be done later.",
  "If you bill monthly, create the plan first before creating subscriptions.",
];

type SprintMilestone = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  href: string;
  actionLabel: string;
};

export function QuickStartPage() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [setupCounts, setSetupCounts] = useState({
    products: 0,
    plans: 0,
    customers: 0,
    subscriptions: 0,
    invoices: 0,
    payments: 0,
  });

  useEffect(() => {
    void (async () => {
      const companyList = await api.get<CompanyLookup[]>("/companies");
      const access = await api.get<FeatureAccess>("/settings/feature-access");
      const [products, plans, customers, subscriptions, invoices, payments, readiness] = await Promise.all([
        fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 1 }),
        fetchProductPlans({ billingType: "all", isActive: "all", page: 1, pageSize: 1 }),
        access.featureKeys.includes("customer_management") ? api.get<unknown[]>("/customers") : Promise.resolve([]),
        access.featureKeys.includes("recurring_invoices") ? api.get<unknown[]>("/subscriptions") : Promise.resolve([]),
        access.featureKeys.includes("manual_invoices") || access.featureKeys.includes("recurring_invoices") ? api.get<unknown[]>("/invoices") : Promise.resolve([]),
        access.featureKeys.includes("payment_tracking") ? api.get<unknown[]>("/payments") : Promise.resolve([]),
        companyList[0]?.id ? api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${companyList[0].id}`) : Promise.resolve(null),
      ]);

      setCompanies(companyList);
      setFeatureAccess(access);
      setBillingReadiness(readiness);
      setSetupCounts({
        products: products.totalCount,
        plans: plans.totalCount,
        customers: customers.length,
        subscriptions: subscriptions.length,
        invoices: invoices.length,
        payments: payments.length,
      });
      setLoading(false);
    })();
  }, []);

  const stepsWithState = useMemo(() => {
    return setupSteps
      .map((step) => {
        const done = step.key === "company"
          ? companies.length > 0
          : step.key === "product"
            ? setupCounts.products > 0
            : step.key === "plan"
              ? setupCounts.plans > 0
              : step.key === "customer"
                ? setupCounts.customers > 0
                : setupCounts.invoices > 0 || setupCounts.subscriptions > 0;

        const enabled = step.key === "customer"
          ? featureAccess?.featureKeys.includes("customer_management") ?? false
          : step.key === "billing"
            ? (featureAccess?.featureKeys.includes("manual_invoices") ?? false) || (featureAccess?.featureKeys.includes("recurring_invoices") ?? false)
            : true;

        return { ...step, done, enabled };
      })
      .filter((step) => step.enabled);
  }, [companies.length, featureAccess, setupCounts]);

  const nextStepIndex = stepsWithState.findIndex((step) => !step.done);
  const currentStep = stepsWithState[Math.max(nextStepIndex, 0)] ?? setupSteps[0];
  const completedSteps = stepsWithState.filter((step) => step.done).length;
  const remainingSteps = stepsWithState.filter((step) => !step.done);
  const allDone = stepsWithState.length > 0 && completedSteps === stepsWithState.length;
  const heroActionHref = allDone ? "/" : currentStep.actionHref;
  const heroActionLabel = allDone ? "Open dashboard" : currentStep.actionLabel;
  const launchBlockers = useMemo(() => {
    const blockers = (billingReadiness?.items ?? [])
      .filter((item) => item.required && !item.done)
      .map((item) => ({
        key: item.key,
        title: item.title,
        description: item.description,
        href: item.actionPath,
        actionLabel: "Fix now",
      }));

    if (!(featureAccess?.featureKeys.includes("customer_management") ?? false)) {
      blockers.push({
        key: "feature-customer-management",
        title: "Customer records are locked on your current package",
        description: "Add the package that includes customer management before you start your billing workflow.",
        href: "/package-billing",
        actionLabel: "Review package",
      });
    }

    if (!((featureAccess?.featureKeys.includes("manual_invoices") ?? false) || (featureAccess?.featureKeys.includes("recurring_invoices") ?? false))) {
      blockers.push({
        key: "feature-billing",
        title: "Billing actions are locked on your current package",
        description: "You need invoice or recurring billing access before you can charge customers.",
        href: "/package-billing",
        actionLabel: "Review package",
      });
    }

    return blockers;
  }, [billingReadiness?.items, featureAccess?.featureKeys]);
  const sprintMilestones = useMemo<SprintMilestone[]>(() => {
    const readinessItems = billingReadiness?.items ?? [];
    const requiredReady = readinessItems.filter((item) => item.required).every((item) => item.done);
    const paymentCollectionReady = (featureAccess?.featureKeys.includes("payment_tracking") ?? false)
      || (featureAccess?.featureKeys.includes("payment_link_generation") ?? false)
      || setupCounts.payments > 0;

    return [
      {
        key: "issuer-ready",
        title: "Issuer profile ready",
        detail: requiredReady ? "Your company profile can legally issue invoices." : "Complete company identity, address, and numbering before sending invoices.",
        done: requiredReady,
        href: "/settings",
        actionLabel: requiredReady ? "Review settings" : "Finish billing setup",
      },
      {
        key: "catalog-ready",
        title: "What you sell is defined",
        detail: setupCounts.products > 0 && setupCounts.plans > 0
          ? "You already have products and plans ready to bill."
          : "Create at least one product and one plan so you can quote a real amount fast.",
        done: setupCounts.products > 0 && setupCounts.plans > 0,
        href: setupCounts.products > 0 ? "/plans" : "/products",
        actionLabel: setupCounts.products > 0 ? "Create a plan" : "Create a product",
      },
      {
        key: "customer-ready",
        title: "A contact exists",
        detail: setupCounts.customers > 0
          ? "You have at least one contact ready to use."
          : "Add the first contact you want to manage so you can move straight into billing or record-keeping.",
        done: setupCounts.customers > 0,
        href: "/customers",
        actionLabel: setupCounts.customers > 0 ? "Review contacts" : "Add first contact",
      },
      {
        key: "collect-first-payment",
        title: "Collect the first payment",
        detail: setupCounts.invoices > 0 || setupCounts.subscriptions > 0
          ? paymentCollectionReady
            ? "Your first billing flow is live. Send the invoice, payment link, or track the incoming payment."
            : "Your first invoice exists. Next, enable payment collection or record the payment when it arrives."
          : "Create your first invoice or subscription so your customer has something to pay.",
        done: setupCounts.invoices > 0 || setupCounts.subscriptions > 0,
        href: setupCounts.invoices > 0 || setupCounts.subscriptions > 0
          ? (paymentCollectionReady ? "/payments" : "/settings")
          : "/invoices",
        actionLabel: setupCounts.invoices > 0 || setupCounts.subscriptions > 0
          ? (paymentCollectionReady ? "Open payments" : "Set payment method")
          : "Create first invoice",
      },
    ];
  }, [billingReadiness?.items, featureAccess?.featureKeys, setupCounts.customers, setupCounts.invoices, setupCounts.payments, setupCounts.plans, setupCounts.products, setupCounts.subscriptions]);
  const sprintCompleted = sprintMilestones.filter((item) => item.done).length;
  const nextMilestone = sprintMilestones.find((item) => !item.done) ?? sprintMilestones[sprintMilestones.length - 1];
  const featuredTitle = loading
    ? "Checking your setup..."
    : allDone
      ? "Your core setup is ready"
      : nextMilestone.title;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Quick Start</h2>
        </div>
      </header>

      <div className="catalog-toolbar card subtle-card quickstart-toolbar">
        <div className="section-header-cluster quickstart-toolbar-main">
          <p className="muted quickstart-toolbar-title">First Payment Sprint</p>
          <div className="page-meta-row page-meta-row-inline page-meta-row-spaced" aria-label="Quick start summary">
            <div className="page-meta-chips">
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Sprint</span>
                <strong className="page-meta-chip-value">{loading ? "-" : `${sprintCompleted}/${sprintMilestones.length}`}</strong>
              </span>
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Blockers</span>
                <strong className="page-meta-chip-value">{loading ? "-" : launchBlockers.length}</strong>
              </span>
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Focus</span>
                <strong className="page-meta-chip-value">{loading ? "Checking..." : allDone ? "Ready" : nextMilestone.title}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="quickstart-actions">
          <Link to="/" className="button button-secondary">Back to dashboard</Link>
          <Link to={nextMilestone.href} className="button button-primary">{loading ? "Loading..." : nextMilestone.actionLabel}</Link>
        </div>
      </div>

      <section className="quickstart-grid">
        <div className="card quickstart-progress-card">
          <div className="quickstart-progress-header">
            <div>
              <h3 className="section-title">First payment milestones</h3>
            </div>
            <span className="badge">{loading ? "Checking..." : `${sprintCompleted} of ${sprintMilestones.length} complete`}</span>
          </div>
          <div className="quickstart-progress-bar" aria-hidden="true">
            <span style={{ width: `${(sprintCompleted / sprintMilestones.length) * 100}%` }} />
          </div>
          <div className="quickstart-sprint-grid">
            {sprintMilestones.map((milestone) => (
              <div key={milestone.key} className={`quickstart-sprint-card ${milestone.done ? "is-done" : ""}`}>
                <span className="status-pill status-pill-compact">{milestone.done ? "Ready" : "Pending"}</span>
                <strong>{milestone.title}</strong>
                <Link to={milestone.href} className="inline-link">{milestone.actionLabel}</Link>
              </div>
            ))}
          </div>
        </div>

        <div className="card quickstart-blockers-card">
          <div className="card-section-header">
            <div>
              <h3 className="section-title">Current blockers</h3>
            </div>
          </div>
          {loading ? <p className="muted">Checking your billing launch blockers.</p> : launchBlockers.length > 0 ? (
            <div className="quickstart-list">
              {launchBlockers.slice(0, 4).map((blocker) => (
                <div key={blocker.key} className="quickstart-tip quickstart-tip-alert">
                  <span className="badge">Action</span>
                  <strong>{blocker.title}</strong>
                  <p>{blocker.description}</p>
                  <Link to={blocker.href} className="inline-link">{blocker.actionLabel}</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="quickstart-tip quickstart-tip-success">
              <span className="badge">Clear</span>
              <p>You have no required blockers. The fastest next move is to invoice a real customer and collect the payment.</p>
            </div>
          )}
        </div>
      </section>

      <section className="card quickstart-progress-card">
        <div className="quickstart-progress-header">
          <div>
            <h3 className="section-title">{allDone ? "Core setup completed" : "Next step"}</h3>
          </div>
          <span className="badge">{loading ? "Checking..." : allDone ? `${completedSteps} of ${stepsWithState.length} done` : `Step ${Math.max(nextStepIndex + 1, 1)} of ${stepsWithState.length}`}</span>
        </div>
        <div className="quickstart-progress-bar" aria-hidden="true">
          <span style={{ width: `${stepsWithState.length > 0 ? (completedSteps / stepsWithState.length) * 100 : 0}%` }} />
        </div>
          <div className="quickstart-featured-step">
            <div>
              <strong>{featuredTitle}</strong>
            </div>
            <Link to={allDone ? heroActionHref : nextMilestone.href} className="button button-primary">{allDone ? heroActionLabel : nextMilestone.actionLabel}</Link>
          </div>
        {!loading && !allDone && remainingSteps.length > 1 ? (
          <div className="quickstart-next-list">
            {remainingSteps.slice(1, 3).map((step) => (
              <div key={step.key} className="quickstart-next-item">
                <span>{step.title}</span>
                <Link to={step.actionHref} className="inline-link">{step.actionLabel}</Link>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-section-header">
          <div>
            <h3 className="section-title">Complete these first</h3>
          </div>
        </div>
        <div className="quickstart-step-list">
          {stepsWithState.map((step, index) => (
            <div key={step.title} className={`quickstart-step-row ${step.done ? "is-done" : ""}`}>
              <div className="quickstart-step-number">{step.done ? "OK" : index + 1}</div>
              <div className="quickstart-step-copy">
                <strong>{step.title}</strong>
              </div>
              <Link to={step.actionHref} className="button button-secondary">{step.actionLabel}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="quickstart-grid">
        <div className="card">
          <div className="card-section-header">
            <div>
              <h3 className="section-title">Do this after setup</h3>
            </div>
          </div>
          <div className="quickstart-list">
            {optionalLater.map((item) => (
              <div key={item.title} className="quickstart-item">
                <div>
                  <h3>{item.title}</h3>
                </div>
                <Link to={item.actionHref} className="button button-secondary">{item.actionLabel}</Link>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-section-header">
            <div>
              <h3 className="section-title">Practical reminders</h3>
            </div>
          </div>
          <div className="quickstart-list">
            {reminders.map((tip) => (
              <div key={tip} className="quickstart-tip">
                <span className="badge">Note</span>
                <p>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
