using Recurvos.Application.Payments;
using Recurvos.Application.Webhooks;

namespace Recurvos.Application.Abstractions;

public interface IPaymentGateway
{
    string Name { get; }
    Task<PaymentLinkResult> CreatePaymentLinkAsync(CreatePaymentLinkCommand command, CancellationToken cancellationToken = default);
    string? ExtractExternalPaymentId(string payload, IDictionary<string, string> headers);
    Task<WebhookParseResult> ParseWebhookAsync(string payload, IDictionary<string, string> headers, Guid companyId, CancellationToken cancellationToken = default);
    Task<WebhookParseResult> VerifyPaymentAsync(string externalPaymentId, Guid companyId, CancellationToken cancellationToken = default);
}
