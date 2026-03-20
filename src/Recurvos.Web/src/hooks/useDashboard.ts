import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  DashboardRecentPayment,
  DashboardSummary,
  OverdueInvoice,
  PagedResult,
  RevenueByCompany,
  RevenueTrendPoint,
  ScheduledCancellation,
  SubscriptionGrowthPoint,
  SubscriptionStatusSummary,
  TrialEnding,
  UpcomingRenewal,
} from "../types";

export type DashboardFilters = {
  companyId?: string;
  startDateUtc?: string;
  endDateUtc?: string;
};

function toQueryString(filters: DashboardFilters & { page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (filters.companyId) {
    params.set("companyId", filters.companyId);
  }

  if (filters.startDateUtc) {
    params.set("startDateUtc", filters.startDateUtc);
  }

  if (filters.endDateUtc) {
    params.set("endDateUtc", filters.endDateUtc);
  }

  if (filters.page) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize) {
    params.set("pageSize", String(filters.pageSize));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useDashboard(filters: DashboardFilters, enabled = true) {
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [upcomingRenewals, setUpcomingRenewals] = useState<PagedResult<UpcomingRenewal> | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<PagedResult<OverdueInvoice> | null>(null);
  const [recentPayments, setRecentPayments] = useState<PagedResult<DashboardRecentPayment> | null>(null);
  const [scheduledCancellations, setScheduledCancellations] = useState<PagedResult<ScheduledCancellation> | null>(null);
  const [trialEnding, setTrialEnding] = useState<PagedResult<TrialEnding> | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
  const [subscriptionGrowth, setSubscriptionGrowth] = useState<SubscriptionGrowthPoint[]>([]);
  const [revenueByCompany, setRevenueByCompany] = useState<RevenueByCompany[]>([]);
  const [statusSummary, setStatusSummary] = useState<SubscriptionStatusSummary | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      setSummary(null);
      setUpcomingRenewals(null);
      setOverdueInvoices(null);
      setRecentPayments(null);
      setScheduledCancellations(null);
      setTrialEnding(null);
      setRevenueTrend([]);
      setSubscriptionGrowth([]);
      setRevenueByCompany([]);
      setStatusSummary(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const filterQuery = toQueryString(filters);
        const pagedQuery = toQueryString({ ...filters, page: 1, pageSize: 10 });
        const [summaryResult, renewalsResult, overdueResult, paymentsResult, cancellationsResult, trialResult, revenueTrendResult, growthResult, revenueByCompanyResult, statusSummaryResult] = await Promise.all([
          api.get<DashboardSummary>(`/dashboard/summary${filterQuery}`),
          api.get<PagedResult<UpcomingRenewal>>(`/dashboard/upcoming-renewals${pagedQuery}`),
          api.get<PagedResult<OverdueInvoice>>(`/dashboard/overdue-invoices${pagedQuery}`),
          api.get<PagedResult<DashboardRecentPayment>>(`/dashboard/recent-payments${pagedQuery}`),
          api.get<PagedResult<ScheduledCancellation>>(`/dashboard/scheduled-cancellations${pagedQuery}`),
          api.get<PagedResult<TrialEnding>>(`/dashboard/trial-ending${pagedQuery}`),
          api.get<RevenueTrendPoint[]>(`/dashboard/revenue-trend${filterQuery}`),
          api.get<SubscriptionGrowthPoint[]>(`/dashboard/subscription-growth${filterQuery}`),
          api.get<RevenueByCompany[]>(`/dashboard/revenue-by-company${filterQuery}`),
          api.get<SubscriptionStatusSummary>(`/dashboard/subscription-status-summary${filterQuery}`),
        ]);

        if (cancelled) {
          return;
        }

        setSummary(summaryResult);
        setUpcomingRenewals(renewalsResult);
        setOverdueInvoices(overdueResult);
        setRecentPayments(paymentsResult);
        setScheduledCancellations(cancellationsResult);
        setTrialEnding(trialResult);
        setRevenueTrend(revenueTrendResult);
        setSubscriptionGrowth(growthResult);
        setRevenueByCompany(revenueByCompanyResult);
        setStatusSummary(statusSummaryResult);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, filters.companyId, filters.startDateUtc, filters.endDateUtc]);

  return {
    loading,
    error,
    summary,
    upcomingRenewals,
    overdueInvoices,
    recentPayments,
    scheduledCancellations,
    trialEnding,
    revenueTrend,
    subscriptionGrowth,
    revenueByCompany,
    statusSummary,
  };
}
