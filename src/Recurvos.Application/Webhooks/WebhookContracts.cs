namespace Recurvos.Application.Webhooks;

public sealed record WebhookParseResult(string ExternalEventId, string EventType, string ExternalPaymentId, bool PaymentSucceeded, string RawPayload);

public interface IWebhookService
{
    Task<bool> ProcessAsync(string gatewayName, string payload, IDictionary<string, string> headers, CancellationToken cancellationToken = default);
    Task<bool> ConfirmAsync(string gatewayName, string externalPaymentId, string rawPayload, CancellationToken cancellationToken = default);
}
