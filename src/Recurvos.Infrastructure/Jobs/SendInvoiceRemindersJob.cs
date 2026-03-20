using Hangfire;
using Recurvos.Application.Invoices;

namespace Recurvos.Infrastructure.Jobs;

[AutomaticRetry(Attempts = 3)]
public sealed class SendInvoiceRemindersJob(IInvoiceService invoiceService)
{
    public async Task ExecuteAsync()
    {
        await invoiceService.SendRemindersAsync();
    }
}
