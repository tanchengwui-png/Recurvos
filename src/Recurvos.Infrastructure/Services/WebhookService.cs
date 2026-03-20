using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Webhooks;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class WebhookService(AppDbContext dbContext, IEnumerable<IPaymentGateway> gateways, PaymentService paymentService) : IWebhookService
{
    public async Task<bool> ProcessAsync(string gatewayName, string payload, IDictionary<string, string> headers, CancellationToken cancellationToken = default)
    {
        var gateway = gateways.FirstOrDefault(x => string.Equals(x.Name, gatewayName, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Unsupported gateway.");
        var externalPaymentId = gateway.ExtractExternalPaymentId(payload, headers);
        if (string.IsNullOrWhiteSpace(externalPaymentId))
        {
            throw new InvalidOperationException("Unable to resolve payment id from webhook payload.");
        }

        var payment = await dbContext.Payments.FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken)
            ?? throw new InvalidOperationException("Payment not found for webhook.");
        var parsed = await gateway.ParseWebhookAsync(payload, headers, payment.CompanyId, cancellationToken);

        var alreadyProcessed = await dbContext.WebhookEvents.AnyAsync(x => x.CompanyId == payment.CompanyId && x.GatewayName == gateway.Name && x.ExternalEventId == parsed.ExternalEventId, cancellationToken);
        if (alreadyProcessed)
        {
            return false;
        }

        dbContext.WebhookEvents.Add(new WebhookEvent
        {
            CompanyId = payment.CompanyId,
            GatewayName = gateway.Name,
            ExternalEventId = parsed.ExternalEventId,
            EventType = parsed.EventType,
            Payload = parsed.RawPayload,
            Headers = JsonSerializer.Serialize(headers),
            Processed = true,
            ProcessedAtUtc = DateTime.UtcNow
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        await paymentService.MarkPaymentAsync(parsed.ExternalPaymentId, parsed.PaymentSucceeded, parsed.RawPayload, cancellationToken);
        return true;
    }

    public async Task<bool> ConfirmAsync(string gatewayName, string externalPaymentId, string rawPayload, CancellationToken cancellationToken = default)
    {
        var gateway = gateways.FirstOrDefault(x => string.Equals(x.Name, gatewayName, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Unsupported gateway.");
        var payment = await dbContext.Payments.FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken)
            ?? throw new InvalidOperationException("Payment not found for confirmation.");
        var parsed = await gateway.VerifyPaymentAsync(externalPaymentId, payment.CompanyId, cancellationToken);

        var alreadyProcessed = await dbContext.WebhookEvents.AnyAsync(x => x.CompanyId == payment.CompanyId && x.GatewayName == gateway.Name && x.ExternalEventId == parsed.ExternalEventId, cancellationToken);
        if (alreadyProcessed)
        {
            return false;
        }

        dbContext.WebhookEvents.Add(new WebhookEvent
        {
            CompanyId = payment.CompanyId,
            GatewayName = gateway.Name,
            ExternalEventId = parsed.ExternalEventId,
            EventType = parsed.EventType,
            Payload = string.IsNullOrWhiteSpace(rawPayload) ? parsed.RawPayload : rawPayload,
            Headers = "{}",
            Processed = true,
            ProcessedAtUtc = DateTime.UtcNow
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        await paymentService.MarkPaymentAsync(parsed.ExternalPaymentId, parsed.PaymentSucceeded, parsed.RawPayload, cancellationToken);
        return true;
    }
}
