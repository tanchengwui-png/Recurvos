namespace Recurvos.Application.Abstractions;

public sealed record WhatsAppDispatchRequest(
    string ApiUrl,
    string AccessToken,
    string SenderId,
    string RecipientPhoneNumber,
    string Message,
    string? Template,
    string Reference);

public sealed record WhatsAppDispatchResult(bool Success, string? ExternalMessageId, string? ErrorMessage);

public interface IWhatsAppSender
{
    Task<WhatsAppDispatchResult> SendAsync(WhatsAppDispatchRequest request, CancellationToken cancellationToken = default);
}
