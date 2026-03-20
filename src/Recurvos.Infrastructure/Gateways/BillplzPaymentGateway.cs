using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Payments;
using Recurvos.Application.Webhooks;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Gateways;

public sealed class BillplzPaymentGateway(HttpClient httpClient, AppDbContext dbContext, IOptions<BillplzOptions> options) : IPaymentGateway
{
    private readonly BillplzOptions _options = options.Value;
    public string Name => "Billplz";

    public async Task<PaymentLinkResult> CreatePaymentLinkAsync(CreatePaymentLinkCommand command, CancellationToken cancellationToken = default)
    {
        var configurationCompanyId = command.GatewayConfigurationCompanyId == Guid.Empty ? command.CompanyId : command.GatewayConfigurationCompanyId;
        var settings = await ResolveSettingsAsync(configurationCompanyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.ApiKey) || string.IsNullOrWhiteSpace(settings.CollectionId))
        {
            throw new InvalidOperationException("Billplz is not configured. Set Billplz ApiKey and CollectionId.");
        }

        var form = new List<KeyValuePair<string, string>>
        {
            new("collection_id", settings.CollectionId),
            new("email", command.CustomerEmail),
            new("name", command.CustomerName),
            new("amount", ConvertToSen(command.Amount).ToString()),
            new("description", string.IsNullOrWhiteSpace(command.Description) ? $"Invoice {command.InvoiceNumber}" : command.Description),
            new("callback_url", command.CallbackUrl),
            new("reference_1_label", "Invoice"),
            new("reference_1", command.InvoiceNumber)
        };

        if (!string.IsNullOrWhiteSpace(command.CustomerMobile))
        {
            form.Add(new("mobile", command.CustomerMobile));
        }

        if (!string.IsNullOrWhiteSpace(command.RedirectUrl))
        {
            form.Add(new("redirect_url", command.RedirectUrl));
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{settings.BaseUrl.TrimEnd('/')}/api/v3/bills");
        request.Headers.Authorization = CreateBasicAuthHeader(settings.ApiKey);
        request.Content = new FormUrlEncodedContent(form);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        var rawResponse = await response.Content.ReadAsStringAsync(cancellationToken);
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(rawResponse);
        var id = document.RootElement.GetProperty("id").GetString() ?? throw new InvalidOperationException("Billplz response missing id.");
        var url = document.RootElement.GetProperty("url").GetString() ?? throw new InvalidOperationException("Billplz response missing url.");
        return new PaymentLinkResult(id, url, rawResponse);
    }

    public string? ExtractExternalPaymentId(string payload, IDictionary<string, string> headers)
    {
        var values = ParseFormPayload(payload);
        return GetValue(values, "id");
    }

    public Task<WebhookParseResult> ParseWebhookAsync(string payload, IDictionary<string, string> headers, Guid companyId, CancellationToken cancellationToken = default)
    {
        var values = ParseFormPayload(payload);
        return ParseWebhookInternalAsync(values, payload, companyId, cancellationToken);
    }

    public async Task<WebhookParseResult> VerifyPaymentAsync(string externalPaymentId, Guid companyId, CancellationToken cancellationToken = default)
    {
        var settings = await ResolveSettingsAsync(companyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            throw new InvalidOperationException("Billplz API key is required for payment verification.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{settings.BaseUrl.TrimEnd('/')}/api/v3/bills/{externalPaymentId}");
        request.Headers.Authorization = CreateBasicAuthHeader(settings.ApiKey);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        var rawResponse = await response.Content.ReadAsStringAsync(cancellationToken);
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(rawResponse);
        var paid = document.RootElement.TryGetProperty("paid", out var paidElement) && paidElement.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => string.Equals(paidElement.GetString(), "true", StringComparison.OrdinalIgnoreCase) ||
                                    string.Equals(paidElement.GetString(), "1", StringComparison.OrdinalIgnoreCase),
            JsonValueKind.Number => paidElement.TryGetInt32(out var intValue) && intValue == 1,
            _ => false
        };
        var paidAt = document.RootElement.TryGetProperty("paid_at", out var paidAtElement) ? paidAtElement.GetString() : null;
        var eventId = $"verify:{externalPaymentId}:{paidAt ?? "na"}:{(paid ? "paid" : "failed")}";
        return new WebhookParseResult(eventId, paid ? "payment.succeeded" : "payment.failed", externalPaymentId, paid, rawResponse);
    }

    private async Task<WebhookParseResult> ParseWebhookInternalAsync(Dictionary<string, string> values, string payload, Guid companyId, CancellationToken cancellationToken)
    {
        await VerifySignatureAsync(values, companyId, cancellationToken);

        var paymentId = GetRequiredValue(values, "id");
        var paid = ParsePaid(values);
        var eventId = values.TryGetValue("x_signature", out var signature) && !string.IsNullOrWhiteSpace(signature)
            ? signature
            : $"{paymentId}:{GetValue(values, "paid_at") ?? GetValue(values, "updated_at") ?? "na"}:{(paid ? "paid" : "failed")}";

        return new WebhookParseResult(eventId, paid ? "payment.succeeded" : "payment.failed", paymentId, paid, payload);
    }

