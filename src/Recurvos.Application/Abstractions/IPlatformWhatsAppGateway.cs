namespace Recurvos.Application.Abstractions;

public sealed record PlatformWhatsAppConfiguration(
    bool IsEnabled,
    string Provider,
    string? ApiUrl,
    string? AccessToken,
    string? SenderId,
    string? Template,
    string? SessionStatus,
    string? SessionPhone,
    DateTime? SessionLastSyncedAtUtc);

public sealed record PlatformWhatsAppSessionSnapshot(
    string Status,
    string? ConnectedPhone,
    DateTime? LastSyncedAtUtc,
    string? QrCodeDataUrl,
    string? LastError,
    bool IsReady);

public interface IPlatformWhatsAppGateway
{
    Task<PlatformWhatsAppSessionSnapshot> GetSessionAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSessionSnapshot> ConnectAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSessionSnapshot> DisconnectAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, CancellationToken cancellationToken = default);
    Task<WhatsAppDispatchResult> SendAsync(Guid platformCompanyId, PlatformWhatsAppConfiguration configuration, string recipientPhoneNumber, string message, string? template, string reference, CancellationToken cancellationToken = default);
}
