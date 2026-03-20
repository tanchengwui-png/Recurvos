using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class FeedbackItem : CompanyOwnedEntity
{
    public Guid? SubmittedByUserId { get; set; }
    public string SubmittedByName { get; set; } = string.Empty;
    public string SubmittedByEmail { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? StepsToReproduce { get; set; }
    public string? ExpectedResult { get; set; }
    public string? ActualResult { get; set; }
    public string? PageUrl { get; set; }
    public string? BrowserInfo { get; set; }
    public string? ScreenshotPath { get; set; }
    public string? ScreenshotFileName { get; set; }
    public string? ScreenshotContentType { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? AdminNote { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? LastPlatformResponseAtUtc { get; set; }
    public DateTime? SubscriberLastViewedAtUtc { get; set; }
    public Company? Company { get; set; }
    public User? SubmittedByUser { get; set; }
    public User? ReviewedByUser { get; set; }
}
