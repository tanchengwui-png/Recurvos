using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

/// <summary>Stable owner for subscriber billing, independent of company lifecycle.</summary>
public sealed class SubscriberAccount : BaseEntity
{
    public Guid OwnerUserId { get; set; }
    // Platform subscription billing identity. Company profile data must never be
    // used for account subscription invoices or entitlement decisions.
    public string? BillingContactName { get; set; }
    public string? BillingEmail { get; set; }
    public string? BillingPhone { get; set; }
    public string? BillingAddress { get; set; }
    public string? BillingTaxIdType { get; set; }
    public string? BillingTaxIdNumber { get; set; }
    public bool AccountBillingEnabled { get; set; }
    // Release 3 canary projection. It is used only by a healthy, explicit account opt-in.
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
