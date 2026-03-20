using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class SubscriptionItem : CompanyOwnedEntity
{
    public Guid SubscriptionId { get; set; }
    public Guid ProductPlanId { get; set; }
    public int Quantity { get; set; } = 1;
    public decimal UnitAmount { get; set; }
    public string Currency { get; set; } = "MYR";
    public BillingType BillingType { get; set; } = BillingType.Recurring;
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.None;
    public int IntervalCount { get; set; }
    public bool AutoRenew { get; set; } = true;
    public DateTime? TrialStartUtc { get; set; }
    public DateTime? TrialEndUtc { get; set; }
    public DateTime? CurrentPeriodStartUtc { get; set; }
    public DateTime? CurrentPeriodEndUtc { get; set; }
    public DateTime? NextBillingUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public Subscription? Subscription { get; set; }
    public ProductPlan? ProductPlan { get; set; }
}
