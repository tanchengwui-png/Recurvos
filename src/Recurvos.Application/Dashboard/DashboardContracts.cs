using System.ComponentModel.DataAnnotations;
using Recurvos.Application.Common;

namespace Recurvos.Application.Dashboard;

public class DashboardFilterQuery
{
    public Guid? CompanyId { get; set; }
    public DateTime? StartDateUtc { get; set; }
    public DateTime? EndDateUtc { get; set; }
}

public sealed class DashboardPagedQuery : DashboardFilterQuery
{
    [Range(1, 10_000)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 10;
}

public sealed record DashboardSummaryDto(
    decimal Mrr,
    decimal CollectedThisMonth,
    decimal OverdueAmount,
    int ActiveSubscriptions,
    int FailedPayments,
    int UpcomingRenewals);

public sealed record UpcomingRenewalDto(
    Guid SubscriptionId,
    Guid CompanyId,
    string Company,
    string Customer,
    string Plan,
    decimal Amount,
    DateTime RenewalDateUtc,
    string Status);

public sealed record OverdueInvoiceDto(
    Guid InvoiceId,
    Guid CompanyId,
    string InvoiceNumber,
    string Company,
    string Customer,
    DateTime DueDateUtc,
    decimal Amount,
    int DaysOverdue,
    string Status);

public sealed record RecentPaymentDto(
    Guid PaymentId,
    Guid CompanyId,
    string Company,
    string Customer,
    string InvoiceNumber,
    decimal Amount,
    string PaymentMethod,
    string Status,
    DateTime PaymentDateUtc);

public sealed record ScheduledCancellationDto(
    Guid SubscriptionId,
    Guid CompanyId,
    string Company,
    string Customer,
    string Plan,
    DateTime EndDateUtc,
    string CurrentStatus);

public sealed record TrialEndingDto(
    Guid SubscriptionId,
    Guid CompanyId,
    string Company,
    string Customer,
    string Plan,
    DateTime TrialEndDateUtc,
    int DaysLeft);

public sealed record RevenueTrendPointDto(
    DateTime MonthStartUtc,
    string Label,
    decimal CollectedRevenue);

public sealed record SubscriptionGrowthPointDto(
    DateTime MonthStartUtc,
    string Label,
    int NewSubscriptions,
    int CanceledSubscriptions,
    int NetGrowth);

public sealed record RevenueByCompanyDto(
    Guid CompanyId,
    string Company,
    decimal CollectedRevenue);

public sealed record SubscriptionStatusSummaryDto(
    int Active,
    int Trialing,
    int Paused,
    int CancelingAtPeriodEnd,
    int CanceledOrEnded);

public interface IDashboardService
{
    Task<DashboardSummaryDto> GetSummaryAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default);
    Task<PagedResult<UpcomingRenewalDto>> GetUpcomingRenewalsAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default);
    Task<PagedResult<OverdueInvoiceDto>> GetOverdueInvoicesAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default);
    Task<PagedResult<RecentPaymentDto>> GetRecentPaymentsAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default);
    Task<PagedResult<ScheduledCancellationDto>> GetScheduledCancellationsAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default);
    Task<PagedResult<TrialEndingDto>> GetTrialEndingAsync(DashboardPagedQuery query, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RevenueTrendPointDto>> GetRevenueTrendAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SubscriptionGrowthPointDto>> GetSubscriptionGrowthAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RevenueByCompanyDto>> GetRevenueByCompanyAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default);
    Task<SubscriptionStatusSummaryDto> GetSubscriptionStatusSummaryAsync(DashboardFilterQuery query, CancellationToken cancellationToken = default);
}
