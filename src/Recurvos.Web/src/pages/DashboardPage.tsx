import { useEffect, useMemo, useState } from "react";
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
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { BillingReadiness, CompanyLookup, FeatureAccess } from "../types";

type QuickRange = "thisMonth" | "last30" | "today" | "next7";

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
  const reportsEnabled = featureAccess?.featureKeys.includes("basic_reports") ?? false;
  const { loading, error, summary, upcomingRenewals, overdueInvoices, recentPayments, scheduledCancellations, trialEnding, revenueTrend, subscriptionGrowth, revenueByCompany, statusSummary } = useDashboard(filters, reportsEnabled);

  useEffect(() => {
    void (async () => {
      const companyList = await api.get<CompanyLookup[]>("/companies");
      const access = await api.get<FeatureAccess>("/settings/feature-access");
      setCompanies(companyList);
      setFeatureAccess(access);
      if (companyList.length === 1) {
        setSelectedCompanyId(companyList[0].id);
      }

      const [products, plans, customers, subscriptions, invoices, payments, readiness] = await Promise.all([
        fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 1 }),
        fetchProductPlans({ billingType: "all", isActive: "all", page: 1, pageSize: 1 }),
        access.featureKeys.includes("customer_management") ? api.get<unknown[]>("/customers") : Promise.resolve([]),
        access.featureKeys.includes("recurring_invoices") ? api.get<unknown[]>("/subscriptions") : Promise.resolve([]),
        access.featureKeys.includes("manual_invoices") || access.featureKeys.includes("recurring_invoices") ? api.get<unknown[]>("/invoices") : Promise.resolve([]),
        access.featureKeys.includes("payment_tracking") ? api.get<unknown[]>("/payments") : Promise.resolve([]),
        api.get<BillingReadiness>(`/settings/billing-readiness${companyList[0]?.id ? `?companyId=${companyList[0].id}` : ""}`),
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

    void api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${selectedCompanyId}`).then(setBillingReadiness);
  }, [selectedCompanyId]);

  const setupSteps = [
    { key: "companies", title: "Create company", description: "Add your billing entity and contact details.", done: companies.length > 0, href: "/companies", action: "Open Companies" },
    { key: "logo", title: "Upload logo", description: "Brand invoices with your company logo.", done: companies.some((company) => company.hasLogo), href: "/companies", action: "Manage Logo" },
    { key: "products", title: "Create product", description: "Define what your customer is buying.", done: setupStats.products > 0, href: "/products", action: "Open Products" },
    { key: "plans", title: "Create plan", description: "Set how much and how often customers are charged.", done: setupStats.plans > 0, href: "/plans", action: "Open Plans" },
    { key: "customers", title: "Add customer", description: "Create the people or businesses you bill.", done: setupStats.customers > 0, href: "/customers", action: "Open Customers", enabled: featureAccess?.featureKeys.includes("customer_management") ?? false },
    { key: "subscriptions", title: "Create subscription", description: "Link a customer to a recurring plan.", done: setupStats.subscriptions > 0, href: "/subscriptions", action: "Open Subscriptions", enabled: featureAccess?.featureKeys.includes("recurring_invoices") ?? false },
    { key: "invoices", title: "Review invoice", description: "Create a manual invoice or wait for a renewal invoice.", done: setupStats.invoices > 0, href: "/invoices", action: "Open Invoices", enabled: (featureAccess?.featureKeys.includes("manual_invoices") ?? false) || (featureAccess?.featureKeys.includes("recurring_invoices") ?? false) },
    { key: "payments", title: "Collect payment", description: "Record payment or generate a payment link.", done: setupStats.payments > 0, href: "/payments", action: "Open Payments", enabled: featureAccess?.featureKeys.includes("payment_tracking") ?? false },
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

  function applyQuickRange(range: QuickRange) {
    setQuickRange(range);
    const next = resolveQuickRange(range);
    setStartDateUtc(next.startDateUtc);
    setEndDateUtc(next.endDateUtc);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Overview</p>
          <h2>Business dashboard</h2>
          <p className="muted">How much you have collected, what renews next, what is overdue, and what needs action today.</p>
        </div>
      </header>

      <section className="card subtle-card dashboard-filters dashboard-controls-card">
        <div className="dashboard-filters-heading">
          <div>
            <p className="eyebrow">Range</p>
            <h3 className="section-title">Filter dashboard</h3>
          </div>
          <p className="muted">Choose one company and one time window.</p>
        </div>
        <div className="dashboard-filter-grid">
          <label className="form-label">
            Company
            <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Start date
            <input className="text-input" type="date" value={startDateUtc} onChange={(event) => setStartDateUtc(event.target.value)} />
          </label>
          <label className="form-label">
            End date
            <input className="text-input" type="date" value={endDateUtc} onChange={(event) => setEndDateUtc(event.target.value)} />
          </label>
        </div>
        <div className="dashboard-quick-filters">
          {[
            ["today", "Today"],
            ["thisMonth", "This Month"],
            ["last30", "Last 30 Days"],
            ["next7", "Next 7 Days"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`dashboard-range-chip ${quickRange === value ? "dashboard-range-chip-active" : ""}`}
              onClick={() => applyQuickRange(value as QuickRange)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {featureAccess && !reportsEnabled ? (
        <HelperText>Your current package does not include Basic reports.</HelperText>
      ) : null}
      {billingReadiness && !billingReadiness.isReady ? (
        <HelperText>
          {`Billing is blocked until required setup is complete: ${billingReadiness.items.filter((item) => item.required && !item.done).map((item) => item.title).join(", ")}.`}
        </HelperText>
      ) : null}
      {!reportsEnabled ? null : loading || !summary || !statusSummary ? <p>Loading business insight...</p> : (
        <>
          {!setupDismissed ? (
            <section className="card setup-card dashboard-panel">
              <div className="row dashboard-widget-header dashboard-setup-header">
                <div>
                  <p className="eyebrow">Get set up</p>
                  <h3 className="section-title">{`${completedSetupSteps} of ${enabledSetupSteps.length} operational steps completed`}</h3>
                  <p className="muted">Follow the normal Recurvo billing flow from company profile to first payment collection.</p>
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
              <div className="setup-checklist">
                {checklistSteps.map((step) => (
                  <button key={step.key} type="button" className="setup-step" onClick={() => navigate(step.href)}>
                    <div>
                      <strong>{step.title}</strong>
                      <p className="muted">{step.description}</p>
                    </div>
                    <div className="setup-step-meta">
                      <span className={`status-pill ${step.done ? "status-pill-active" : "status-pill-inactive"}`}>{step.done ? "Done" : "Next"}</span>
                      <span className="inline-link">{step.action}</span>
                    </div>
                  </button>
                ))}
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
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="label" stroke="#8ea0b8" />
                  <YAxis stroke="#8ea0b8" tickFormatter={(value) => `RM${value}`} />
                  <Tooltip formatter={(value) => formatTooltipCurrency(value)} />
                  <Line type="monotone" dataKey="collectedRevenue" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </DashboardChartCard>
            <StatusSummaryCard summary={statusSummary} />
          </div>

          <div className="dashboard-grid-two">
            <DashboardTableCard title="Upcoming renewals">
              {upcomingRenewals && upcomingRenewals.items.length > 0 ? (
                <div className="table-scroll">
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
              ) : <p className="muted">No renewals coming up.</p>}
            </DashboardTableCard>
            <DashboardTableCard title="Overdue invoices">
              {overdueInvoices && overdueInvoices.items.length > 0 ? (
                <div className="table-scroll">
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
              ) : <p className="muted">No overdue invoices.</p>}
            </DashboardTableCard>
          </div>

          <div className="dashboard-grid-mixed">
            <DashboardChartCard title="Subscription growth">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={subscriptionGrowth}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="label" stroke="#8ea0b8" />
                  <YAxis stroke="#8ea0b8" />
                  <Tooltip />
                  <Bar dataKey="newSubscriptions" fill="#f97316" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="canceledSubscriptions" fill="#475569" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenueByCompany}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                    <XAxis dataKey="company" stroke="#8ea0b8" hide={revenueByCompany.length > 5} />
                    <YAxis stroke="#8ea0b8" tickFormatter={(value) => `RM${value}`} />
                    <Tooltip formatter={(value) => formatTooltipCurrency(value)} />
                    <Bar dataKey="collectedRevenue" fill="#fb7185" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="muted">Revenue by company appears when multiple companies are in scope.</p>}
            </DashboardChartCard>
          </div>
        </>
      )}
    </div>
  );
}
