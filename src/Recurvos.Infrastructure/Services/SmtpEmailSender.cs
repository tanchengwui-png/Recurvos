using System.Net.Sockets;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MimeKit;
using Recurvos.Application.Abstractions;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class SmtpEmailSender(
    IOptions<SmtpOptions> options,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment,
    AppDbContext dbContext) : IEmailSender
{
    private readonly SmtpOptions _options = options.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;
    private readonly AppDbContext _dbContext = dbContext;

    public async Task SendAsync(string to, string subject, string body, IReadOnlyCollection<EmailAttachment>? attachments = null, CancellationToken cancellationToken = default)
    {
        var smtpConfig = await ResolveSmtpConfigurationAsync(cancellationToken);
        var wasRedirected = smtpConfig.EmailShieldEnabled && !string.IsNullOrWhiteSpace(smtpConfig.EmailShieldAddress);
        var effectiveTo = smtpConfig.EmailShieldEnabled && !string.IsNullOrWhiteSpace(smtpConfig.EmailShieldAddress)
            ? smtpConfig.EmailShieldAddress
            : to;
        var effectiveSubject = smtpConfig.EmailShieldEnabled && !string.IsNullOrWhiteSpace(smtpConfig.EmailShieldAddress)
            ? $"[Email shield -> {to}] {subject}"
            : subject;
        var effectiveBody = smtpConfig.EmailShieldEnabled && !string.IsNullOrWhiteSpace(smtpConfig.EmailShieldAddress)
            ? $"""
               <p style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#b45309;margin:0 0 16px;">
                 Email shield is enabled. This message was redirected from <strong>{System.Net.WebUtility.HtmlEncode(to)}</strong> to <strong>{System.Net.WebUtility.HtmlEncode(smtpConfig.EmailShieldAddress)}</strong>.
               </p>
               {body}
               """
            : body;

        var fromAddress = ParseMailboxOrThrow(smtpConfig.FromEmail, "Platform SMTP From email");
        var toAddress = ParseMailboxOrThrow(effectiveTo, wasRedirected ? "Shield email address" : "Recipient email");

        if (smtpConfig.LocalEmailCaptureEnabled)
        {
            await SaveToLocalFileAsync(effectiveTo, effectiveSubject, effectiveBody, attachments, cancellationToken);
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "LocalFolder", wasRedirected, wasRedirected ? "Email shield" : "Forced local capture", true, null, cancellationToken);
            return;
        }

        if (!smtpConfig.HasPlatformSmtpConfiguration && _environment.IsDevelopment())
        {
            await SaveToLocalFileAsync(effectiveTo, effectiveSubject, effectiveBody, attachments, cancellationToken);
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "LocalFolder", wasRedirected, wasRedirected ? "Email shield" : "Development fallback", true, null, cancellationToken);
            return;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(smtpConfig.FromName, fromAddress.Address));
        message.To.Add(toAddress);
        message.Subject = effectiveSubject;

        var builder = new BodyBuilder
        {
            HtmlBody = effectiveBody,
        };

        if (attachments is not null)
        {
            foreach (var attachment in attachments)
            {
                builder.Attachments.Add(attachment.FileName, attachment.Content, ContentType.Parse(attachment.ContentType));
            }
        }

        message.Body = builder.ToMessageBody();

        try
        {
            using var client = new SmtpClient();
            await client.ConnectAsync(smtpConfig.Host, smtpConfig.Port, smtpConfig.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable, cancellationToken);
            if (!string.IsNullOrWhiteSpace(smtpConfig.Username))
            {
                await client.AuthenticateAsync(smtpConfig.Username, smtpConfig.Password, cancellationToken);
            }

            await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(true, cancellationToken);
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "Smtp", wasRedirected, wasRedirected ? "Email shield" : null, true, null, cancellationToken);
        }
        catch (SocketException)
        {
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "Smtp", wasRedirected, wasRedirected ? "Email shield" : null, false, $"SMTP server is not reachable at {smtpConfig.Host}:{smtpConfig.Port}.", cancellationToken);
            throw new InvalidOperationException($"SMTP server is not reachable at {smtpConfig.Host}:{smtpConfig.Port}. Start a local SMTP server or update the SMTP settings.");
        }
        catch (SmtpCommandException exception)
        {
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "Smtp", wasRedirected, wasRedirected ? "Email shield" : null, false, exception.Message, cancellationToken);
            throw new InvalidOperationException($"Unable to send email via SMTP: {exception.Message}");
        }
        catch (SmtpProtocolException exception)
        {
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "Smtp", wasRedirected, wasRedirected ? "Email shield" : null, false, exception.Message, cancellationToken);
            throw new InvalidOperationException($"SMTP server returned an invalid response: {exception.Message}");
        }
        catch (Exception exception)
        {
            await TryWriteEmailLogAsync(smtpConfig.CompanyId, to, effectiveTo, effectiveSubject, "Smtp", wasRedirected, wasRedirected ? "Email shield" : null, false, exception.Message, cancellationToken);
            throw new InvalidOperationException($"Unable to send email via SMTP: {exception.Message}");
        }
    }

    private async Task<ResolvedSmtpConfiguration> ResolveSmtpConfigurationAsync(CancellationToken cancellationToken)
    {
        var platformSettings = await _dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        var useProduction = platformSettings?.UseProductionPlatformSettings == true;
        var host = useProduction ? platformSettings?.ProductionSmtpHost : platformSettings?.SmtpHost;
        var port = useProduction ? platformSettings?.ProductionSmtpPort : platformSettings?.SmtpPort;
        var username = useProduction ? platformSettings?.ProductionSmtpUsername : platformSettings?.SmtpUsername;
        var password = useProduction ? platformSettings?.ProductionSmtpPassword : platformSettings?.SmtpPassword;
        var fromEmail = useProduction ? platformSettings?.ProductionSmtpFromEmail : platformSettings?.SmtpFromEmail;
        var fromName = useProduction ? platformSettings?.ProductionSmtpFromName : platformSettings?.SmtpFromName;
        var useSsl = useProduction ? platformSettings?.ProductionSmtpUseSsl : platformSettings?.SmtpUseSsl;
        var localCapture = useProduction ? platformSettings?.ProductionLocalEmailCaptureEnabled ?? false : platformSettings?.LocalEmailCaptureEnabled ?? false;
        var emailShieldEnabled = useProduction ? platformSettings?.ProductionEmailShieldEnabled ?? false : platformSettings?.EmailShieldEnabled ?? false;
        var emailShieldAddress = useProduction ? platformSettings?.ProductionEmailShieldAddress : platformSettings?.EmailShieldAddress;

        return new ResolvedSmtpConfiguration(
            platformSettings?.CompanyId ?? Guid.Empty,
            host ?? _options.Host,
            port ?? _options.Port,
            username ?? _options.Username,
            password ?? _options.Password,
            fromEmail ?? _options.FromEmail,
            fromName ?? _options.FromName,
            useSsl ?? _options.UseSsl,
            !string.IsNullOrWhiteSpace(host)
            && port.HasValue == true
            && !string.IsNullOrWhiteSpace(fromEmail),
            localCapture,
            emailShieldEnabled,
            emailShieldAddress);
    }

    private async Task WriteEmailLogAsync(
        Guid companyId,
        string originalRecipient,
        string effectiveRecipient,
        string subject,
        string deliveryMode,
        bool wasRedirected,
        string? redirectReason,
        bool succeeded,
        string? errorMessage,
        CancellationToken cancellationToken)
    {
        if (companyId == Guid.Empty)
        {
            return;
        }

        _dbContext.EmailDispatchLogs.Add(new Domain.Entities.EmailDispatchLog
        {
            CompanyId = companyId,
            OriginalRecipient = originalRecipient,
            EffectiveRecipient = effectiveRecipient,
            Subject = subject,
            DeliveryMode = deliveryMode,
            WasRedirected = wasRedirected,
            RedirectReason = redirectReason,
            Succeeded = succeeded,
            ErrorMessage = string.IsNullOrWhiteSpace(errorMessage) ? null : errorMessage
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task TryWriteEmailLogAsync(
        Guid companyId,
        string originalRecipient,
        string effectiveRecipient,
        string subject,
        string deliveryMode,
        bool wasRedirected,
        string? redirectReason,
        bool succeeded,
        string? errorMessage,
        CancellationToken cancellationToken)
    {
        try
        {
            await WriteEmailLogAsync(companyId, originalRecipient, effectiveRecipient, subject, deliveryMode, wasRedirected, redirectReason, succeeded, errorMessage, cancellationToken);
        }
        catch
        {
            // Email logging must never break the primary email flow.
        }
    }

    private async Task SaveToLocalFileAsync(string to, string subject, string body, IReadOnlyCollection<EmailAttachment>? attachments, CancellationToken cancellationToken)
    {
        var invoiceRoot = StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory);
        var storageRoot = Directory.GetParent(invoiceRoot)?.FullName ?? Path.Combine(_environment.ContentRootPath, "storage");
        var directory = Path.Combine(storageRoot, "emails");
        Directory.CreateDirectory(directory);

        var safeSubject = string.Concat(subject.Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '-' : ch));
        var filePath = Path.Combine(directory, $"{DateTime.UtcNow:yyyyMMdd-HHmmssfff}-{safeSubject}.html");
        if (attachments is not null)
        {
            foreach (var attachment in attachments)
            {
                var attachmentPath = Path.Combine(directory, $"{DateTime.UtcNow:yyyyMMdd-HHmmssfff}-{attachment.FileName}");
                await File.WriteAllBytesAsync(attachmentPath, attachment.Content, cancellationToken);
            }
        }

        var content = $"""
                       <html>
                       <body>
                       <p><strong>To:</strong> {System.Net.WebUtility.HtmlEncode(to)}</p>
                       <p><strong>Subject:</strong> {System.Net.WebUtility.HtmlEncode(subject)}</p>
                       <p><strong>Attachments:</strong> {System.Net.WebUtility.HtmlEncode(attachments is null || attachments.Count == 0 ? "None" : string.Join(", ", attachments.Select(x => x.FileName)))}</p>
                       <hr />
                       {body}
                       </body>
                       </html>
                       """;
        await File.WriteAllTextAsync(filePath, content, cancellationToken);
    }

    private sealed record ResolvedSmtpConfiguration(
        Guid CompanyId,
        string Host,
        int Port,
        string Username,
        string Password,
        string FromEmail,
        string FromName,
        bool UseSsl,
        bool HasPlatformSmtpConfiguration,
        bool LocalEmailCaptureEnabled,
        bool EmailShieldEnabled,
        string? EmailShieldAddress);

    private static MailboxAddress ParseMailboxOrThrow(string? value, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"{fieldName} is required.");
        }

        try
        {
            return MailboxAddress.Parse(value.Trim());
        }
        catch (ParseException)
        {
            throw new InvalidOperationException($"{fieldName} is not a valid email address.");
        }
        catch (FormatException)
        {
            throw new InvalidOperationException($"{fieldName} is not a valid email address.");
        }
    }
}
