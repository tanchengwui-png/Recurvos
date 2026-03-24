using Hangfire;
using Recurvos.Application.Platform;

namespace Recurvos.Infrastructure.Jobs;

[AutomaticRetry(Attempts = 3)]
public sealed class GenerateSubscriberPackageInvoicesJob(ISubscriberPackageBillingService billingService)
{
    public async Task ExecuteAsync()
    {
        await billingService.GenerateDueRenewalInvoicesAsync();
    }
}
