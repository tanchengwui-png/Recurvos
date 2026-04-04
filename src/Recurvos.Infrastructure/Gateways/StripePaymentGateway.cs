using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Payments;
using Recurvos.Application.Webhooks;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Stripe;
using Stripe.Checkout;

namespace Recurvos.Infrastructure.Gateways;

public sealed class StripePaymentGateway(AppDbContext dbContext, IOptions<StripeOptions> options) : IPaymentGateway
{
    private readonly StripeOptions _options = options.Value;
    public string Name => "Stripe";

    public async Task<PaymentLinkResult> CreatePaymentLinkAsync(CreatePaymentLinkCommand command, CancellationToken cancellationToken = default)
    {
        var configurationCompanyId = command.GatewayConfigurationCompanyId == Guid.Empty ? command.CompanyId : command.GatewayConfigurationCompanyId;
        var settings = await ResolveSettingsAsync(configurationCompanyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.SecretKey) || string.IsNullOrWhiteSpace(settings.PublishableKey))
        {
            throw new InvalidOperationException("Stripe is not configured. Set Stripe publishable and secret keys.");
        }

        var client = new StripeClient(settings.SecretKey);
        var service = new SessionService(client);
        var redirectUrl = string.IsNullOrWhiteSpace(command.RedirectUrl) ? "https://example.invalid" : command.RedirectUrl!;

