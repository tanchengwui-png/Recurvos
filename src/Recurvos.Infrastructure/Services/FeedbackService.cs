using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Feedback;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Templates;

namespace Recurvos.Infrastructure.Services;

public sealed class FeedbackService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IEmailSender emailSender,
    IOptions<AppUrlOptions> appUrlOptions) : IFeedbackService
{
    private static readonly HashSet<string> AllowedCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "Bug",
        "FeatureRequest",
        "BillingIssue",
        "GeneralFeedback",
    };

    private static readonly HashSet<string> AllowedPriorities = new(StringComparer.OrdinalIgnoreCase)
    {
        "Low",
        "Normal",
        "Urgent",
    };

    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "New",
        "InReview",
        "Planned",
        "Resolved",
        "Closed",
    };

    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;

    public async Task<IReadOnlyCollection<FeedbackItemDto>> GetOwnedAsync(Guid? companyId, CancellationToken cancellationToken = default)
    {
        var accessibleCompanyIds = await GetAccessibleCompanyIdsAsync(cancellationToken);

        var query = dbContext.FeedbackItems
            .Include(x => x.Company)
            .Where(x => accessibleCompanyIds.Contains(x.CompanyId));

        if (companyId.HasValue)
        {
            query = query.Where(x => x.CompanyId == companyId.Value);
        }

        var items = await query
            .OrderByDescending(x => x.LastPlatformResponseAtUtc ?? x.CreatedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return items.Select(Map).ToList();
    }

    public async Task<FeedbackNotificationSummaryDto> GetOwnedNotificationSummaryAsync(CancellationToken cancellationToken = default)
    {
        var accessibleCompanyIds = await GetAccessibleCompanyIdsAsync(cancellationToken);
        var unreadReplies = await dbContext.FeedbackItems.CountAsync(
            x => accessibleCompanyIds.Contains(x.CompanyId)
                && x.LastPlatformResponseAtUtc.HasValue
                && (!x.SubscriberLastViewedAtUtc.HasValue || x.SubscriberLastViewedAtUtc < x.LastPlatformResponseAtUtc),
            cancellationToken);

        return new FeedbackNotificationSummaryDto(unreadReplies);
    }

    public async Task MarkOwnedRepliesReadAsync(Guid? companyId, CancellationToken cancellationToken = default)
    {
        var accessibleCompanyIds = await GetAccessibleCompanyIdsAsync(cancellationToken);
        var now = DateTime.UtcNow;

        var query = dbContext.FeedbackItems.Where(
            x => accessibleCompanyIds.Contains(x.CompanyId)
                && x.LastPlatformResponseAtUtc.HasValue
                && (!x.SubscriberLastViewedAtUtc.HasValue || x.SubscriberLastViewedAtUtc < x.LastPlatformResponseAtUtc));

        if (companyId.HasValue)
        {
            query = query.Where(x => x.CompanyId == companyId.Value);
        }

        var items = await query.ToListAsync(cancellationToken);
        if (items.Count == 0)
        {
            return;
        }

        foreach (var item in items)
        {
            item.SubscriberLastViewedAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<FeedbackItemDto> CreateAsync(CreateFeedbackRequest request, CancellationToken cancellationToken = default)
    {
        if (currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException("Platform owner accounts cannot submit subscriber feedback.");
        }

        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(
            x => x.Id == request.CompanyId && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken)
            ?? throw new InvalidOperationException("The selected company could not be found.");

        var user = await dbContext.Users.FirstOrDefaultAsync(
            x => x.Id == subscriberId,
            cancellationToken)
            ?? throw new UnauthorizedAccessException();

        var category = NormalizeCategory(request.Category);
        var priority = NormalizePriority(request.Priority);
        var subject = request.Subject.Trim();
        var message = request.Message.Trim();

        if (string.IsNullOrWhiteSpace(subject))
        {
            throw new InvalidOperationException("Subject is required.");
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            throw new InvalidOperationException("Message is required.");
        }

        var item = new FeedbackItem
        {
            CompanyId = company.Id,
            SubmittedByUserId = user.Id,
            SubmittedByName = user.FullName,
            SubmittedByEmail = user.Email,
            Subject = subject,
            Category = category,
            Priority = priority,
            Message = message,
            Status = "New",
            SubscriberLastViewedAtUtc = DateTime.UtcNow,
        };

        dbContext.FeedbackItems.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("feedback.created", nameof(FeedbackItem), item.Id.ToString(), $"{item.Category}:{item.Priority}", cancellationToken);

        item.Company = company;
        await TryNotifyPlatformOwnerAsync(item, cancellationToken);
        return Map(item);
    }

    public async Task<IReadOnlyCollection<FeedbackItemDto>> GetPlatformAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var items = await dbContext.FeedbackItems
            .Include(x => x.Company)
            .OrderBy(x => x.Status == "New" ? 0 : x.Status == "InReview" ? 1 : 2)
            .ThenByDescending(x => x.LastPlatformResponseAtUtc ?? x.CreatedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return items.Select(Map).ToList();
    }

    public async Task<FeedbackItemDto?> UpdatePlatformAsync(Guid id, UpdateFeedbackReviewRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var item = await dbContext.FeedbackItems
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (item is null)
        {
            return null;
        }

        var nextStatus = NormalizeStatus(request.Status);
        var nextAdminNote = string.IsNullOrWhiteSpace(request.AdminNote) ? null : request.AdminNote.Trim();
        var hadMeaningfulChange = !string.Equals(item.Status, nextStatus, StringComparison.Ordinal)
            || !string.Equals(item.AdminNote ?? string.Empty, nextAdminNote ?? string.Empty, StringComparison.Ordinal);

        item.Status = nextStatus;
        item.AdminNote = nextAdminNote;
        item.ReviewedAtUtc = DateTime.UtcNow;
        item.ReviewedByUserId = currentUserService.UserId;

        if (hadMeaningfulChange)
        {
            item.LastPlatformResponseAtUtc = item.ReviewedAtUtc;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("feedback.reviewed", nameof(FeedbackItem), item.Id.ToString(), item.Status, cancellationToken);

        if (hadMeaningfulChange)
        {
            await TryNotifySubscriberAsync(item, cancellationToken);
        }

        return Map(item);
    }

    private void EnsurePlatformOwner()
    {
        if (!currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException();
        }
    }

    private async Task<List<Guid>> GetAccessibleCompanyIdsAsync(CancellationToken cancellationToken)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        return await dbContext.Companies
            .Where(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
    }

    private async Task TryNotifyPlatformOwnerAsync(FeedbackItem item, CancellationToken cancellationToken)
    {
        var recipientEmail = await ResolvePlatformFeedbackRecipientAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(recipientEmail))
        {
            return;
        }
        recipientEmail = recipientEmail.Trim();

        var actionUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/platform/feedback";
        var body = EmailTemplateRenderer.RenderActionEmail(
            "Subscriber feedback",
            $"New feedback from {item.Company?.Name ?? "subscriber"}",
            $"{item.SubmittedByName} submitted feedback for {item.Company?.Name ?? "their company"}. Review it in the platform console and reply when ready.",
            "Open subscriber feedback",
            actionUrl,
            [
                $"Subject: {item.Subject}",
                $"Category: {FormatLabel(item.Category)}",
                $"Priority: {item.Priority}",
                $"Submitted by: {item.SubmittedByEmail}"
            ],
            "This notification was generated by Recurvos feedback management.");

        try
        {
            await emailSender.SendAsync(recipientEmail, $"New subscriber feedback: {item.Subject}", body, cancellationToken: cancellationToken);
        }
        catch (InvalidOperationException)
        {
        }
    }

    private async Task TryNotifySubscriberAsync(FeedbackItem item, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(item.SubmittedByEmail))
        {
            return;
        }

        var actionUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/feedback";
        var intro = string.IsNullOrWhiteSpace(item.AdminNote)
            ? $"There is an update on your feedback \"{item.Subject}\". Open Recurvo to view the latest status."
            : $"There is a new platform reply on your feedback \"{item.Subject}\". Open Recurvo to read the reply and current status.";
        var body = EmailTemplateRenderer.RenderActionEmail(
            "Feedback update",
            $"Update on {item.Subject}",
            intro,
            "View feedback update",
            actionUrl,
            [
                $"Company: {item.Company?.Name ?? "Your company"}",
                $"Current status: {FormatLabel(item.Status)}",
                $"Category: {FormatLabel(item.Category)}"
            ],
            "You are receiving this email because you submitted feedback through Recurvos.");

        try
        {
            await emailSender.SendAsync(item.SubmittedByEmail, $"Feedback update: {item.Subject}", body, cancellationToken: cancellationToken);
        }
        catch (InvalidOperationException)
        {
        }
    }

    private async Task<string?> ResolvePlatformFeedbackRecipientAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings != null ? x.InvoiceSettings.FeedbackNotificationEmail : null)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static string NormalizeCategory(string value)
    {
        var normalized = value.Replace(" ", string.Empty).Trim();
        if (!AllowedCategories.Contains(normalized))
        {
            throw new InvalidOperationException("Feedback category is not valid.");
        }

        return AllowedCategories.First(x => string.Equals(x, normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizePriority(string value)
    {
        var normalized = value.Trim();
        if (!AllowedPriorities.Contains(normalized))
        {
            throw new InvalidOperationException("Feedback priority is not valid.");
        }

        return AllowedPriorities.First(x => string.Equals(x, normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeStatus(string value)
    {
        var normalized = value.Replace(" ", string.Empty).Trim();
        if (!AllowedStatuses.Contains(normalized))
        {
            throw new InvalidOperationException("Feedback status is not valid.");
        }

        return AllowedStatuses.First(x => string.Equals(x, normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static string FormatLabel(string value) =>
        value
            .Replace("FeatureRequest", "Feature request", StringComparison.Ordinal)
            .Replace("BillingIssue", "Billing issue", StringComparison.Ordinal)
            .Replace("GeneralFeedback", "General feedback", StringComparison.Ordinal)
            .Replace("InReview", "In review", StringComparison.Ordinal);

    private static FeedbackItemDto Map(FeedbackItem item) =>
        new(
            item.Id,
            item.CompanyId,
            item.Company?.Name ?? string.Empty,
            item.Subject,
            item.Category,
            item.Priority,
            item.Message,
            item.Status,
            item.AdminNote,
            item.SubmittedByName,
            item.SubmittedByEmail,
            item.CreatedAtUtc,
            item.ReviewedAtUtc,
            item.LastPlatformResponseAtUtc.HasValue
                && (!item.SubscriberLastViewedAtUtc.HasValue || item.SubscriberLastViewedAtUtc < item.LastPlatformResponseAtUtc));
}
