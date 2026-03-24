using Hangfire;
using Recurvos.Application.Platform;

namespace Recurvos.Infrastructure.Jobs;

[AutomaticRetry(Attempts = 3)]
public sealed class ReconcileSubscriberPackageStatusesJob(ISubscriberPackageBillingService billingService)
{
    public async Task ExecuteAsync()
    {
        await billingService.ReconcileExpiredPackageStatusesAsync();
    }
}
