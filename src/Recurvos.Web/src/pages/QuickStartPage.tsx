import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProductPlans } from "../hooks/useProductPlans";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import type { CompanyLookup, FeatureAccess } from "../types";

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
    title: "Add a customer",
    description: "Create the customer record before you bill them.",
    actionLabel: "Open Customers",
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

export function QuickStartPage() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [setupCounts, setSetupCounts] = useState({
    products: 0,
    plans: 0,
    customers: 0,
    subscriptions: 0,
    invoices: 0,
  });

  useEffect(() => {
    void (async () => {
      const companyList = await api.get<CompanyLookup[]>("/companies");
      const access = await api.get<FeatureAccess>("/settings/feature-access");
      const [products, plans, customers, subscriptions, invoices] = await Promise.all([
        fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 1 }),
        fetchProductPlans({ billingType: "all", isActive: "all", page: 1, pageSize: 1 }),
        access.featureKeys.includes("customer_management") ? api.get<unknown[]>("/customers") : Promise.resolve([]),
        access.featureKeys.includes("recurring_invoices") ? api.get<unknown[]>("/subscriptions") : Promise.resolve([]),
        access.featureKeys.includes("manual_invoices") || access.featureKeys.includes("recurring_invoices") ? api.get<unknown[]>("/invoices") : Promise.resolve([]),
      ]);

      setCompanies(companyList);
      setFeatureAccess(access);
      setSetupCounts({
        products: products.totalCount,
        plans: plans.totalCount,
        customers: customers.length,
        subscriptions: subscriptions.length,
        invoices: invoices.length,
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
  const allDone = stepsWithState.length > 0 && completedSteps === stepsWithState.length;
  const heroActionHref = allDone ? "/" : currentStep.actionHref;
  const heroActionLabel = allDone ? "Open dashboard" : currentStep.actionLabel;
  const featuredTitle = loading
    ? "Checking your setup..."
    : allDone
      ? "Your core setup is ready"
      : currentStep.title;
  const featuredDescription = loading
    ? "Loading your current progress."
    : allDone
      ? "Your company, products, plans, customers, and first billing flow are already in place. You can now improve branding, reminders, and payment tracking."
      : currentStep.description;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Help</p>
          <h2>Quick Start</h2>
          <p className="muted">Follow the recommended order and get your first billing flow running.</p>
        </div>
      </header>

      <section className="card quickstart-hero">
        <div>
          <p className="eyebrow">Recommended Order</p>
          <h3>Set up billing in 5 steps</h3>
          <p className="muted">Focus on the essentials first. Everything else can wait until after your first invoice or subscription is ready.</p>
        </div>
        <div className="quickstart-actions">
          <Link to="/" className="button button-secondary">Back to dashboard</Link>
          <Link to={heroActionHref} className="button button-primary">{heroActionLabel}</Link>
        </div>
      </section>

      <section className="card quickstart-progress-card">
        <div className="quickstart-progress-header">
          <div>
            <p className="eyebrow">{allDone ? "Complete" : "Start here"}</p>
            <h3 className="section-title">{allDone ? "Core setup completed" : "Next step"}</h3>
          </div>
          <span className="badge">{loading ? "Checking..." : allDone ? `${completedSteps} of ${stepsWithState.length} done` : `Step ${Math.max(nextStepIndex + 1, 1)} of ${stepsWithState.length}`}</span>
        </div>
        <div className="quickstart-featured-step">
          <div>
            <strong>{featuredTitle}</strong>
            <p className="muted">{featuredDescription}</p>
          </div>
          <Link to={heroActionHref} className="button button-primary">{heroActionLabel}</Link>
        </div>
      </section>

      <section className="card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">Main flow</p>
            <h3 className="section-title">Complete these first</h3>
          </div>
        </div>
        <div className="quickstart-step-list">
          {stepsWithState.map((step, index) => (
            <div key={step.title} className={`quickstart-step-row ${step.done ? "is-done" : ""}`}>
              <div className="quickstart-step-number">{step.done ? "OK" : index + 1}</div>
              <div className="quickstart-step-copy">
                <strong>{step.title}</strong>
                <p className="muted">{step.description}</p>
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
              <p className="eyebrow">Optional later</p>
              <h3 className="section-title">Do this after setup</h3>
            </div>
          </div>
          <div className="quickstart-list">
            {optionalLater.map((item) => (
              <div key={item.title} className="quickstart-item">
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.description}</p>
                </div>
                <Link to={item.actionHref} className="button button-secondary">{item.actionLabel}</Link>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Keep in mind</p>
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
