using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

/// <summary>Stable owner for subscriber billing, independent of company lifecycle.</summary>
public sealed class SubscriberAccount : BaseEntity
{
    public Guid OwnerUserId { get; set; }
    public bool AccountBillingEnabled { get; set; }
    // Release 1 shadow projection. It is never used to authorize billing reads.
    public string? BillingPackageCode { get; set; }
    public string? BillingPendingPackageCode { get; set; }
    public string? BillingStatus { get; set; }
    public DateTime? BillingGracePeriodEndsAtUtc { get; set; }
    public DateTime? BillingCycleStartUtc { get; set; }
    public DateTime? BillingTrialEndsAtUtc { get; set; }
    public DateTime? BillingProjectionUpdatedAtUtc { get; set; }
    public DateTime? BillingValidatedAtUtc { get; set; }
    public string? BillingHealthStatus { get; set; }
    public string? BillingHealthWarning { get; set; }
    public DateTime? ReconciledAtUtc { get; set; }
    public string? ReconciliationWarning { get; set; }
    public User? OwnerUser { get; set; }
    public ICollection<Company> Companies { get; set; } = new List<Company>();
    public ICollection<SubscriberAccountBillingEvent> BillingEvents { get; set; } = new List<SubscriberAccountBillingEvent>();
}
