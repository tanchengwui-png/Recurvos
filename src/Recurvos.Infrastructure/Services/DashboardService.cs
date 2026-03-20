using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Common;
using Recurvos.Application.Dashboard;
using Recurvos.Application.Features;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class DashboardService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IFeatureEntitlementService featureEntitlementService) : IDashboardService
{
    public async Task<DashboardSummaryDto> GetSummaryAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var nowUtc = DateTime.UtcNow;
        var todayUtc = nowUtc.Date;
        var paymentRange = ResolveRange(query, StartOfMonth(nowUtc), StartOfNextMonth(nowUtc));
        var renewalsEndUtc = query.EndDateUtc?.ToUniversalTime() ?? todayUtc.AddDays(7);
        var failedPaymentsStartUtc = query.StartDateUtc.HasValue ? query.StartDateUtc.Value.ToUniversalTime() : nowUtc.AddDays(-30);
        var failedPaymentsEndUtc = query.EndDateUtc.HasValue ? query.EndDateUtc.Value.ToUniversalTime() : nowUtc;

        var subscriptionSnapshots = await Subscriptions(companyIds)
            .Where(x => x.Status == SubscriptionStatus.Active)
            .SelectMany(x => x.Items
                .Where(item => !item.EndedAtUtc.HasValue && item.IntervalUnit != IntervalUnit.None)
                .Select(item => new
                {
                    item.UnitAmount,
                    item.Quantity,
                    item.IntervalUnit,
                    item.IntervalCount,
                    item.NextBillingUtc,
                    item.AutoRenew
                }))
            .ToListAsync(cancellationToken);

        var mrr = subscriptionSnapshots.Sum(x => NormalizeToMonthly(x.UnitAmount * x.Quantity, x.IntervalUnit, x.IntervalCount));
        var collectedThisMonth = await SuccessfulPayments(companyIds)
            .Where(x => x.PaidAtUtc >= paymentRange.StartUtc && x.PaidAtUtc < paymentRange.EndUtc)
            .SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0m;
        var overdueAmount = await Invoices(companyIds)
            .Where(x => x.Status == InvoiceStatus.Open && x.AmountDue > 0 && x.DueDateUtc < todayUtc)
            .SumAsync(x => (decimal?)x.AmountDue, cancellationToken) ?? 0m;
        var activeSubscriptions = await Subscriptions(companyIds)
            .CountAsync(x => x.Status == SubscriptionStatus.Active, cancellationToken);
        var failedPayments = await Payments(companyIds)
            .Where(x => x.Status == PaymentStatus.Failed && x.CreatedAtUtc >= failedPaymentsStartUtc && x.CreatedAtUtc < failedPaymentsEndUtc)
            .CountAsync(cancellationToken);
        var upcomingRenewals = await Subscriptions(companyIds)
            .SelectMany(x => x.Items.Where(item => !item.EndedAtUtc.HasValue).Select(item => new { x.Status, item.AutoRenew, item.NextBillingUtc }))
            .CountAsync(x =>
                x.Status == SubscriptionStatus.Active
                && x.AutoRenew
                && x.NextBillingUtc.HasValue
                && x.NextBillingUtc.Value >= todayUtc
                && x.NextBillingUtc.Value < renewalsEndUtc,
                cancellationToken);

        return new DashboardSummaryDto(mrr, collectedThisMonth, overdueAmount, activeSubscriptions, failedPayments, upcomingRenewals);
    }

    public async Task<PagedResult<UpcomingRenewalDto>> GetUpcomingRenewalsAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var todayUtc = DateTime.UtcNow.Date;
        var range = ResolveRange(query, todayUtc, todayUtc.AddDays(14));

        var rawQuery = Subscriptions(companyIds)
            .Where(x => x.Status == SubscriptionStatus.Active)
            .SelectMany(x => x.Items
                .Where(item => !item.EndedAtUtc.HasValue
                    && item.AutoRenew
                    && item.NextBillingUtc.HasValue
                    && item.NextBillingUtc.Value >= range.StartUtc
                    && item.NextBillingUtc.Value < range.EndUtc)
                .Select(item => new
                {
                    SubscriptionId = x.Id,
                    x.CompanyId,
                    Company = x.Company!.Name,
                    Customer = x.Customer!.Name,
                    Plan = item.ProductPlan!.PlanName,
                    Amount = item.UnitAmount * item.Quantity,
                    RenewalDateUtc = item.NextBillingUtc!.Value,
                    x.Status
                }))
            .OrderBy(x => x.RenewalDateUtc);

        var totalCount = await rawQuery.CountAsync(cancellationToken);
        var items = await rawQuery.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return new PagedResult<UpcomingRenewalDto>(items.Select(x => new UpcomingRenewalDto(
            x.SubscriptionId,
            x.CompanyId,
            x.Company,
            x.Customer,
            x.Plan,
            x.Amount,
            x.RenewalDateUtc,
            x.Status.ToString())).ToList(), totalCount);
    }

    public async Task<PagedResult<OverdueInvoiceDto>> GetOverdueInvoicesAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var todayUtc = DateTime.UtcNow.Date;

        var rawQuery = Invoices(companyIds)
            .Where(x => x.Status == InvoiceStatus.Open && x.AmountDue > 0 && x.DueDateUtc < todayUtc)
            .OrderBy(x => x.DueDateUtc)
            .Select(x => new
            {
                x.Id,
                x.CompanyId,
                x.InvoiceNumber,
                Company = dbContext.Companies.Where(c => c.Id == x.CompanyId).Select(c => c.Name).FirstOrDefault() ?? string.Empty,
                Customer = x.Customer!.Name,
                x.DueDateUtc,
                x.AmountDue,
                x.Status
            });

        var totalCount = await rawQuery.CountAsync(cancellationToken);
        var items = await rawQuery.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return new PagedResult<OverdueInvoiceDto>(items.Select(x => new OverdueInvoiceDto(
                x.Id,
                x.CompanyId,
                x.InvoiceNumber,
                x.Company,
                x.Customer,
                x.DueDateUtc,
                x.AmountDue,
                Math.Max(0, (todayUtc - x.DueDateUtc.Date).Days),
                x.Status.ToString())).ToList(), totalCount);
    }

    public async Task<PagedResult<RecentPaymentDto>> GetRecentPaymentsAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var range = ResolveRange(query, DateTime.UtcNow.AddDays(-30), DateTime.UtcNow.AddDays(1));

        var rawQuery = Payments(companyIds)
            .Where(x => x.CreatedAtUtc >= range.StartUtc && x.CreatedAtUtc < range.EndUtc)
            .OrderByDescending(x => x.PaidAtUtc ?? x.CreatedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.CompanyId,
                Company = dbContext.Companies.Where(c => c.Id == x.CompanyId).Select(c => c.Name).FirstOrDefault() ?? string.Empty,
                Customer = x.Invoice!.Customer!.Name,
                InvoiceNumber = x.Invoice!.InvoiceNumber,
                x.Amount,
                x.GatewayName,
                x.Status,
                PaymentDateUtc = x.PaidAtUtc ?? x.CreatedAtUtc
            });

        var totalCount = await rawQuery.CountAsync(cancellationToken);
        var items = await rawQuery.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return new PagedResult<RecentPaymentDto>(items.Select(x => new RecentPaymentDto(
            x.Id,
            x.CompanyId,
            x.Company,
            x.Customer,
            x.InvoiceNumber,
            x.Amount,
            x.GatewayName,
            x.Status.ToString(),
            x.PaymentDateUtc)).ToList(), totalCount);
    }

    public async Task<PagedResult<ScheduledCancellationDto>> GetScheduledCancellationsAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var todayUtc = DateTime.UtcNow.Date;
        var range = ResolveRange(query, todayUtc, todayUtc.AddDays(30));

        var rawQuery = Subscriptions(companyIds)
            .Where(x =>
                (x.CancelAtPeriodEnd && x.CurrentPeriodEndUtc.HasValue && x.CurrentPeriodEndUtc.Value >= range.StartUtc && x.CurrentPeriodEndUtc.Value < range.EndUtc)
                || (x.EndedAtUtc.HasValue && x.EndedAtUtc.Value >= range.StartUtc && x.EndedAtUtc.Value < range.EndUtc))
            .OrderBy(x => x.CurrentPeriodEndUtc ?? x.EndedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.CompanyId,
                Company = x.Company!.Name,
                Customer = x.Customer!.Name,
                Plan = x.Items.OrderBy(i => i.CreatedAtUtc).Select(i => i.ProductPlan!.PlanName).FirstOrDefault() ?? "Subscription",
                EndDateUtc = x.CurrentPeriodEndUtc ?? x.EndedAtUtc ?? DateTime.UtcNow,
                x.Status
            });

        var totalCount = await rawQuery.CountAsync(cancellationToken);
        var items = await rawQuery.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return new PagedResult<ScheduledCancellationDto>(items.Select(x => new ScheduledCancellationDto(
            x.Id,
            x.CompanyId,
            x.Company,
            x.Customer,
            x.Plan,
            x.EndDateUtc,
            x.Status.ToString())).ToList(), totalCount);
    }

    public async Task<PagedResult<TrialEndingDto>> GetTrialEndingAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var todayUtc = DateTime.UtcNow.Date;
        var range = ResolveRange(query, todayUtc, todayUtc.AddDays(7));

        var rawQuery = Subscriptions(companyIds)
            .SelectMany(x => x.Items
                .Where(item => !item.EndedAtUtc.HasValue
                    && item.TrialEndUtc.HasValue
                    && item.TrialEndUtc.Value >= range.StartUtc
                    && item.TrialEndUtc.Value < range.EndUtc)
                .Select(item => new
                {
                    SubscriptionId = x.Id,
                    x.CompanyId,
                    Company = x.Company!.Name,
                    Customer = x.Customer!.Name,
                    Plan = item.ProductPlan!.PlanName,
                    TrialEndDateUtc = item.TrialEndUtc!.Value
                }))
            .OrderBy(x => x.TrialEndDateUtc);

        var totalCount = await rawQuery.CountAsync(cancellationToken);
        var items = await rawQuery.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return new PagedResult<TrialEndingDto>(items.Select(x => new TrialEndingDto(
                x.SubscriptionId,
                x.CompanyId,
                x.Company,
                x.Customer,
                x.Plan,
                x.TrialEndDateUtc,
                Math.Max(0, (x.TrialEndDateUtc.Date - todayUtc).Days))).ToList(), totalCount);
    }

    public async Task<IReadOnlyCollection<RevenueTrendPointDto>> GetRevenueTrendAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var range = ResolveRange(query, StartOfMonth(DateTime.UtcNow).AddMonths(-5), StartOfNextMonth(DateTime.UtcNow));

        var grouped = await SuccessfulPayments(companyIds)
            .Where(x => x.PaidAtUtc >= range.StartUtc && x.PaidAtUtc < range.EndUtc)
            .GroupBy(x => new { x.PaidAtUtc!.Value.Year, x.PaidAtUtc!.Value.Month })
            .Select(x => new { x.Key.Year, x.Key.Month, Amount = x.Sum(p => p.Amount) })
            .ToListAsync(cancellationToken);

        return EnumerateMonths(range.StartUtc, range.EndUtc)
            .Select(month => new RevenueTrendPointDto(
                month,
                month.ToString("MMM yyyy"),
                grouped.FirstOrDefault(x => x.Year == month.Year && x.Month == month.Month)?.Amount ?? 0m))
            .ToList();
    }

    public async Task<IReadOnlyCollection<SubscriptionGrowthPointDto>> GetSubscriptionGrowthAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var range = ResolveRange(query, StartOfMonth(DateTime.UtcNow).AddMonths(-5), StartOfNextMonth(DateTime.UtcNow));

        var created = await Subscriptions(companyIds)
            .Where(x => x.CreatedAtUtc >= range.StartUtc && x.CreatedAtUtc < range.EndUtc)
            .GroupBy(x => new { x.CreatedAtUtc.Year, x.CreatedAtUtc.Month })
            .Select(x => new { x.Key.Year, x.Key.Month, Count = x.Count() })
            .ToListAsync(cancellationToken);

        var canceled = await Subscriptions(companyIds)
            .Where(x => x.EndedAtUtc.HasValue && x.EndedAtUtc.Value >= range.StartUtc && x.EndedAtUtc.Value < range.EndUtc)
            .GroupBy(x => new { x.EndedAtUtc!.Value.Year, x.EndedAtUtc!.Value.Month })
            .Select(x => new { x.Key.Year, x.Key.Month, Count = x.Count() })
            .ToListAsync(cancellationToken);

        return EnumerateMonths(range.StartUtc, range.EndUtc)
            .Select(month =>
            {
                var newCount = created.FirstOrDefault(x => x.Year == month.Year && x.Month == month.Month)?.Count ?? 0;
                var canceledCount = canceled.FirstOrDefault(x => x.Year == month.Year && x.Month == month.Month)?.Count ?? 0;
                return new SubscriptionGrowthPointDto(month, month.ToString("MMM yyyy"), newCount, canceledCount, newCount - canceledCount);
            })
            .ToList();
    }

    public async Task<IReadOnlyCollection<RevenueByCompanyDto>> GetRevenueByCompanyAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var range = ResolveRange(query, StartOfMonth(DateTime.UtcNow), StartOfNextMonth(DateTime.UtcNow));

        var revenueRows = await SuccessfulPayments(companyIds)
            .Where(x => x.PaidAtUtc >= range.StartUtc && x.PaidAtUtc < range.EndUtc)
            .GroupBy(x => x.CompanyId)
            .Select(x => new { CompanyId = x.Key, CollectedRevenue = x.Sum(p => p.Amount) })
            .ToListAsync(cancellationToken);

        var companyNames = await dbContext.Companies
            .Where(x => companyIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);

        return revenueRows
            .Select(x => new RevenueByCompanyDto(
                x.CompanyId,
                companyNames.TryGetValue(x.CompanyId, out var name) ? name : string.Empty,
                x.CollectedRevenue))
            .OrderByDescending(x => x.CollectedRevenue)
            .ToList();
    }

    public async Task<SubscriptionStatusSummaryDto> GetSubscriptionStatusSummaryAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default)
    {
        var companyIds = await GetScopedCompanyIdsAsync(query.CompanyId, cancellationToken);
        var nowUtc = DateTime.UtcNow;
        var subscriptions = await Subscriptions(companyIds)
            .Select(x => new
            {
                x.Status,
                x.TrialEndUtc,
                x.CancelAtPeriodEnd,
                x.EndedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new SubscriptionStatusSummaryDto(
            subscriptions.Count(x => x.Status == SubscriptionStatus.Active && (!x.TrialEndUtc.HasValue || x.TrialEndUtc <= nowUtc)),
            subscriptions.Count(x => x.TrialEndUtc.HasValue && x.TrialEndUtc > nowUtc),
            subscriptions.Count(x => x.Status == SubscriptionStatus.Paused),
            subscriptions.Count(x => x.CancelAtPeriodEnd),
            subscriptions.Count(x => x.Status == SubscriptionStatus.Cancelled || x.EndedAtUtc.HasValue));
    }

    private IQueryable<Subscription> Subscriptions(IReadOnlyCollection<Guid> companyIds) =>
        dbContext.Subscriptions
            .Include(x => x.Company)
            .Include(x => x.Customer)
            .Include(x => x.Items).ThenInclude(x => x.ProductPlan)
            .Where(x => companyIds.Contains(x.CompanyId));

    private IQueryable<Invoice> Invoices(IReadOnlyCollection<Guid> companyIds) =>
        dbContext.Invoices.Include(x => x.Customer).Where(x => companyIds.Contains(x.CompanyId));

    private IQueryable<Payment> Payments(IReadOnlyCollection<Guid> companyIds) =>
        dbContext.Payments.Include(x => x.Invoice).ThenInclude(x => x!.Customer).Where(x => companyIds.Contains(x.CompanyId));

    private IQueryable<Payment> SuccessfulPayments(IReadOnlyCollection<Guid> companyIds) =>
        Payments(companyIds).Where(x => x.Status == PaymentStatus.Succeeded && x.PaidAtUtc.HasValue);

    private async Task<IReadOnlyCollection<Guid>> GetScopedCompanyIdsAsync(Guid? companyId, CancellationToken cancellationToken)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.BasicReports, cancellationToken);
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var companies = dbContext.Companies.Where(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount);

        if (companyId.HasValue)
        {
            var exists = await companies.AnyAsync(x => x.Id == companyId.Value, cancellationToken);
            if (!exists)
            {
                throw new UnauthorizedAccessException();
            }

            return new[] { companyId.Value };
        }

        return await companies.Select(x => x.Id).ToListAsync(cancellationToken);
    }

    private static async Task<PagedResult<T>> PageAsync<T>(IQueryable<T> query, DashboardPagedQuery page, CancellationToken cancellationToken)
    {
        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.Skip((page.Page - 1) * page.PageSize).Take(page.PageSize).ToListAsync(cancellationToken);
        return new PagedResult<T>(items, totalCount);
    }

    private static decimal NormalizeToMonthly(decimal amount, IntervalUnit intervalUnit, int intervalCount)
    {
        if (intervalCount <= 0)
        {
            return 0m;
        }

        return intervalUnit switch
        {
            IntervalUnit.Month => amount / intervalCount,
            IntervalUnit.Quarter => amount / (3 * intervalCount),
            IntervalUnit.Year => amount / (12 * intervalCount),
            _ => 0m
        };
    }

    private static (DateTime StartUtc, DateTime EndUtc) ResolveRange(DashboardFilterQuery query, DateTime defaultStartUtc, DateTime defaultEndUtc)
    {
        var startUtc = query.StartDateUtc?.ToUniversalTime() ?? defaultStartUtc;
        var endUtc = query.EndDateUtc?.ToUniversalTime() ?? defaultEndUtc;
        return endUtc <= startUtc ? (startUtc, startUtc.AddDays(1)) : (startUtc, endUtc);
    }

    private static DateTime StartOfMonth(DateTime dateUtc) => new(dateUtc.Year, dateUtc.Month, 1, 0, 0, 0, DateTimeKind.Utc);

    private static DateTime StartOfNextMonth(DateTime dateUtc) => StartOfMonth(dateUtc).AddMonths(1);

    private static IEnumerable<DateTime> EnumerateMonths(DateTime startUtc, DateTime endUtc)
    {
        var cursor = StartOfMonth(startUtc);
        var end = StartOfMonth(endUtc);

        while (cursor < end)
        {
            yield return cursor;
            cursor = cursor.AddMonths(1);
        }
    }
}
