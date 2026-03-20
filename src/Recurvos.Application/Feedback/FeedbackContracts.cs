using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Feedback;

public sealed class CreateFeedbackRequest
{
    [Required]
    public Guid CompanyId { get; set; }

    [Required, MaxLength(150)]
    public string Subject { get; set; } = string.Empty;

    [Required, MaxLength(40)]
    public string Category { get; set; } = string.Empty;

    [Required, MaxLength(20)]
    public string Priority { get; set; } = string.Empty;

    [Required, MaxLength(2000)]
    public string Message { get; set; } = string.Empty;
}

public sealed class UpdateFeedbackReviewRequest
{
    [Required, MaxLength(30)]
    public string Status { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? AdminNote { get; set; }
}

public sealed record FeedbackNotificationSummaryDto(int UnreadReplies);

public sealed record FeedbackItemDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    string Subject,
    string Category,
    string Priority,
    string Message,
    string Status,
    string? AdminNote,
    string SubmittedByName,
    string SubmittedByEmail,
    DateTime CreatedAtUtc,
    DateTime? ReviewedAtUtc,
    bool HasUnreadPlatformUpdate);

public interface IFeedbackService
{
    Task<IReadOnlyCollection<FeedbackItemDto>> GetOwnedAsync(Guid? companyId, CancellationToken cancellationToken = default);
    Task<FeedbackNotificationSummaryDto> GetOwnedNotificationSummaryAsync(CancellationToken cancellationToken = default);
    Task MarkOwnedRepliesReadAsync(Guid? companyId, CancellationToken cancellationToken = default);
    Task<FeedbackItemDto> CreateAsync(CreateFeedbackRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<FeedbackItemDto>> GetPlatformAsync(CancellationToken cancellationToken = default);
    Task<FeedbackItemDto?> UpdatePlatformAsync(Guid id, UpdateFeedbackReviewRequest request, CancellationToken cancellationToken = default);
}
