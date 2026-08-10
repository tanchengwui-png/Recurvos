import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DashboardChartCard } from "../components/dashboard/DashboardChartCard";
import { DashboardTableCard } from "../components/dashboard/DashboardTableCard";
import { KpiCard } from "../components/dashboard/KpiCard";
import { StatusSummaryCard } from "../components/dashboard/StatusSummaryCard";
import { HelperText } from "../components/ui/HelperText";
import { useDashboard } from "../hooks/useDashboard";
import { fetchProductPlans } from "../hooks/useProductPlans";
import { fetchProducts } from "../hooks/useProducts";
import { getAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { hasAnyFeature, hasFeature } from "../lib/features";
import type { BillingReadiness, CompanyLookup, FeatureAccess } from "../types";

type QuickRange = "thisMonth" | "last30" | "today" | "next7" | "custom";

function formatTooltipCurrency(value: unknown) {
  return formatCurrency(typeof value === "number" ? value : Number(value ?? 0), "MYR");
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveQuickRange(range: QuickRange) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (range) {
    case "custom":
      return { startDateUtc: toDateInput(today), endDateUtc: toDateInput(new Date(today.getTime() + 24 * 60 * 60 * 1000)) };
    case "today":
      return { startDateUtc: toDateInput(today), endDateUtc: toDateInput(new Date(today.getTime() + 24 * 60 * 60 * 1000)) };
    case "last30":
      return { startDateUtc: toDateInput(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)), endDateUtc: toDateInput(new Date(today.getTime() + 24 * 60 * 60 * 1000)) };
    case "next7":
      return { startDateUtc: toDateInput(today), endDateUtc: toDateInput(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) };
    case "thisMonth":
    default: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { startDateUtc: toDateInput(start), endDateUtc: toDateInput(end) };
    }
  }
}

const EMPTY_FEATURE_ACCESS: FeatureAccess = {
  packageCode: "",
  packageStatus: "",
  featureKeys: [],
  featureRequirements: [],
};

function createEmptyChartRect() {
  return { width: 0, height: 0 };
}

