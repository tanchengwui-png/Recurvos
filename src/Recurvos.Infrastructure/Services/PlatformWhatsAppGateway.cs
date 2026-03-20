using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Infrastructure.Configuration;

namespace Recurvos.Infrastructure.Services;

public sealed class PlatformWhatsAppGateway(
    HttpClient httpClient,
    IWhatsAppSender genericSender,
    IOptions<WhatsAppWebJsOptions> options) : IPlatformWhatsAppGateway
{
    private readonly WhatsAppWebJsOptions _options = options.Value;

    public async Task<PlatformWhatsAppSessionSnapshot> GetSessionAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, CancellationToken cancellationToken = default)
    {
        var provider = NormalizeProvider(configuration.Provider);
        return provider switch
        {
            "whatsapp_web_js" => await GetWebJsSessionAsync(platformCompanyId, cancellationToken),
            _ => BuildGenericSnapshot(configuration),
        };
    }

    public async Task<PlatformWhatsAppSessionSnapshot> ConnectAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, CancellationToken cancellationToken = default)
    {
        var provider = NormalizeProvider(configuration.Provider);
        if (provider != "whatsapp_web_js")
        {
            return BuildGenericSnapshot(configuration);
        }

        return await SendSessionCommandAsync(platformCompanyId, "connect", cancellationToken);
    }

    public async Task<PlatformWhatsAppSessionSnapshot> DisconnectAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, CancellationToken cancellationToken = default)
    {
        var provider = NormalizeProvider(configuration.Provider);
        if (provider != "whatsapp_web_js")
        {
            return new PlatformWhatsAppSessionSnapshot("not_connected", null, DateTime.UtcNow, null, null, false);
        }

        return await SendSessionCommandAsync(platformCompanyId, "disconnect", cancellationToken);
    }

    public async Task<WhatsAppDispatchResult> SendAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, string recipientPhoneNumber, string message, string? template, string reference, CancellationToken cancellationToken = default)
    {
        var provider = NormalizeProvider(configuration.Provider);

        if (!configuration.IsEnabled)
        {
            return new WhatsAppDispatchResult(false, null, "Platform WhatsApp is disabled.");
        }

        return provider switch
        {
            "whatsapp_web_js" => await SendViaWebJsAsync(platformCompanyId, recipientPhoneNumber, message, reference, cancellationToken),
            _ => await SendViaGenericApiAsync(configuration, recipientPhoneNumber, message, template, reference, cancellationToken),
        };
    }

    private async Task<WhatsAppDispatchResult> SendViaGenericApiAsync(PlatformWhatsAppConfiguration configuration, string recipientPhoneNumber, string message, string? template, string reference, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(configuration.ApiUrl) || string.IsNullOrWhiteSpace(configuration.AccessToken) || string.IsNullOrWhiteSpace(configuration.SenderId))
        {
            return new WhatsAppDispatchResult(false, null, "Generic WhatsApp API is not fully configured.");
        }

        return await genericSender.SendAsync(
            new WhatsAppDispatchRequest(
                configuration.ApiUrl,
                configuration.AccessToken,
                configuration.SenderId,
                recipientPhoneNumber,
                message,
                template,
                reference),
            cancellationToken);
    }

    private async Task<WhatsAppDispatchResult> SendViaWebJsAsync(Guid platformCompanyId, string recipientPhoneNumber, string message, string reference, CancellationToken cancellationToken)
    {
        EnsureWorkerConfigured();

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildWorkerUrl("/messages/send"))
        {
            Content = JsonContent.Create(new
            {
                tenantId = platformCompanyId.ToString("N"),
                to = recipientPhoneNumber,
                message,
                reference,
            }),
        };

        AddWorkerAuth(request);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new WhatsAppDispatchResult(false, null, string.IsNullOrWhiteSpace(payload) ? $"Worker HTTP {(int)response.StatusCode}" : payload);
        }

        var result = await response.Content.ReadFromJsonAsync<WorkerSendResponse>(cancellationToken: cancellationToken);
        if (result is null)
        {
            return new WhatsAppDispatchResult(false, null, "WhatsApp worker returned an empty response.");
        }

        return new WhatsAppDispatchResult(result.Success, result.ExternalMessageId, result.Message);
    }

    private async Task<PlatformWhatsAppSessionSnapshot> GetWebJsSessionAsync(Guid platformCompanyId, CancellationToken cancellationToken)
    {
        EnsureWorkerConfigured();

        using var request = new HttpRequestMessage(HttpMethod.Get, BuildWorkerUrl($"/sessions/{platformCompanyId:N}/status"));
        AddWorkerAuth(request);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new PlatformWhatsAppSessionSnapshot("error", null, DateTime.UtcNow, null, string.IsNullOrWhiteSpace(payload) ? $"Worker HTTP {(int)response.StatusCode}" : payload, false);
        }

        var result = await response.Content.ReadFromJsonAsync<WorkerSessionResponse>(cancellationToken: cancellationToken);
        return MapSession(result);
    }

    private async Task<PlatformWhatsAppSessionSnapshot> SendSessionCommandAsync(Guid platformCompanyId, string command, CancellationToken cancellationToken)
    {
        EnsureWorkerConfigured();

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildWorkerUrl($"/sessions/{platformCompanyId:N}/{command}"))
        {
            Content = JsonContent.Create(new { }),
        };
        AddWorkerAuth(request);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new PlatformWhatsAppSessionSnapshot("error", null, DateTime.UtcNow, null, string.IsNullOrWhiteSpace(payload) ? $"Worker HTTP {(int)response.StatusCode}" : payload, false);
        }

        var result = await response.Content.ReadFromJsonAsync<WorkerSessionResponse>(cancellationToken: cancellationToken);
        return MapSession(result);
    }

    private void AddWorkerAuth(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(_options.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.AccessToken);
        }
    }

    private string BuildWorkerUrl(string path)
    {
        var baseUrl = _options.BaseUrl.TrimEnd('/');
        return $"{baseUrl}{path}";
    }

    private void EnsureWorkerConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            throw new InvalidOperationException("WhatsApp Web worker URL is not configured.");
        }
    }

    private static PlatformWhatsAppSessionSnapshot BuildGenericSnapshot(PlatformWhatsAppConfiguration configuration)
    {
        var ready = configuration.IsEnabled
            && !string.IsNullOrWhiteSpace(configuration.ApiUrl)
            && !string.IsNullOrWhiteSpace(configuration.AccessToken)
            && !string.IsNullOrWhiteSpace(configuration.SenderId);

        return new PlatformWhatsAppSessionSnapshot(
            ready ? "connected" : "not_ready",
            configuration.SenderId,
            configuration.SessionLastSyncedAtUtc ?? DateTime.UtcNow,
            null,
            ready ? null : "Generic WhatsApp API is not fully configured.",
            ready);
    }

    private static PlatformWhatsAppSessionSnapshot MapSession(WorkerSessionResponse? response)
    {
        if (response is null)
        {
            return new PlatformWhatsAppSessionSnapshot("error", null, DateTime.UtcNow, null, "WhatsApp worker returned no session payload.", false);
        }

        return new PlatformWhatsAppSessionSnapshot(
            string.IsNullOrWhiteSpace(response.Status) ? "not_connected" : response.Status.Trim().ToLowerInvariant(),
            response.PhoneNumber,
            response.LastSyncedAtUtc ?? DateTime.UtcNow,
            response.QrCodeDataUrl,
            response.LastError,
            response.IsReady);
    }

    private static string NormalizeProvider(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "whatsapp_web_js" => "whatsapp_web_js",
            _ => "generic_api",
        };
    }

    private sealed record WorkerSessionResponse(
        string Status,
        string? PhoneNumber,
        DateTime? LastSyncedAtUtc,
        string? QrCodeDataUrl,
        string? LastError,
        bool IsReady);

    private sealed record WorkerSendResponse(
        bool Success,
        string? ExternalMessageId,
        string? Message);
}
