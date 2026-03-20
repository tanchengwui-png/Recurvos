using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class Subscription : CompanyOwnedEntity
{
    public Guid CustomerId { get; set; }
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Draft;
    public DateTime StartDateUtc { get; set; }
    public DateTime? TrialStartUtc { get; set; }
    public DateTime? TrialEndUtc { get; set; }
    public DateTime? CurrentPeriodStartUtc { get; set; }
    public DateTime? CurrentPeriodEndUtc { get; set; }
    public DateTime? NextBillingUtc { get; set; }
    public bool CancelAtPeriodEnd { get; set; }
    public DateTime? CanceledAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public bool AutoRenew { get; set; } = true;
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "MYR";
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.None;
    public int IntervalCount { get; set; }
    public int Quantity { get; set; } = 1;
    public string? Notes { get; set; }
    public Company? Company { get; set; }
    public Customer? Customer { get; set; }
    public ICollection<SubscriptionItem> Items { get; set; } = new List<SubscriptionItem>();
    public ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();
}
