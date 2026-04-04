namespace Recurvos.Application.Abstractions;

public sealed record EmailAttachment(string FileName, byte[] Content, string ContentType);
public sealed record EmailLogContext(
    Guid? CompanyId = null,
    string? NotificationType = null,
    Guid? InvoiceId = null,
    string? InvoiceNumber = null,
    string? CustomerName = null);

public interface IEmailSender
{
    Task SendAsync(
        string to,
        string subject,
        string body,
        IReadOnlyCollection<EmailAttachment>? attachments = null,
        IReadOnlyCollection<string>? cc = null,
        EmailLogContext? logContext = null,
        CancellationToken cancellationToken = default);
}
