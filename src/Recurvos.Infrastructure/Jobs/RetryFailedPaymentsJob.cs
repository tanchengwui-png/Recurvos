using Hangfire;
using Recurvos.Application.Payments;

namespace Recurvos.Infrastructure.Jobs;

[AutomaticRetry(Attempts = 3)]
public sealed class RetryFailedPaymentsJob(IPaymentService paymentService)
{
    public async Task ExecuteAsync()
    {
        await paymentService.RetryFailedPaymentsAsync();
    }
}
