using Hangfire;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Infrastructure.Jobs;

public sealed class ReconcileSubscriberAccountBillingJob(SubscriberAccountBillingMigrationService service)
{
    [Queue("default")]
    public Task<int> ExecuteAsync() => service.ReconcileAsync();
}
