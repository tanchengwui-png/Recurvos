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

        var webhookEvent = await GetOrCreatePendingWebhookEventAsync(
            payment.CompanyId,
            gateway.Name,
            parsed.ExternalEventId,
            parsed.EventType,
            parsed.RawPayload,
            JsonSerializer.Serialize(headers),
            cancellationToken);
        if (webhookEvent.Processed)
        {
            return false;
        }
        await paymentService.MarkPaymentAsync(parsed.ExternalPaymentId, parsed.PaymentSucceeded, parsed.RawPayload, cancellationToken);
        webhookEvent.Processed = true;
        webhookEvent.ProcessedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> ConfirmAsync(string gatewayName, string externalPaymentId, string rawPayload, CancellationToken cancellationToken = default)
    {
        var gateway = gateways.FirstOrDefault(x => string.Equals(x.Name, gatewayName, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Unsupported gateway.");
        var payment = await dbContext.Payments.FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken)
            ?? throw new InvalidOperationException("Payment not found for confirmation.");
        var parsed = await gateway.VerifyPaymentAsync(externalPaymentId, payment.CompanyId, cancellationToken);

        var webhookEvent = await GetOrCreatePendingWebhookEventAsync(
            payment.CompanyId,
            gateway.Name,
            parsed.ExternalEventId,
            parsed.EventType,
            string.IsNullOrWhiteSpace(rawPayload) ? parsed.RawPayload : rawPayload,
            "{}",
            cancellationToken);
        if (webhookEvent.Processed)
        {
            return false;
        }
        await paymentService.MarkPaymentAsync(parsed.ExternalPaymentId, parsed.PaymentSucceeded, parsed.RawPayload, cancellationToken);
        webhookEvent.Processed = true;
        webhookEvent.ProcessedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<WebhookEvent> GetOrCreatePendingWebhookEventAsync(
        Guid companyId,
        string gatewayName,
        string externalEventId,
        string eventType,
        string payload,
        string headers,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.WebhookEvents
            .FirstOrDefaultAsync(
                x => x.CompanyId == companyId
                    && x.GatewayName == gatewayName
                    && x.ExternalEventId == externalEventId,
                cancellationToken);
        if (existing is not null)
        {
            if (!existing.Processed)
            {
                existing.EventType = eventType;
                existing.Payload = payload;
                existing.Headers = headers;
            }

            return existing;
        }

        var webhookEvent = new WebhookEvent
        {
            CompanyId = companyId,
            GatewayName = gatewayName,
            ExternalEventId = externalEventId,
            EventType = eventType,
            Payload = payload,
            Headers = headers,
            Processed = false,
            ProcessedAtUtc = null
        };

        dbContext.WebhookEvents.Add(webhookEvent);
        await dbContext.SaveChangesAsync(cancellationToken);
        return webhookEvent;
    }
}