function SafeResponsiveChart({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState(createEmptyChartRect);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      setRect({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {rect.width > 0 && rect.height > 0 ? children : null}
    </div>
  );
}

async function loadOptional<T>(request: Promise<T>, fallback: T): Promise<T> {
  try {
    return await request;
  } catch {
    return fallback;
  }
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [setupStats, setSetupStats] = useState({
    products: 0,
    plans: 0,
    customers: 0,
    subscriptions: 0,
    invoices: 0,
    payments: 0,
  });
  const [setupDismissed, setSetupDismissed] = useState(() => localStorage.getItem("recurvos.setup.dismissed") === "true");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [billingReadiness, setBillingReadiness] = useState<BillingReadiness | null>(null);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [quickRange, setQuickRange] = useState<QuickRange>("thisMonth");
  const [startDateUtc, setStartDateUtc] = useState(resolveQuickRange("thisMonth").startDateUtc);
  const [endDateUtc, setEndDateUtc] = useState(resolveQuickRange("thisMonth").endDateUtc);
  const filters = useMemo(() => ({
    companyId: selectedCompanyId || undefined,
    startDateUtc: startDateUtc ? new Date(startDateUtc).toISOString() : undefined,
    endDateUtc: endDateUtc ? new Date(endDateUtc).toISOString() : undefined,
  }), [selectedCompanyId, startDateUtc, endDateUtc]);
  const { loading, error, summary, upcomingRenewals, overdueInvoices, recentPayments, scheduledCancellations, trialEnding, revenueTrend, subscriptionGrowth, revenueByCompany, statusSummary } = useDashboard(filters);

  useEffect(() => {
    void (async () => {
      const auth = getAuth();
      const companyList = await loadOptional(api.get<CompanyLookup[]>("/companies"), []);
      const access = await loadOptional(api.get<FeatureAccess>("/settings/feature-access"), EMPTY_FEATURE_ACCESS);
      const initialCompanyId = companyList.some((company) => company.id === auth?.companyId)
        ? auth?.companyId ?? ""
        : companyList[0]?.id ?? "";

      setCompanies(companyList);
      setFeatureAccess(access);
      if (initialCompanyId) {
        setSelectedCompanyId(initialCompanyId);
      }

      const [products, plans, customers, subscriptions, invoices, payments, readiness] = await Promise.all([
        fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 1 }),
        fetchProductPlans({ billingType: "all", isActive: "all", page: 1, pageSize: 1 }),
        hasFeature(access, "customer_management") ? loadOptional(api.get<unknown[]>("/customers"), []) : Promise.resolve([]),
        hasFeature(access, "recurring_invoices") ? loadOptional(api.get<unknown[]>("/subscriptions"), []) : Promise.resolve([]),
        hasAnyFeature(access, ["manual_invoices", "recurring_invoices"])
          ? loadOptional(api.get<unknown[]>("/invoices"), [])
          : Promise.resolve([]),
        hasFeature(access, "payment_tracking") ? loadOptional(api.get<unknown[]>("/payments"), []) : Promise.resolve([]),
        initialCompanyId
          ? loadOptional(api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${initialCompanyId}`), null)
          : Promise.resolve(null),
      ]);

      setSetupStats({
        products: products.totalCount,
        plans: plans.totalCount,
        customers: customers.length,
        subscriptions: subscriptions.length,
        invoices: invoices.length,
        payments: payments.length,
      });
      setBillingReadiness(readiness);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      return;
    }

    void api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${selectedCompanyId}`)
      .then(setBillingReadiness)
      .catch(() => setBillingReadiness(null));
  }, [selectedCompanyId]);

  const setupSteps = [
    { key: "companies", title: "Create company", description: "Add your billing entity and contact details.", done: companies.length > 0, href: "/companies", action: "Open Companies" },
    { key: "logo", title: "Upload logo", description: "Brand invoices with your company logo.", done: companies.some((company) => company.hasLogo), href: "/companies", action: "Manage Logo" },
    { key: "products", title: "Create product", description: "Define what your customer is buying.", done: setupStats.products > 0, href: "/products", action: "Open Products" },
    { key: "plans", title: "Create plan", description: "Set how much and how often customers are charged.", done: setupStats.plans > 0, href: "/plans", action: "Open Plans" },
    { key: "customers", title: "Add contact", description: "Create the customers, suppliers, and employees you manage.", done: setupStats.customers > 0, href: "/customers", action: "Open Contacts", enabled: hasFeature(featureAccess, "customer_management") },
    { key: "subscriptions", title: "Create subscription", description: "Link a customer to a recurring plan.", done: setupStats.subscriptions > 0, href: "/subscriptions", action: "Open Subscriptions", enabled: hasFeature(featureAccess, "recurring_invoices") },
    { key: "invoices", title: "Review invoice", description: "Create a manual invoice or wait for a renewal invoice.", done: setupStats.invoices > 0, href: "/invoices", action: "Open Invoices", enabled: hasAnyFeature(featureAccess, ["manual_invoices", "recurring_invoices"]) },
    { key: "payments", title: "Collect payment", description: "Record payment or generate a payment link.", done: setupStats.payments > 0, href: "/payments", action: "Open Payments", enabled: hasFeature(featureAccess, "payment_tracking") },
  ] as const;
  const readinessSteps = (billingReadiness?.items ?? []).map((item) => ({
    key: `billing-${item.key}`,
    title: item.title,
    description: item.description,
    done: item.done,
    href: item.actionPath,
    action: item.required ? "Complete step" : "Optional",
  }));
  const enabledSetupSteps = setupSteps.filter((step) => ("enabled" in step ? step.enabled : true));
  const checklistSteps = [...readinessSteps, ...enabledSetupSteps.filter((step) => !["companies", "logo"].includes(step.key))];
  const completedSetupSteps = enabledSetupSteps.filter((step) => step.done).length;
  const completedChecklistSteps = checklistSteps.filter((step) => step.done);
  const dashboardSetupMove = useMemo(() => {
    if ((billingReadiness?.items ?? []).some((item) => item.required && !item.done)) {
      const blocker = billingReadiness!.items.find((item) => item.required && !item.done)!;
      return {
        key: blocker.key,
        title: blocker.title,
        description: blocker.description,
        href: blocker.actionPath,
        action: "Fix now",
      };
    }

    if (!hasFeature(featureAccess, "customer_management")) {
      return {
        key: "feature-customer-management",
        title: "Unlock customer records",
        description: "Your package needs customer management before you can start billing real customers.",
        href: "/package-billing",
        action: "Review package",
      };
    }

    if (!hasAnyFeature(featureAccess, ["manual_invoices", "recurring_invoices"])) {
      return {
        key: "feature-billing",
        title: "Unlock billing actions",
        description: "Upgrade to a package that includes invoice creation or recurring billing.",
        href: "/package-billing",
        action: "Review package",
      };
    }

    if (setupStats.products === 0) {
      return {
        key: "create-product",
        title: "Create the first product",
        description: "Start with the thing you already sell today.",
        href: "/products",
        action: "Open products",
      };
    }

    if (setupStats.plans === 0) {
      return {
        key: "create-plan",
        title: "Price it with one clear plan",
        description: "Monthly or yearly is enough to start.",
        href: "/plans",
        action: "Open plans",
      };
    }

    if (setupStats.customers === 0) {
      return {
        key: "create-customer",
        title: "Add the first contact",
        description: "Use a real contact record so you can go live quickly.",
        href: "/customers",
        action: "Open contacts",
      };
    }

    if (setupStats.invoices === 0 && setupStats.subscriptions === 0) {
      return {
        key: "create-invoice",
        title: "Send the first bill",
        description: "Use a manual invoice first if you want the fastest route to collected cash.",
        href: "/invoices",
        action: "Open invoices",
      };
    }

    if (setupStats.payments === 0) {
      return {
        key: "collect-payment",
        title: "Chase the first payment",
        description: "Generate a payment link or record the payment as soon as it lands.",
        href: hasFeature(featureAccess, "payment_tracking") ? "/payments" : "/settings",
        action: hasFeature(featureAccess, "payment_tracking") ? "Open payments" : "Open settings",
      };
    }

    return {
      key: "scale-collections",
      title: "Tighten collections and renewals",
      description: "You are live. Focus on overdue invoices, renewals, and repeat billing.",
      href: "/invoices",
        action: "Review invoices",
      };
  }, [billingReadiness, featureAccess?.featureKeys, setupStats.customers, setupStats.invoices, setupStats.payments, setupStats.plans, setupStats.products, setupStats.subscriptions]);

  function applyQuickRange(range: QuickRange) {
    setQuickRange(range);
    if (range === "custom") {
      return;
    }

    const next = resolveQuickRange(range);
    setStartDateUtc(next.startDateUtc);
    setEndDateUtc(next.endDateUtc);
  }

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <h2>Dashboard</h2>
        </div>
      </header>

      <section className="card subtle-card dashboard-filters dashboard-controls-card">
        <div className="dashboard-filter-grid dashboard-filter-grid-mobile">
          <label className="form-label dashboard-filter-company">
            Company
            <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          {quickRange === "custom" ? (
            <>
              <label className="form-label dashboard-filter-date">
                Start date
                <input
                  className="text-input"
                  type="date"
                  value={startDateUtc}
                  onChange={(event) => {
                    setQuickRange("custom");
                    setStartDateUtc(event.target.value);
                  }}
                />
              </label>
              <label className="form-label dashboard-filter-date">
                End date
                <input
                  className="text-input"
                  type="date"
                  value={endDateUtc}
                  onChange={(event) => {
                    setQuickRange("custom");
                    setEndDateUtc(event.target.value);
                  }}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="dashboard-quick-filters">
          {[
            ["today", "Today"],
            ["thisMonth", "This Month"],
            ["last30", "Last 30 Days"],
            ["next7", "Next 7 Days"],
            ["custom", "Custom"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`dashboard-range-chip ${value === "custom" ? "dashboard-range-chip-custom" : ""} ${quickRange === value ? "dashboard-range-chip-active" : ""}`}
              onClick={() => applyQuickRange(value as QuickRange)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Billing is blocked until required setup is complete: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}
      {loading || !summary || !statusSummary ? <p>Loading business insight...</p> : (
        <>
          {!setupDismissed ? (
            <section className="card setup-card dashboard-panel">
              <div className="row dashboard-widget-header dashboard-setup-header">
                <div>
                  <p className="eyebrow">Get set up</p>
                  <h3 className="section-title">{`${completedSetupSteps} of ${enabledSetupSteps.length} operational steps completed`}</h3>
                  <p className="muted">Finish the next few setup actions to move from company profile to first payment collection.</p>
                </div>
                <div className="dashboard-quick-filters">
                  <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      localStorage.setItem("recurvos.setup.dismissed", "true");
                      setSetupDismissed(true);
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="dashboard-setup-progress">
                <div className="dashboard-setup-progress-stat">
                  <strong>{`${completedChecklistSteps.length}/${checklistSteps.length}`}</strong>
                  <span>setup tasks completed</span>
                </div>
                <div className="dashboard-setup-progress-bar" aria-hidden="true">
                  <span style={{ width: `${checklistSteps.length > 0 ? (completedChecklistSteps.length / checklistSteps.length) * 100 : 0}%` }} />
                </div>
              </div>
              {dashboardSetupMove ? (
                <button type="button" className="setup-step setup-step-featured" onClick={() => navigate(dashboardSetupMove.href)}>
                  <div>
                    <p className="eyebrow">Next move</p>
                    <strong>{dashboardSetupMove.title}</strong>
                    <p className="muted">{dashboardSetupMove.description}</p>
                  </div>
                  <div className="setup-step-meta">
                    <span className="status-pill status-pill-inactive">Next</span>
                    <span className="inline-link">{dashboardSetupMove.action}</span>
                  </div>
                </button>
              ) : (
                <div className="dashboard-setup-complete">
                  <strong>Core setup is complete.</strong>
                  <p className="muted">You can move directly into invoicing, subscriptions, and payment tracking.</p>
                </div>
              )}
              {completedChecklistSteps.length > 0 ? (
                <div className="dashboard-setup-completed">
                  <p className="eyebrow">Already done</p>
                  <div className="dashboard-setup-completed-list">
                    {completedChecklistSteps.slice(0, 3).map((step) => (
                      <span key={step.key} className="status-pill status-pill-active">{step.title}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="dashboard-setup-footer">
                <p className="muted">Need the full guided checklist?</p>
                <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Open Quick Start</button>
              </div>
            </section>
          ) : null}

          <section className="dashboard-kpi-grid">
            <KpiCard title="MRR" value={formatCurrency(summary.mrr, "MYR")} />
            <KpiCard title="Collected This Month" value={formatCurrency(summary.collectedThisMonth, "MYR")} />
            <KpiCard title="Overdue Amount" value={formatCurrency(summary.overdueAmount, "MYR")} />
            <KpiCard title="Active Subscriptions" value={String(summary.activeSubscriptions)} />
            <KpiCard title="Failed Payments" value={String(summary.failedPayments)} subtitle="Last 30 days" />
            <KpiCard title="Upcoming Renewals" value={String(summary.upcomingRenewals)} subtitle="Next 7 days" />
          </section>

          <div className="dashboard-grid-two">
            <DashboardChartCard title="Revenue trend">
              <SafeResponsiveChart className="dashboard-chart-shell dashboard-chart-shell-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrend} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8ea0b8" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis stroke="#8ea0b8" tickFormatter={(value) => `RM${value}`} tickLine={false} axisLine={false} width={46} />
                    <Tooltip
                      formatter={(value) => formatTooltipCurrency(value)}
                      contentStyle={{ background: "rgba(8, 17, 31, 0.94)", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: "14px", boxShadow: "0 14px 32px rgba(2, 8, 23, 0.32)" }}
                      labelStyle={{ color: "#e2e8f0", fontWeight: 600, marginBottom: "0.35rem" }}
                      itemStyle={{ color: "#f8fafc" }}
                    />
                    <Line type="monotone" dataKey="collectedRevenue" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </SafeResponsiveChart>
            </DashboardChartCard>
            <StatusSummaryCard summary={statusSummary} />
          </div>

          <div className="dashboard-grid-two">
            <DashboardTableCard title="Upcoming renewals">
              {upcomingRenewals && upcomingRenewals.items.length > 0 ? (
                <>
                  <div className="subscription-mobile-list dashboard-mobile-list">
                    {upcomingRenewals.items.map((item) => (
                      <article key={item.subscriptionId} className="subscription-mobile-card dashboard-mobile-card" onClick={() => navigate("/subscriptions")}>
                        <div className="subscription-mobile-card-header">
                          <div className="subscription-mobile-identity">
                            <strong>{item.customer}</strong>
                            <div className="eyebrow">{item.company}</div>
                          </div>
                        </div>
                        <div className="subscription-mobile-summary">
                          <div className="subscription-mobile-amount">{formatCurrency(item.amount, "MYR")}</div>
                          <div className="subscription-mobile-cadence">{item.plan}</div>
                        </div>
                        <div className="subscription-mobile-card-topline">
                          <span className="subscription-mobile-status subscription-mobile-status-active">{item.status}</span>
                          <span className="subscription-mobile-inline-note">{new Date(item.renewalDateUtc).toLocaleDateString()}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="subscription-table-shell dashboard-table-shell">
                    <div className="table-scroll dashboard-table-scroll">
                      <table className="catalog-table">
                        <thead>
                          <tr>
                            <th>Company</th>
                            <th>Customer</th>
                            <th>Plan</th>
                            <th>Amount</th>
                            <th>Renewal Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {upcomingRenewals.items.map((item) => (
                            <tr key={item.subscriptionId} className="dashboard-row-link" onClick={() => navigate("/subscriptions")}>
                              <td>{item.company}</td>
                              <td>{item.customer}</td>
                              <td>{item.plan}</td>
                              <td>{formatCurrency(item.amount, "MYR")}</td>
                              <td>{new Date(item.renewalDateUtc).toLocaleDateString()}</td>
                              <td><span className="status-pill status-pill-active">{item.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : <p className="muted">No renewals coming up.</p>}
            </DashboardTableCard>
            <DashboardTableCard title="Overdue invoices">
              {overdueInvoices && overdueInvoices.items.length > 0 ? (
                <>
                  <div className="subscription-mobile-list dashboard-mobile-list">
                    {overdueInvoices.items.map((item) => (
                      <article key={item.invoiceId} className="subscription-mobile-card dashboard-mobile-card" onClick={() => navigate("/invoices")}>
                        <div className="subscription-mobile-card-header">
                          <div className="subscription-mobile-identity">
                            <strong>{item.invoiceNumber}</strong>
                            <div className="eyebrow">{`${item.company} | ${item.customer}`}</div>
                          </div>
                        </div>
                        <div className="subscription-mobile-summary">
                          <div className="subscription-mobile-amount">{formatCurrency(item.amount, "MYR")}</div>
                          <div className="subscription-mobile-cadence">{`${item.daysOverdue} day(s) overdue`}</div>
                        </div>
                        <div className="subscription-mobile-card-topline">
                          <span className="subscription-mobile-status subscription-mobile-status-cancelled">{item.status}</span>
                          <span className="subscription-mobile-inline-note">{new Date(item.dueDateUtc).toLocaleDateString()}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="subscription-table-shell dashboard-table-shell">
                    <div className="table-scroll dashboard-table-scroll">
                      <table className="catalog-table">
                        <thead>
                          <tr>
                            <th>Invoice No</th>
                            <th>Company</th>
                            <th>Customer</th>
                            <th>Due Date</th>
                            <th>Amount</th>
                            <th>Days Overdue</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overdueInvoices.items.map((item) => (
                            <tr key={item.invoiceId} className="dashboard-row-link" onClick={() => navigate("/invoices")}>
                              <td>{item.invoiceNumber}</td>
                              <td>{item.company}</td>
                              <td>{item.customer}</td>
                              <td>{new Date(item.dueDateUtc).toLocaleDateString()}</td>
                              <td>{formatCurrency(item.amount, "MYR")}</td>
                              <td>{item.daysOverdue}</td>
                              <td><span className="status-pill status-pill-inactive">{item.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : <p className="muted">No overdue invoices.</p>}
            </DashboardTableCard>
          </div>

          <div className="dashboard-grid-mixed">
            <DashboardChartCard title="Subscription growth">
              <SafeResponsiveChart className="dashboard-chart-shell">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subscriptionGrowth} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barGap={8}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8ea0b8" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis stroke="#8ea0b8" tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      contentStyle={{ background: "rgba(8, 17, 31, 0.94)", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: "14px", boxShadow: "0 14px 32px rgba(2, 8, 23, 0.32)" }}
                      labelStyle={{ color: "#e2e8f0", fontWeight: 600, marginBottom: "0.35rem" }}
                      itemStyle={{ color: "#f8fafc" }}
                    />
                    <Bar dataKey="newSubscriptions" fill="#f97316" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="canceledSubscriptions" fill="#475569" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SafeResponsiveChart>
            </DashboardChartCard>

            <DashboardTableCard title="Recent payments">
              {recentPayments && recentPayments.items.length > 0 ? (
                <div className="stack dashboard-list">
                  {recentPayments.items.map((item) => (
                    <button key={item.paymentId} type="button" className="dashboard-list-item" onClick={() => navigate("/payments")}>
                      <div>
                        <strong>{item.customer}</strong>
                        <p className="muted">{`${item.company} | ${item.invoiceNumber} | ${item.paymentMethod}`}</p>
                      </div>
                      <div className="dashboard-list-metric">
                        <strong>{formatCurrency(item.amount, "MYR")}</strong>
                        <p className="muted">{new Date(item.paymentDateUtc).toLocaleDateString()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : <p className="muted">No failed or successful payments in this range.</p>}
            </DashboardTableCard>

            <DashboardTableCard title="Trial ending soon">
              {trialEnding && trialEnding.items.length > 0 ? (
                <div className="stack dashboard-list">
                  {trialEnding.items.map((item) => (
                    <button key={item.subscriptionId} type="button" className="dashboard-list-item" onClick={() => navigate("/subscriptions")}>
                      <div>
                        <strong>{item.customer}</strong>
                        <p className="muted">{`${item.company} | ${item.plan}`}</p>
                      </div>
                      <div className="dashboard-list-metric">
                        <strong>{new Date(item.trialEndDateUtc).toLocaleDateString()}</strong>
                        <p className="muted">{`${item.daysLeft} day(s) left`}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : <p className="muted">No trials ending soon.</p>}
            </DashboardTableCard>

            <DashboardTableCard title="Scheduled cancellations">
              {scheduledCancellations && scheduledCancellations.items.length > 0 ? (
                <div className="stack dashboard-list">
                  {scheduledCancellations.items.map((item) => (
                    <button key={item.subscriptionId} type="button" className="dashboard-list-item" onClick={() => navigate("/subscriptions")}>
                      <div>
                        <strong>{item.customer}</strong>
                        <p className="muted">{`${item.company} | ${item.plan}`}</p>
                      </div>
                      <div className="dashboard-list-metric">
                        <strong>{new Date(item.endDateUtc).toLocaleDateString()}</strong>
                        <p className="muted">{item.currentStatus}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : <p className="muted">No scheduled cancellations.</p>}
            </DashboardTableCard>

            <DashboardChartCard title="Revenue by company">
              {revenueByCompany.length > 1 || !selectedCompanyId ? (
                <SafeResponsiveChart className="dashboard-chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueByCompany} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                      <XAxis dataKey="company" stroke="#8ea0b8" hide={revenueByCompany.length > 5} tickLine={false} axisLine={false} tickMargin={10} />
                      <YAxis stroke="#8ea0b8" tickFormatter={(value) => `RM${value}`} tickLine={false} axisLine={false} width={46} />
                      <Tooltip
                        formatter={(value) => formatTooltipCurrency(value)}
                        contentStyle={{ background: "rgba(8, 17, 31, 0.94)", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: "14px", boxShadow: "0 14px 32px rgba(2, 8, 23, 0.32)" }}
                        labelStyle={{ color: "#e2e8f0", fontWeight: 600, marginBottom: "0.35rem" }}
                        itemStyle={{ color: "#f8fafc" }}
                      />
                      <Bar dataKey="collectedRevenue" fill="#fb7185" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </SafeResponsiveChart>
              ) : <p className="muted">Revenue by company appears when multiple companies are in scope.</p>}
            </DashboardChartCard>
          </div>
        </>
      )}
    </div>
  );
}
