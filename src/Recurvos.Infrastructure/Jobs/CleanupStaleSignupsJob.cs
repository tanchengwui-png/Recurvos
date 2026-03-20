using Hangfire;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Infrastructure.Jobs;

public sealed class CleanupStaleSignupsJob(StaleSignupCleanupService cleanupService)
{
    [AutomaticRetry(Attempts = 0)]
    public async Task ExecuteAsync()
    {
        await cleanupService.CleanupAsync();
    }
}