        var session = await service.CreateAsync(new SessionCreateOptions
        {
            Mode = "payment",
            SuccessUrl = AppendQueryString(redirectUrl, "stripe_status=success&session_id={CHECKOUT_SESSION_ID}"),
            CancelUrl = AppendQueryString(redirectUrl, "stripe_status=cancelled"),
            CustomerEmail = command.CustomerEmail,
            ClientReferenceId = command.InvoiceId.ToString("D"),
            Metadata = new Dictionary<string, string>
            {
                ["invoiceId"] = command.InvoiceId.ToString("D"),
                ["invoiceNumber"] = command.InvoiceNumber,
                ["companyId"] = command.CompanyId.ToString("D"),
            },
            LineItems =
            [
                new SessionLineItemOptions
                {
                    Quantity = 1,
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency = command.Currency.ToLowerInvariant(),
                        UnitAmount = ConvertToSmallestUnit(command.Amount),
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = string.IsNullOrWhiteSpace(command.Description) ? $"Invoice {command.InvoiceNumber}" : command.Description,
                        },
                    },
                },
            ],
        }, null, cancellationToken);

        if (string.IsNullOrWhiteSpace(session.Id) || string.IsNullOrWhiteSpace(session.Url))
        {
            throw new InvalidOperationException("Stripe response did not include a checkout session.");
        }

        return new PaymentLinkResult(session.Id, session.Url, JsonSerializer.Serialize(session));
    }

    public string? ExtractExternalPaymentId(string payload, IDictionary<string, string> headers)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var stripeObject = document.RootElement
                .GetProperty("data")
                .GetProperty("object");

            if (TryGetString(stripeObject, "id", out var directId) && IsCheckoutSessionId(directId))
            {
                return directId;
            }

            if (TryGetNestedString(stripeObject, ["payment_details", "order_reference"], out var orderReference)
                && IsCheckoutSessionId(orderReference))
            {
                return orderReference;
            }

            if (TryGetNestedString(stripeObject, ["metadata", "checkout_session_id"], out var metadataSessionId)
                && IsCheckoutSessionId(metadataSessionId))
            {
                return metadataSessionId;
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    public async Task<WebhookParseResult> ParseWebhookAsync(string payload, IDictionary<string, string> headers, Guid companyId, CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(companyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.WebhookSecret))
        {
            throw new InvalidOperationException("Stripe webhook secret is required.");
        }

        var signature = headers.FirstOrDefault(x => string.Equals(x.Key, "Stripe-Signature", StringComparison.OrdinalIgnoreCase)).Value;
        if (string.IsNullOrWhiteSpace(signature))
        {
            throw new InvalidOperationException("Stripe webhook missing Stripe-Signature.");
        }

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(payload, signature, settings.WebhookSecret);
        }
        catch (StripeException exception)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(exception.Message)
                ? "Invalid Stripe webhook signature."
                : exception.Message);
        }

        var externalPaymentId = ExtractExternalPaymentId(payload, headers);
        if (string.IsNullOrWhiteSpace(externalPaymentId))
        {
            throw new InvalidOperationException("Stripe webhook does not contain a checkout session reference.");
        }

        return new WebhookParseResult(
            stripeEvent.Id,
            stripeEvent.Type,
            externalPaymentId,
            IsPaymentSucceeded(stripeEvent),
            payload);
    }

    public async Task<WebhookParseResult> VerifyPaymentAsync(string externalPaymentId, Guid companyId, CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(companyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.SecretKey))
        {
            throw new InvalidOperationException("Stripe secret key is required for payment verification.");
        }

        var client = new StripeClient(settings.SecretKey);
        var service = new SessionService(client);
        var session = await service.GetAsync(externalPaymentId, null, null, cancellationToken);
        return new WebhookParseResult(
            $"verify:{session.Id}:{session.PaymentStatus}",
            string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase) ? "payment.succeeded" : "payment.failed",
            session.Id,
            string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase),
            JsonSerializer.Serialize(session));
    }

    private async Task<ResolvedStripeSettings> ResolveSettingsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => new
            {
                x.IsPlatformAccount,
                x.InvoiceSettings,
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (settings is null)
        {
            throw new InvalidOperationException("Payment gateway settings could not be resolved.");
        }

        if (!settings.IsPlatformAccount)
        {
            return new ResolvedStripeSettings(string.Empty, string.Empty, string.Empty);
        }

        var platformSettings = settings.InvoiceSettings;
        var useProduction = platformSettings?.UseProductionPlatformSettings == true;

        return new ResolvedStripeSettings(
            useProduction
                ? platformSettings?.ProductionStripePublishableKey ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.StripePublishableKey) ? _options.PublishableKey : platformSettings.StripePublishableKey!),
            useProduction
                ? platformSettings?.ProductionStripeSecretKey ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.StripeSecretKey) ? _options.SecretKey : platformSettings.StripeSecretKey!),
            useProduction
                ? platformSettings?.ProductionStripeWebhookSecret ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.StripeWebhookSecret) ? _options.WebhookSecret : platformSettings.StripeWebhookSecret!));
    }

    private static bool IsPaymentSucceeded(Event stripeEvent)
    {
        return stripeEvent.Data.Object switch
        {
            Session session => string.Equals(stripeEvent.Type, "checkout.session.completed", StringComparison.OrdinalIgnoreCase)
                && string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase),
            PaymentIntent paymentIntent => string.Equals(paymentIntent.Status, "succeeded", StringComparison.OrdinalIgnoreCase),
            Charge charge => charge.Paid && string.Equals(charge.Status, "succeeded", StringComparison.OrdinalIgnoreCase),
            _ => false,
        };
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string? value)
    {
        value = null;
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString();
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryGetNestedString(JsonElement element, IReadOnlyList<string> path, out string? value)
    {
        value = null;
        var current = element;
        foreach (var segment in path)
        {
            if (!current.TryGetProperty(segment, out current))
            {
                return false;
            }
        }

        if (current.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = current.GetString();
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool IsCheckoutSessionId(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.StartsWith("cs_", StringComparison.OrdinalIgnoreCase);

    private static long ConvertToSmallestUnit(decimal amount) =>
        (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);

    private static string AppendQueryString(string baseUrl, string querySuffix)
    {
        var separator = baseUrl.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        return $"{baseUrl}{separator}{querySuffix}";
    }

    private sealed record ResolvedStripeSettings(
        string PublishableKey,
        string SecretKey,
        string WebhookSecret);
}
