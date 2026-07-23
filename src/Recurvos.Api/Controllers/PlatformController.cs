using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Hangfire;
using Hangfire.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Invoices;
using Recurvos.Application.Platform;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Jobs;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize(Policy = "PlatformOwnerOnly")]
[Route("api/platform")]
public sealed class PlatformController(
    IPlatformService platformService,
    IInvoiceService invoiceService,
    IBackgroundJobClient backgroundJobClient,
    JobStorage jobStorage,
    IAuditService auditService,
    AppDbContext dbContext,
    SubscriberAccountBillingMigrationService subscriberAccountBillingMigrationService,
    IOptions<SubscriberAccountBillingOptions> subscriberAccountBillingOptions) : ControllerBase
{
    private static readonly (string Key, string Name)[] SupportedPlatformJobs =
    [
        ("generate-invoices", "Generate invoices"),
        ("generate-subscriber-package-invoices", "Generate subscriber package invoices"),
        ("reconcile-subscriber-package-statuses", "Reconcile subscriber package statuses"),
        ("reconcile-subscriber-account-billing", "Reconcile subscriber account billing"),
        ("send-invoice-reminders", "Send invoice reminders"),
        ("process-whatsapp-queue", "Process WhatsApp queue"),
        ("retry-failed-payments", "Retry failed payments"),
        ("recover-missed-receipt-emails", "Recover missed receipt emails"),
        ("cleanup-stale-signups", "Cleanup stale signups")
    ];

    [HttpGet("summary")]
    public async Task<ActionResult<PlatformDashboardSummaryDto>> GetSummary(CancellationToken cancellationToken) =>
        Ok(await platformService.GetDashboardSummaryAsync(cancellationToken));

    [HttpGet("subscriber-account-billing/rollout")]
    public async Task<ActionResult<object>> GetSubscriberAccountBillingRollout(CancellationToken cancellationToken)
    {
        var accounts = dbContext.SubscriberAccounts.AsNoTracking();
        return Ok(new
        {
            accountReadCanaryGloballyEnabled = subscriberAccountBillingOptions.Value.Enabled,
            totalAccounts = await accounts.CountAsync(cancellationToken),
            accountBillingEnabled = await accounts.CountAsync(x => x.AccountBillingEnabled, cancellationToken),
            legacyBilling = await accounts.CountAsync(x => !x.AccountBillingEnabled, cancellationToken),
            reconciled = await accounts.CountAsync(x => x.ReconciledAtUtc != null && x.ReconciliationWarning == null, cancellationToken),
            unresolvedWarnings = await accounts.CountAsync(x => x.ReconciliationWarning != null, cancellationToken),
            events = await dbContext.SubscriberAccountBillingEvents.AsNoTracking()
                .GroupBy(x => new { x.EventType, x.Severity })
                .Select(x => new { eventType = x.Key.EventType, severity = x.Key.Severity, count = x.Count() })
                .OrderBy(x => x.eventType)
                .ToListAsync(cancellationToken)
        });
    }

    [HttpGet("subscriber-account-billing/accounts/{accountId:guid}/health")]
    public async Task<ActionResult<object>> GetSubscriberAccountBillingHealth(Guid accountId, CancellationToken cancellationToken)
    {
        var account = await dbContext.SubscriberAccounts.AsNoTracking()
            .Include(x => x.Companies)
            .FirstOrDefaultAsync(x => x.Id == accountId, cancellationToken);
        if (account is null)
        {
            return NotFound();
        }

        // Observational only: all production billing reads remain on Company.
        var health = subscriberAccountBillingMigrationService.GetHealth(account);
        return Ok(new
        {
            accountId = account.Id,
            accountBillingEnabled = account.AccountBillingEnabled,
            canaryReadGloballyEnabled = subscriberAccountBillingOptions.Value.Enabled,
            canaryEligible = health.Status == "Healthy" && health.Warning is null,
            health = health.Status,
            warning = health.Warning,
            lastValidatedAtUtc = account.BillingValidatedAtUtc,
            shadowUpdatedAtUtc = account.BillingProjectionUpdatedAtUtc,
            legacy = health.LegacyState,
            shadow = new
            {
                packageCode = account.BillingPackageCode,
                pendingPackageCode = account.BillingPendingPackageCode,
                status = account.BillingStatus,
                gracePeriodEndsAtUtc = account.BillingGracePeriodEndsAtUtc,
                cycleStartUtc = account.BillingCycleStartUtc,
                trialEndsAtUtc = account.BillingTrialEndsAtUtc
            }
        });
    }

    [HttpGet("subscriber-account-billing/accounts")]
    public async Task<ActionResult<object>> ListSubscriberAccountBillingAccounts(CancellationToken cancellationToken)
    {
        var accounts = await dbContext.SubscriberAccounts.AsNoTracking()
            .Include(x => x.Companies)
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return Ok(accounts.Select(account => new
        {
            accountId = account.Id,
            accountBillingEnabled = account.AccountBillingEnabled,
            health = account.BillingHealthStatus ?? "NotValidated",
            warning = account.BillingHealthWarning ?? account.ReconciliationWarning,
            lastValidatedAtUtc = account.BillingValidatedAtUtc,
            companies = account.Companies.Where(x => !x.IsPlatformAccount).OrderBy(x => x.Name)
                .Select(x => new { companyId = x.Id, companyName = x.Name })
        }));
    }

    [HttpPut("subscriber-account-billing/accounts/{accountId:guid}/canary")]
    public async Task<ActionResult<object>> SetSubscriberAccountBillingCanary(
        Guid accountId,
        SubscriberAccountBillingCanaryRequest request,
        CancellationToken cancellationToken)
    {
        var account = await dbContext.SubscriberAccounts
            .Include(x => x.Companies)
            .FirstOrDefaultAsync(x => x.Id == accountId, cancellationToken);
        if (account is null)
        {
            return NotFound();
        }

        if (request.Enabled && !subscriberAccountBillingOptions.Value.Enabled)
        {
            return Conflict(new { message = "The global account-billing read canary is disabled. No account can be opted in." });
        }

        var health = subscriberAccountBillingMigrationService.GetHealth(account);
        if (request.Enabled && (health.Status != "Healthy" || health.Warning is not null))
        {
            return Conflict(new { message = "Only a healthy account whose shadow exactly matches legacy Company billing can be opted in.", health = health.Status, warning = health.Warning });
        }

        if (account.AccountBillingEnabled != request.Enabled)
        {
            account.AccountBillingEnabled = request.Enabled;
            account.UpdatedAtUtc = DateTime.UtcNow;
            dbContext.SubscriberAccountBillingEvents.Add(new Domain.Entities.SubscriberAccountBillingEvent
            {
                SubscriberAccountId = account.Id,
                EventType = request.Enabled ? "billing.canary.enabled" : "billing.canary.disabled",
                Severity = "Information",
                Details = request.Enabled
                    ? "Per-account billing read canary enabled after a healthy legacy/shadow comparison."
                    : "Per-account billing read canary disabled; legacy Company billing remains in use."
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return Ok(new { accountId = account.Id, accountBillingEnabled = account.AccountBillingEnabled, canaryReadGloballyEnabled = subscriberAccountBillingOptions.Value.Enabled });
    }

    public sealed class SubscriberAccountBillingCanaryRequest
    {
        public bool Enabled { get; set; }
    }

    [HttpGet("subscribers")]
    public async Task<ActionResult<IReadOnlyCollection<SubscriberCompanyDto>>> GetSubscribers(CancellationToken cancellationToken) =>
        Ok(await platformService.GetSubscribersAsync(cancellationToken));

    [HttpPut("subscribers/{companyId:guid}/package")]
    public async Task<ActionResult<SubscriberCompanyDto>> AssignSubscriberPackage(Guid companyId, AssignSubscriberPackageRequest request, CancellationToken cancellationToken) =>
        Ok(await platformService.AssignSubscriberPackageAsync(companyId, request, cancellationToken));

    [HttpGet("users")]
    public async Task<ActionResult<IReadOnlyCollection<PlatformUserDto>>> GetUsers(CancellationToken cancellationToken) =>
        Ok(await platformService.GetUsersAsync(cancellationToken));

    [HttpPost("users/platform-admin")]
    public async Task<ActionResult<PlatformUserDto>> CreatePlatformAdmin(CreatePlatformAdminRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await platformService.CreatePlatformAdminAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPut("users/{userId:guid}")]
    public async Task<ActionResult<PlatformUserDto>> UpdateUser(Guid userId, UpdatePlatformUserRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await platformService.UpdateUserAsync(userId, request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("users/{userId:guid}/password-reset")]
    public async Task<IActionResult> SendPasswordReset(Guid userId, CancellationToken cancellationToken)
    {
        try
        {
            await platformService.SendPasswordResetAsync(userId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("users/{userId:guid}/resend-verification")]
    public async Task<IActionResult> ResendVerification(Guid userId, CancellationToken cancellationToken)
    {
        try
        {
            await platformService.ResendVerificationAsync(userId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("packages")]
    public async Task<ActionResult<IReadOnlyCollection<PlatformPackageDto>>> GetPackages(CancellationToken cancellationToken) =>
        Ok(await platformService.GetPackagesAsync(includeInactive: true, cancellationToken));

    [HttpGet("email-logs")]
    public async Task<ActionResult<IReadOnlyCollection<EmailDispatchLogDto>>> GetEmailLogs(CancellationToken cancellationToken) =>
        Ok(await platformService.GetEmailLogsAsync(cancellationToken));

    [HttpGet("whatsapp-failures")]
    public async Task<ActionResult<IReadOnlyCollection<FailedWhatsAppNotificationDto>>> GetFailedWhatsAppNotifications(CancellationToken cancellationToken) =>
        Ok(await platformService.GetFailedWhatsAppNotificationsAsync(cancellationToken));

    [HttpGet("whatsapp-queue")]
    public async Task<ActionResult<IReadOnlyCollection<PlatformWhatsAppQueueItemDto>>> GetWhatsAppQueueItems(CancellationToken cancellationToken) =>
        Ok(await platformService.GetWhatsAppQueueItemsAsync(cancellationToken));

    [HttpPost("whatsapp-queue/{id:guid}/retry")]
    public async Task<ActionResult<PlatformWhatsAppQueueItemDto>> RetryWhatsAppQueueItem(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await platformService.RetryWhatsAppQueueItemAsync(id, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("whatsapp-queue/{id:guid}/cancel")]
    public async Task<ActionResult<PlatformWhatsAppQueueItemDto>> CancelWhatsAppQueueItem(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await platformService.CancelWhatsAppQueueItemAsync(id, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("whatsapp-failures/{id:guid}/retry")]
    public async Task<ActionResult<WhatsAppRetryResultDto>> RetryFailedWhatsAppNotification(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await invoiceService.RetryFailedWhatsAppNotificationAsync(id, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("audit-logs")]
    public async Task<ActionResult<IReadOnlyCollection<AuditLogEntryDto>>> GetAuditLogs([FromQuery] int take = 100, CancellationToken cancellationToken = default) =>
        Ok(await platformService.GetAuditLogsAsync(take, cancellationToken));

    [HttpPost("factory-reset")]
    public async Task<ActionResult<FactoryResetResult>> FactoryReset(FactoryResetRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await platformService.FactoryResetAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPut("packages/{id:guid}")]
    public async Task<ActionResult<PlatformPackageDto>> UpdatePackage(Guid id, UpdatePlatformPackageRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await platformService.UpdatePackageAsync(id, request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("invoice-preview/download")]
    public async Task<IActionResult> DownloadInvoicePreview(PreviewInvoiceRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var file = await invoiceService.GeneratePreviewPdfAsync(request, cancellationToken);
            return File(file.Content, file.ContentType, file.FileName);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("receipt-preview/download")]
    public async Task<IActionResult> DownloadReceiptPreview(PreviewReceiptRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var file = await invoiceService.GenerateReceiptPreviewPdfAsync(request, cancellationToken);
            return File(file.Content, file.ContentType, file.FileName);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("jobs/{jobKey}/trigger")]
    public async Task<ActionResult<PlatformJobTriggerResultDto>> TriggerJob(string jobKey, CancellationToken cancellationToken)
    {
        try
        {
            var (normalizedJobKey, jobName, hangfireJobId) = jobKey.Trim().ToLowerInvariant() switch
            {
                "generate-invoices" => (
                    "generate-invoices",
                    "Generate invoices",
                    backgroundJobClient.Enqueue<GenerateInvoicesJob>(job => job.ExecuteAsync())),
                "generate-subscriber-package-invoices" => (
                    "generate-subscriber-package-invoices",
                    "Generate subscriber package invoices",
                    backgroundJobClient.Enqueue<GenerateSubscriberPackageInvoicesJob>(job => job.ExecuteAsync())),
                "reconcile-subscriber-package-statuses" => (
                    "reconcile-subscriber-package-statuses",
                    "Reconcile subscriber package statuses",
                    backgroundJobClient.Enqueue<ReconcileSubscriberPackageStatusesJob>(job => job.ExecuteAsync())),
                "reconcile-subscriber-account-billing" => (
                    "reconcile-subscriber-account-billing",
                    "Reconcile subscriber account billing",
                    backgroundJobClient.Enqueue<ReconcileSubscriberAccountBillingJob>(job => job.ExecuteAsync())),
                "send-invoice-reminders" => (
                    "send-invoice-reminders",
                    "Send invoice reminders",
                    backgroundJobClient.Enqueue<SendInvoiceRemindersJob>(job => job.ExecuteAsync())),
                "process-whatsapp-queue" => (
                    "process-whatsapp-queue",
                    "Process WhatsApp queue",
                    backgroundJobClient.Enqueue<ProcessWhatsAppQueueJob>(job => job.ExecuteAsync())),
                "retry-failed-payments" => (
                    "retry-failed-payments",
                    "Retry failed payments",
                    backgroundJobClient.Enqueue<RetryFailedPaymentsJob>(job => job.ExecuteAsync())),
                "recover-missed-receipt-emails" => (
                    "recover-missed-receipt-emails",
                    "Recover missed receipt emails",
                    backgroundJobClient.Enqueue<RecoverMissedReceiptEmailsJob>(job => job.ExecuteAsync())),
                "cleanup-stale-signups" => (
                    "cleanup-stale-signups",
                    "Cleanup stale signups",
                    backgroundJobClient.Enqueue<CleanupStaleSignupsJob>(job => job.ExecuteAsync())),
                _ => throw new InvalidOperationException("Unknown platform job.")
            };
            var platformCompanyId = await dbContext.Companies
                .Where(x => x.IsPlatformAccount)
                .Select(x => x.Id)
                .FirstAsync(cancellationToken);
            await auditService.WriteAsync(
                "platform.job.manual-triggered",
                "PlatformJob",
                normalizedJobKey,
                platformCompanyId,
                $"hangfireJobId={hangfireJobId}",
                cancellationToken);

            return Ok(new PlatformJobTriggerResultDto(
                normalizedJobKey,
                jobName,
                hangfireJobId,
                $"{jobName} was queued in Hangfire.",
                DateTime.UtcNow));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("jobs")]
    public async Task<ActionResult<IReadOnlyCollection<PlatformJobStatusDto>>> GetJobs(CancellationToken cancellationToken)
    {
        using var connection = jobStorage.GetConnection();
        var recurringJobs = connection.GetRecurringJobs()
            .ToDictionary(x => x.Id, StringComparer.OrdinalIgnoreCase);
        var monitoringApi = jobStorage.GetMonitoringApi();
        var jobKeys = SupportedPlatformJobs.Select(x => x.Key).ToArray();
        var manualTriggerLogs = await dbContext.AuditLogs
            .Where(x => x.EntityName == "PlatformJob"
                && x.Action == "platform.job.manual-triggered"
                && jobKeys.Contains(x.EntityId))
            .GroupBy(x => x.EntityId)
            .Select(x => x
                .OrderByDescending(entry => entry.CreatedAtUtc)
                .Select(entry => new
                {
                    JobKey = x.Key,
                    entry.CreatedAtUtc,
                    entry.Metadata
                })
                .First())
            .ToDictionaryAsync(x => x.JobKey, cancellationToken);

        var results = SupportedPlatformJobs
            .Select(definition =>
            {
                recurringJobs.TryGetValue(definition.Key, out var recurringJob);
                manualTriggerLogs.TryGetValue(definition.Key, out var manualTrigger);
                var lastJobId = recurringJob?.LastJobId;
                var jobDetails = string.IsNullOrWhiteSpace(lastJobId) ? null : monitoringApi.JobDetails(lastJobId);
                var recentHistory = jobDetails?.History?
                    .OrderByDescending(x => x.CreatedAt)
                    .Take(5)
                    .Select(x => new PlatformJobHistoryEntryDto(
                        x.StateName,
                        string.IsNullOrWhiteSpace(x.Reason) ? null : x.Reason,
                        DateTime.SpecifyKind(x.CreatedAt, DateTimeKind.Utc)))
                    .ToArray()
                    ?? [];

                return new PlatformJobStatusDto(
                    definition.Key,
                    definition.Name,
                    recurringJob?.Cron ?? "-",
                    recurringJob?.Queue ?? "default",
                    recurringJob?.TimeZoneId ?? "UTC",
                    recurringJob?.NextExecution,
                    recurringJob?.LastExecution,
                    manualTrigger?.CreatedAtUtc,
                    TryParseManualTriggerJobId(manualTrigger?.Metadata),
                    lastJobId,
                    recurringJob?.LastJobState,
                    recurringJob?.Error,
                    recurringJob?.RetryAttempt ?? 0,
                    jobDetails?.CreatedAt,
                    recentHistory);
            })
            .ToArray();

        return Ok(results);
    }

    private static string? TryParseManualTriggerJobId(string? metadata)
    {
        const string prefix = "hangfireJobId=";
        return string.IsNullOrWhiteSpace(metadata) || !metadata.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? null
            : metadata[prefix.Length..];
    }
}
