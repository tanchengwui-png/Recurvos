using Hangfire;
using Recurvos.Application.Payments;

namespace Recurvos.Infrastructure.Jobs;

[AutomaticRetry(Attempts = 3)]
public sealed class RecoverMissedReceiptEmailsJob(IPaymentService paymentService)
{
    public async Task ExecuteAsync()
    {
        await paymentService.RecoverMissedReceiptEmailsAsync();
    }
}
