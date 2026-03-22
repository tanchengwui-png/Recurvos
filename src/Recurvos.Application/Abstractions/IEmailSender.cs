namespace Recurvos.Application.Abstractions;

public sealed record EmailAttachment(string FileName, byte[] Content, string ContentType);

public interface IEmailSender
{
    Task SendAsync(
        string to,
        string subject,
        string body,
        IReadOnlyCollection<EmailAttachment>? attachments = null,
        IReadOnlyCollection<string>? cc = null,
        CancellationToken cancellationToken = default);
}
