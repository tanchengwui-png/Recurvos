using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Common;
using Recurvos.Application.Dashboard;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public sealed class DashboardController(IDashboardService dashboardService) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryDto>> Summary([FromQuery] DashboardFilterQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetSummaryAsync(query, cancellationToken));

    [HttpGet("upcoming-renewals")]
    public async Task<ActionResult<PagedResult<UpcomingRenewalDto>>> UpcomingRenewals([FromQuery] DashboardPagedQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetUpcomingRenewalsAsync(query, cancellationToken));

    [HttpGet("overdue-invoices")]
    public async Task<ActionResult<PagedResult<OverdueInvoiceDto>>> OverdueInvoices([FromQuery] DashboardPagedQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetOverdueInvoicesAsync(query, cancellationToken));

    [HttpGet("recent-payments")]
    public async Task<ActionResult<PagedResult<RecentPaymentDto>>> RecentPayments([FromQuery] DashboardPagedQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetRecentPaymentsAsync(query, cancellationToken));

    [HttpGet("scheduled-cancellations")]
    public async Task<ActionResult<PagedResult<ScheduledCancellationDto>>> ScheduledCancellations([FromQuery] DashboardPagedQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetScheduledCancellationsAsync(query, cancellationToken));

    [HttpGet("trial-ending")]
    public async Task<ActionResult<PagedResult<TrialEndingDto>>> TrialEnding([FromQuery] DashboardPagedQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetTrialEndingAsync(query, cancellationToken));

    [HttpGet("revenue-trend")]
    public async Task<ActionResult<IReadOnlyCollection<RevenueTrendPointDto>>> RevenueTrend([FromQuery] DashboardFilterQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetRevenueTrendAsync(query, cancellationToken));

    [HttpGet("subscription-growth")]
    public async Task<ActionResult<IReadOnlyCollection<SubscriptionGrowthPointDto>>> SubscriptionGrowth([FromQuery] DashboardFilterQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetSubscriptionGrowthAsync(query, cancellationToken));

    [HttpGet("revenue-by-company")]
    public async Task<ActionResult<IReadOnlyCollection<RevenueByCompanyDto>>> RevenueByCompany([FromQuery] DashboardFilterQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetRevenueByCompanyAsync(query, cancellationToken));

    [HttpGet("subscription-status-summary")]
    public async Task<ActionResult<SubscriptionStatusSummaryDto>> SubscriptionStatusSummary([FromQuery] DashboardFilterQuery query, CancellationToken cancellationToken) =>
        Ok(await dashboardService.GetSubscriptionStatusSummaryAsync(query, cancellationToken));
}
