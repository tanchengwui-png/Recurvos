using Hangfire;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Infrastructure.Jobs;

[AutomaticRetry(Attempts = 0)]
public sealed class ProcessWhatsAppQueueJob(WhatsAppQueueProcessorService processorService)
{
    public async Task ExecuteAsync()
    {
        await processorService.ProcessAsync();
    }
}
