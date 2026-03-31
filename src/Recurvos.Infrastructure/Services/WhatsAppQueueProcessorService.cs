using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Features;
using Recurvos.Application.Invoices;
using Recurvos.Infrastructure.Persistence;
using System.Text.RegularExpressions;

namespace Recurvos.Infrastructure.Services;

public sealed class WhatsAppQueueProcessorService(
    AppDbContext dbContext,
    IPlatformWhatsAppGateway platformWhatsAppGateway,
    IFeatureEntitlementService featureEntitlementService,
    IInvoiceService invoiceService,
    IAuditService auditService)
{
    private const int MaxMessagesPerRun = 12;
    private const int MaxMessagesPerCompanyPerRun = 2;

    public async Task<int> ProcessAsync(CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var platformWhatsAppSettings = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        if (platformWhatsAppSettings is null || !IsPlatformWhatsAppReady(platformWhatsAppSettings))
        {
            return 0;
        }

        if (!IsWithinSendWindow(nowUtc, platformWhatsAppSettings.WhatsAppSendWindowStartHourUtc, platformWhatsAppSettings.WhatsAppSendWindowEndHourUtc))
        {
            var nextWindowStartUtc = GetNextWindowStartUtc(nowUtc, platformWhatsAppSettings.WhatsAppSendWindowStartHourUtc, platformWhatsAppSettings.WhatsAppSendWindowEndHourUtc);
            await dbContext.WhatsAppOutboundQueues
                .Where(x =>
                    (x.Status == QueueStatus.Pending || x.Status == QueueStatus.Deferred)
                    && x.NotBeforeUtc <= nowUtc
                    && (x.NextAttemptAtUtc == null || x.NextAttemptAtUtc <= nowUtc))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.Status, QueueStatus.Deferred)
                    .SetProperty(x => x.NextAttemptAtUtc, nextWindowStartUtc)
                    .SetProperty(x => x.UpdatedAtUtc, nowUtc)
                    .SetProperty(x => x.ErrorMessage, "Queued until the next allowed WhatsApp send window."), cancellationToken);
            return 0;
        }

        var candidateIds = await dbContext.WhatsAppOutboundQueues
            .Where(x =>
                (x.Status == QueueStatus.Pending || x.Status == QueueStatus.Deferred)
                && x.NotBeforeUtc <= nowUtc
                && (x.NextAttemptAtUtc == null || x.NextAttemptAtUtc <= nowUtc))
            .OrderBy(x => x.NextAttemptAtUtc ?? x.NotBeforeUtc)
            .ThenBy(x => x.CreatedAtUtc)
            .Select(x => x.Id)
            .Take(MaxMessagesPerRun * 3)
            .ToListAsync(cancellationToken);

        if (candidateIds.Count == 0)
        {
            return 0;
        }

        var processed = 0;
        var perCompanyCounts = new Dictionary<Guid, int>();
        foreach (var queueId in candidateIds)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var queueItem = await dbContext.WhatsAppOutboundQueues
                .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
                .FirstOrDefaultAsync(x => x.Id == queueId, cancellationToken);

            if (queueItem is null)
            {
                continue;
            }

            if (perCompanyCounts.TryGetValue(queueItem.CompanyId, out var companyCount) && companyCount >= MaxMessagesPerCompanyPerRun)
            {
                continue;
            }

            var claimed = await dbContext.WhatsAppOutboundQueues
                .Where(x => x.Id == queueItem.Id && (x.Status == QueueStatus.Pending || x.Status == QueueStatus.Deferred))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.Status, QueueStatus.Sending)
                    .SetProperty(x => x.AttemptCount, x => x.AttemptCount + 1)
                    .SetProperty(x => x.LastAttemptAtUtc, nowUtc)
                    .SetProperty(x => x.UpdatedAtUtc, nowUtc), cancellationToken);

            if (claimed == 0)
            {
                continue;
            }

            queueItem = await dbContext.WhatsAppOutboundQueues
                .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
                .FirstAsync(x => x.Id == queueId, cancellationToken);

            if (queueItem.Invoice?.Customer is null
                || queueItem.Invoice.Status == Domain.Enums.InvoiceStatus.Voided
                || queueItem.Invoice.AmountDue <= 0
                || string.IsNullOrWhiteSpace(queueItem.RecipientPhoneNumber))
            {
                queueItem.Status = QueueStatus.Cancelled;
                queueItem.ErrorMessage = "Invoice is no longer eligible for WhatsApp reminder delivery.";
                queueItem.UpdatedAtUtc = nowUtc;
                await dbContext.SaveChangesAsync(cancellationToken);
                continue;
            }

            if (!await featureEntitlementService.CompanyHasFeatureAsync(queueItem.CompanyId, PlatformFeatureKeys.WhatsAppNotifications, cancellationToken))
            {
                queueItem.Status = QueueStatus.Cancelled;
                queueItem.ErrorMessage = "WhatsApp notifications are no longer enabled for this company.";
                queueItem.UpdatedAtUtc = nowUtc;
                await dbContext.SaveChangesAsync(cancellationToken);
                continue;
            }

            var subscriberSettings = await dbContext.CompanyInvoiceSettings
                .FirstOrDefaultAsync(x => x.CompanyId == queueItem.CompanyId, cancellationToken);

            if (subscriberSettings?.WhatsAppEnabled != true)
            {
                queueItem.Status = QueueStatus.Deferred;
                queueItem.ErrorMessage = "Subscriber WhatsApp settings are not ready.";
                queueItem.NextAttemptAtUtc = nowUtc.AddMinutes(15);
                queueItem.UpdatedAtUtc = nowUtc;
                await dbContext.SaveChangesAsync(cancellationToken);
                continue;
            }

            var linkOptions = await invoiceService.GetWhatsAppLinkOptionsForCompanyAsync(queueItem.CompanyId, queueItem.InvoiceId, cancellationToken);
            var companyName = await dbContext.Companies
                .Where(x => x.Id == queueItem.CompanyId)
                .Select(x => x.Name)
                .FirstAsync(cancellationToken);
            queueItem.Message = BuildWhatsAppReminderMessage(
                companyName,
                queueItem.Invoice.Customer.Name,
                queueItem.Invoice.InvoiceNumber,
                queueItem.Invoice.AmountDue,
                queueItem.Invoice.Currency,
                queueItem.Invoice.DueDateUtc,
                linkOptions?.ActionLink,
                linkOptions?.PaymentGatewayLink,
                linkOptions?.PaymentConfirmationLink,
                subscriberSettings.WhatsAppTemplate);

            var result = await platformWhatsAppGateway.SendAsync(
                platformWhatsAppSettings.CompanyId,
                new PlatformWhatsAppConfiguration(
                    platformWhatsAppSettings.WhatsAppEnabled,
                    string.IsNullOrWhiteSpace(platformWhatsAppSettings.WhatsAppProvider) ? "generic_api" : platformWhatsAppSettings.WhatsAppProvider,
                    platformWhatsAppSettings.WhatsAppApiUrl,
                    platformWhatsAppSettings.WhatsAppAccessToken,
                    platformWhatsAppSettings.WhatsAppSenderId,
                    platformWhatsAppSettings.WhatsAppTemplate,
                    platformWhatsAppSettings.WhatsAppSessionStatus,
                    platformWhatsAppSettings.WhatsAppSessionPhone,
                    platformWhatsAppSettings.WhatsAppSessionLastSyncedAtUtc),
                queueItem.RecipientPhoneNumber,
                queueItem.Message,
                platformWhatsAppSettings.WhatsAppTemplate,
                queueItem.Reference,
                cancellationToken);

            dbContext.WhatsAppNotifications.Add(new Domain.Entities.WhatsAppNotification
            {
                CompanyId = queueItem.CompanyId,
                InvoiceId = queueItem.InvoiceId,
                ReminderScheduleId = queueItem.ReminderScheduleId,
                RecipientPhoneNumber = queueItem.RecipientPhoneNumber,
                Status = result.Success ? "Sent" : "Failed",
                ExternalMessageId = result.ExternalMessageId,
                ErrorMessage = result.ErrorMessage,
            });

            queueItem.ExternalMessageId = result.ExternalMessageId;
            queueItem.ErrorMessage = result.ErrorMessage;
            queueItem.UpdatedAtUtc = nowUtc;

            if (result.Success)
            {
                queueItem.Status = QueueStatus.Sent;
                queueItem.NextAttemptAtUtc = null;
                perCompanyCounts[queueItem.CompanyId] = companyCount + 1;
                processed++;

                if (queueItem.ReminderScheduleId is null)
                {
                    await auditService.WriteAsync(
                        "invoice.whatsapp-auto-sent",
                        nameof(Domain.Entities.Invoice),
                        queueItem.Invoice.Id.ToString(),
                        queueItem.CompanyId,
                        queueItem.Invoice.InvoiceNumber,
                        cancellationToken);
                }
            }
            else
            {
                queueItem.Status = queueItem.AttemptCount >= 3 ? QueueStatus.Failed : QueueStatus.Deferred;
                queueItem.NextAttemptAtUtc = queueItem.Status == QueueStatus.Deferred
                    ? nowUtc.AddMinutes(Math.Min(60, 5 * (1 << Math.Max(0, queueItem.AttemptCount - 1))))
                    : null;
            }

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return processed;
    }

    private static bool IsPlatformWhatsAppReady(Domain.Entities.CompanyInvoiceSettings settings)
    {
        var provider = string.IsNullOrWhiteSpace(settings.WhatsAppProvider)
            ? "generic_api"
            : settings.WhatsAppProvider.Trim().ToLowerInvariant();

        return provider switch
        {
            "whatsapp_web_js" => settings.WhatsAppEnabled && string.Equals(settings.WhatsAppSessionStatus, "connected", StringComparison.OrdinalIgnoreCase),
            _ => settings.WhatsAppEnabled
                && !string.IsNullOrWhiteSpace(settings.WhatsAppApiUrl)
                && !string.IsNullOrWhiteSpace(settings.WhatsAppAccessToken)
                && !string.IsNullOrWhiteSpace(settings.WhatsAppSenderId),
        };
    }

    private static string BuildWhatsAppReminderMessage(
        string issuerName,
        string customerName,
        string invoiceNumber,
        decimal amountDue,
        string currency,
        DateTime dueDateUtc,
        string? actionLink,
        string? paymentGatewayLink,
        string? paymentConfirmationLink,
        string? customTemplate)
    {
        var amountText = $"{currency} {amountDue:0.00}";
        var template = string.IsNullOrWhiteSpace(customTemplate)
            ? "Hi {CustomerName}, this is a payment reminder for invoice {InvoiceNumber} from {CompanyName}. Amount due: {AmountDue}. Due date: {DueDate}."
            : customTemplate;

        var message = template
            .Replace("{CustomerName}", customerName, StringComparison.Ordinal)
            .Replace("{CompanyName}", issuerName, StringComparison.Ordinal)
            .Replace("{InvoiceNumber}", invoiceNumber, StringComparison.Ordinal)
            .Replace("{AmountDue}", amountText, StringComparison.Ordinal)
            .Replace("{Currency}", currency, StringComparison.Ordinal)
            .Replace("{DueDate}", dueDateUtc.ToString("dd MMM yyyy"), StringComparison.Ordinal)
            .Replace("{ActionLink}", actionLink ?? string.Empty, StringComparison.Ordinal)
            .Replace("{PaymentGatewayLink}", paymentGatewayLink ?? string.Empty, StringComparison.Ordinal)
            .Replace("{PaymentConfirmationLink}", paymentConfirmationLink ?? string.Empty, StringComparison.Ordinal)
            .Replace("{PaymentLink}", actionLink ?? string.Empty, StringComparison.Ordinal);

        if (string.IsNullOrWhiteSpace(actionLink))
        {
            message = Regex.Replace(message, @"(?im)^.*payment\s*\/\s*confirmation link:.*(\r?\n)?", string.Empty);
            message = Regex.Replace(message, @"(?im)^.*payment link:.*(\r?\n)?", string.Empty);
            message = Regex.Replace(message, @"(?im)^.*action link:.*(\r?\n)?", string.Empty);
        }

        if (string.IsNullOrWhiteSpace(paymentGatewayLink))
        {
            message = Regex.Replace(message, @"(?im)^.*payment gateway link:.*(\r?\n)?", string.Empty);
        }

        if (string.IsNullOrWhiteSpace(paymentConfirmationLink))
        {
            message = Regex.Replace(message, @"(?im)^.*payment confirmation link:.*(\r?\n)?", string.Empty);
        }

        return message
            .Replace("\r\n\r\n\r\n", "\r\n\r\n", StringComparison.Ordinal)
            .Replace("\n\n\n", "\n\n", StringComparison.Ordinal)
            .Trim();
    }

    private static bool IsWithinSendWindow(DateTime nowUtc, int startHourUtc, int endHourUtc)
    {
        var start = NormalizeHour(startHourUtc);
        var end = NormalizeHour(endHourUtc);
        if (start == end)
        {
            return true;
        }

        var hour = nowUtc.Hour;
        return start < end
            ? hour >= start && hour < end
            : hour >= start || hour < end;
    }

    private static DateTime GetNextWindowStartUtc(DateTime nowUtc, int startHourUtc, int endHourUtc)
    {
        var start = NormalizeHour(startHourUtc);
        if (start == NormalizeHour(endHourUtc))
        {
            return nowUtc;
        }

        var next = new DateTime(nowUtc.Year, nowUtc.Month, nowUtc.Day, start, 0, 0, DateTimeKind.Utc);
        if (nowUtc.Hour >= start)
        {
            next = next.AddDays(1);
        }

        if (nowUtc.Hour < start)
        {
            return next;
        }

        return next;
    }

    private static int NormalizeHour(int value) => Math.Clamp(value, 0, 23);

    private static class QueueStatus
    {
        public const string Pending = "Pending";
        public const string Sending = "Sending";
        public const string Sent = "Sent";
        public const string Failed = "Failed";
        public const string Deferred = "Deferred";
        public const string Cancelled = "Cancelled";
    }
}