    private async Task VerifySignatureAsync(IReadOnlyDictionary<string, string> values, Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await ResolveSettingsAsync(companyId, cancellationToken);

        if (!settings.RequireSignatureVerification && string.IsNullOrWhiteSpace(settings.XSignatureKey))
        {
            return;
        }

        var provided = GetValue(values, "x_signature");
        if (string.IsNullOrWhiteSpace(provided))
        {
            throw new InvalidOperationException("Billplz webhook missing x_signature.");
        }

        if (string.IsNullOrWhiteSpace(settings.XSignatureKey))
        {
            throw new InvalidOperationException("Billplz XSignatureKey is required for webhook verification.");
        }

        var payloadToSign = string.Join("|", values
            .Where(x => !IsSignatureKey(x.Key))
            .OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => $"{NormalizeKeyForSignature(x.Key)}{x.Value}"));

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(settings.XSignatureKey));
        var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadToSign))).ToLowerInvariant();

        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(provided)))
        {
            throw new InvalidOperationException("Invalid Billplz webhook signature.");
        }
    }

    private static Dictionary<string, string> ParseFormPayload(string payload)
    {
        var parsed = QueryHelpers.ParseQuery(payload);
        return parsed.ToDictionary(x => x.Key, x => x.Value.ToString(), StringComparer.Ordinal);
    }

    private static AuthenticationHeaderValue CreateBasicAuthHeader(string apiKey)
    {
        var token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{apiKey}:"));
        return new AuthenticationHeaderValue("Basic", token);
    }

    private static long ConvertToSen(decimal amount) => (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);

    private static bool ParsePaid(IReadOnlyDictionary<string, string> values)
    {
        var value = GetValue(values, "paid");
        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(value, "1", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetRequiredValue(IReadOnlyDictionary<string, string> values, string key) =>
        GetValue(values, key) ?? throw new InvalidOperationException($"Billplz webhook missing {key}.");

    private static string? GetValue(IReadOnlyDictionary<string, string> values, string key)
    {
        if (values.TryGetValue(key, out var value))
        {
            return value;
        }

        var wrappedKey = $"billplz[{key}]";
        return values.TryGetValue(wrappedKey, out value) ? value : null;
    }

    private static bool IsSignatureKey(string key) =>
        string.Equals(key, "x_signature", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(key, "billplz[x_signature]", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeKeyForSignature(string key) =>
        key.Replace("[", string.Empty, StringComparison.Ordinal)
            .Replace("]", string.Empty, StringComparison.Ordinal);

    private async Task<ResolvedBillplzSettings> ResolveSettingsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => new
            {
                x.IsPlatformAccount,
                x.InvoiceSettings
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (settings is null)
        {
            throw new InvalidOperationException("Payment gateway settings could not be resolved.");
        }

        if (!settings.IsPlatformAccount
            && settings.InvoiceSettings is not null
            && string.Equals(settings.InvoiceSettings.PaymentGatewayProvider, "billplz", StringComparison.OrdinalIgnoreCase))
        {
            return new ResolvedBillplzSettings(
                settings.InvoiceSettings.SubscriberBillplzApiKey ?? string.Empty,
                settings.InvoiceSettings.SubscriberBillplzCollectionId ?? string.Empty,
                settings.InvoiceSettings.SubscriberBillplzXSignatureKey ?? string.Empty,
                string.IsNullOrWhiteSpace(settings.InvoiceSettings.SubscriberBillplzBaseUrl) ? BillplzOptions.SandboxBaseUrl : settings.InvoiceSettings.SubscriberBillplzBaseUrl!,
                settings.InvoiceSettings.SubscriberBillplzRequireSignatureVerification ?? true);
        }

        if (!settings.IsPlatformAccount)
        {
            return new ResolvedBillplzSettings(string.Empty, string.Empty, string.Empty, BillplzOptions.SandboxBaseUrl, true);
        }

        var platformSettings = settings.IsPlatformAccount
            ? settings.InvoiceSettings
            : await dbContext.Companies
                .Where(x => x.IsPlatformAccount)
                .Select(x => x.InvoiceSettings)
                .FirstOrDefaultAsync(cancellationToken);

        var useProduction = platformSettings?.UseProductionPlatformSettings == true;

        return new ResolvedBillplzSettings(
            useProduction
                ? platformSettings?.ProductionBillplzApiKey ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.BillplzApiKey) ? _options.ApiKey : platformSettings.BillplzApiKey!),
            useProduction
                ? platformSettings?.ProductionBillplzCollectionId ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.BillplzCollectionId) ? _options.CollectionId : platformSettings.BillplzCollectionId!),
            useProduction
                ? platformSettings?.ProductionBillplzXSignatureKey ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.BillplzXSignatureKey) ? _options.XSignatureKey : platformSettings.BillplzXSignatureKey!),
            useProduction
                ? platformSettings?.ProductionBillplzBaseUrl ?? string.Empty
                : (string.IsNullOrWhiteSpace(platformSettings?.BillplzBaseUrl) ? _options.BaseUrl : platformSettings.BillplzBaseUrl!),
            useProduction
                ? platformSettings?.ProductionBillplzRequireSignatureVerification ?? true
                : platformSettings?.BillplzRequireSignatureVerification ?? _options.RequireSignatureVerification);
    }

    private sealed record ResolvedBillplzSettings(
        string ApiKey,
        string CollectionId,
        string XSignatureKey,
        string BaseUrl,
        bool RequireSignatureVerification);
}
