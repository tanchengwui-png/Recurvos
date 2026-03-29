using Hangfire;
using Hangfire.Storage;
using Recurvos.Infrastructure.Jobs;

namespace Recurvos.Infrastructure.Services;

public sealed class HangfireBootstrapService(
    IRecurringJobManager recurringJobManager,
    JobStorage jobStorage)
{
    public void EnsureConfigured()
    {
        // Touch storage so Hangfire.PostgreSql can prepare its schema when needed.
        using var connection = jobStorage.GetConnection();
        _ = connection.GetRecurringJobs();

        recurringJobManager.AddOrUpdate<GenerateInvoicesJob>(
            "generate-invoices",
            job => job.ExecuteAsync(),
            Cron.Hourly);
        recurringJobManager.AddOrUpdate<GenerateSubscriberPackageInvoicesJob>(
            "generate-subscriber-package-invoices",
            job => job.ExecuteAsync(),
            Cron.Hourly);
        recurringJobManager.AddOrUpdate<ReconcileSubscriberPackageStatusesJob>(
            "reconcile-subscriber-package-statuses",
            job => job.ExecuteAsync(),
            Cron.Hourly);
        recurringJobManager.AddOrUpdate<SendInvoiceRemindersJob>(
            "send-invoice-reminders",
            job => job.ExecuteAsync(),
            Cron.Daily);
        recurringJobManager.AddOrUpdate<RetryFailedPaymentsJob>(
            "retry-failed-payments",
            job => job.ExecuteAsync(),
            Cron.Hourly);
        recurringJobManager.AddOrUpdate<CleanupStaleSignupsJob>(
            "cleanup-stale-signups",
            job => job.ExecuteAsync(),
            Cron.Daily);
    }
}
