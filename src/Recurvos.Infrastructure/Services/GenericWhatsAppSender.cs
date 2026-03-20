using System.Net.Http.Headers;
using System.Net.Http.Json;
using Recurvos.Application.Abstractions;

namespace Recurvos.Infrastructure.Services;

public sealed class GenericWhatsAppSender(HttpClient httpClient) : IWhatsAppSender
{
    public async Task<WhatsAppDispatchResult> SendAsync(WhatsAppDispatchRequest request, CancellationToken cancellationToken = default)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, request.ApiUrl)
        {
            Content = JsonContent.Create(new
            {
                senderId = request.SenderId,
                to = request.RecipientPhoneNumber,
                template = request.Template,
                message = request.Message,
                reference = request.Reference,
            })
        };

        if (!string.IsNullOrWhiteSpace(request.AccessToken))
        {
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", request.AccessToken);
        }

        using var response = await httpClient.SendAsync(message, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new WhatsAppDispatchResult(false, null, string.IsNullOrWhiteSpace(responseBody) ? $"HTTP {(int)response.StatusCode}" : responseBody);
        }

        return new WhatsAppDispatchResult(true, ExtractExternalMessageId(responseBody), null);
    }

    private static string? ExtractExternalMessageId(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return null;
        }

        var trimmed = responseBody.Trim();
        return trimmed.Length <= 200 ? trimmed : trimmed[..200];
    }
}
