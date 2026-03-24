using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Hangfire;
using Hangfire.Storage;
using Recurvos.Application.Invoices;
using Recurvos.Application.Platform;
using Recurvos.Infrastructure.Jobs;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize(Policy = "PlatformOwnerOnly")]
[Route("api/platform")]
public sealed class PlatformController(
    IPlatformService platformService,
    IInvoiceService invoiceService,
    IBackgroundJobClient backgroundJobClient,
    JobStorage jobStorage) : ControllerBase
{
    private static readonly (string Key, string Name)[] SupportedPlatformJobs =
    [
        ("generate-invoices", "Generate invoices"),
        ("generate-subscriber-package-invoices", "Generate subscriber package invoices"),
        ("reconcile-subscriber-package-statuses", "Reconcile subscriber package statuses"),
        ("send-invoice-reminders", "Send invoice reminders"),
        ("retry-failed-payments", "Retry failed payments"),
        ("cleanup-stale-signups", "Cleanup stale signups")
    ];

    [HttpGet("summary")]
    public async Task<ActionResult<PlatformDashboardSummaryDto>> GetSummary(CancellationToken cancellationToken) =>
        Ok(await platformService.GetDashboardSummaryAsync(cancellationToken));

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
    public ActionResult<PlatformJobTriggerResultDto> TriggerJob(string jobKey)
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
                "send-invoice-reminders" => (
                    "send-invoice-reminders",
                    "Send invoice reminders",
                    backgroundJobClient.Enqueue<SendInvoiceRemindersJob>(job => job.ExecuteAsync())),
                "retry-failed-payments" => (
                    "retry-failed-payments",
                    "Retry failed payments",
                    backgroundJobClient.Enqueue<RetryFailedPaymentsJob>(job => job.ExecuteAsync())),
                "cleanup-stale-signups" => (
                    "cleanup-stale-signups",
                    "Cleanup stale signups",
                    backgroundJobClient.Enqueue<CleanupStaleSignupsJob>(job => job.ExecuteAsync())),
                _ => throw new InvalidOperationException("Unknown platform job.")
            };

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
    public ActionResult<IReadOnlyCollection<PlatformJobStatusDto>> GetJobs()
    {
        using var connection = jobStorage.GetConnection();
        var recurringJobs = connection.GetRecurringJobs()
            .ToDictionary(x => x.Id, StringComparer.OrdinalIgnoreCase);
        var monitoringApi = jobStorage.GetMonitoringApi();

        var results = SupportedPlatformJobs
            .Select(definition =>
            {
                recurringJobs.TryGetValue(definition.Key, out var recurringJob);
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
}
