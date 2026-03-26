using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Subscriptions;

public sealed class SubscriptionItemRequest
{
    [Required]
    public Guid ProductPlanId { get; set; }

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;
}

public sealed class SubscriptionRequest
{
    [Required]
    public Guid CustomerId { get; set; }

    [Required, MinLength(1)]
    public List<SubscriptionItemRequest> Items { get; set; } = new();

    [Required]
    public DateTime StartDateUtc { get; set; } = DateTime.UtcNow;

    [Range(0, 3650)]
    public int TrialDays { get; set; }

    [MaxLength(1000)]
    public string? Notes { get; set; }
}

public sealed class SubscriptionUpdateRequest
{
    [MaxLength(1000)]
    public string? Notes { get; set; }

    public bool? AutoRenew { get; set; }
}

public sealed class UpdateSubscriptionPricingRequest
{
    [Range(typeof(decimal), "0", "9999999999999999")]
    public decimal UnitPrice { get; set; }

    [Required, MaxLength(3)]
    public string Currency { get; set; } = "MYR";

    [Required]
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.None;

    [Range(0, int.MaxValue)]
    public int IntervalCount { get; set; }

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    [MaxLength(1000)]
    public string? Reason { get; set; }
}

public sealed class MigrateSubscriptionItemRequest
{
    [Required]
    public Guid TargetProductPlanId { get; set; }

    [MaxLength(1000)]
    public string? Reason { get; set; }
}

public sealed class CancelSubscriptionRequest
{
    public bool EndOfPeriod { get; set; } = true;
    public DateTime? EffectiveDateUtc { get; set; }
}

public sealed record SubscriptionItemDto(
    Guid Id,
    Guid ProductPlanId,
    string ProductPlanName,
    int Quantity,
    decimal UnitAmount,
    string Currency,
    IntervalUnit IntervalUnit,
    int IntervalCount,
    DateTime? TrialStartUtc,
    DateTime? TrialEndUtc,
    DateTime? CurrentPeriodStartUtc,
    DateTime? CurrentPeriodEndUtc,
    DateTime? NextBillingUtc,
    bool AutoRenew,
    bool IsDue,
    decimal EffectiveBillingAmount);

public sealed record SubscriptionDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    Guid CustomerId,
    string CustomerName,
    SubscriptionStatus Status,
    DateTime StartDateUtc,
    DateTime? TrialStartUtc,
    DateTime? TrialEndUtc,
    bool IsTrialing,
    DateTime? CurrentPeriodStartUtc,
    DateTime? CurrentPeriodEndUtc,
    DateTime? NextBillingUtc,
    bool IsDue,
    bool IsActiveInPeriod,
    bool CancelAtPeriodEnd,
    DateTime? CanceledAtUtc,
    DateTime? EndedAtUtc,
    bool AutoRenew,
    decimal UnitPrice,
    string Currency,
    IntervalUnit IntervalUnit,
    int IntervalCount,
    int Quantity,
    decimal EffectiveBillingAmount,
    bool HasMixedBillingIntervals,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    IReadOnlyCollection<SubscriptionItemDto> Items);

public interface ISubscriptionService
{
    Task<IReadOnlyCollection<SubscriptionDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<SubscriptionDto> CreateAsync(SubscriptionRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> UpdateAsync(Guid id, SubscriptionUpdateRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> UpdatePricingAsync(Guid id, UpdateSubscriptionPricingRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> MigrateItemAsync(Guid id, Guid subscriptionItemId, MigrateSubscriptionItemRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> PauseAsync(Guid id, CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> ResumeAsync(Guid id, CancellationToken cancellationToken = default);
    Task<SubscriptionDto?> CancelAsync(Guid id, CancelSubscriptionRequest request, CancellationToken cancellationToken = default);
}
