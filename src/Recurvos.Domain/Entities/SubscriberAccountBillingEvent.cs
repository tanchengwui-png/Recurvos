using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

/// <summary>Append-only observability record for the account-billing rollout.</summary>
public sealed class SubscriberAccountBillingEvent : BaseEntity
{
    public Guid SubscriberAccountId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Severity { get; set; } = "Information";
    public string? Details { get; set; }
    public SubscriberAccount? SubscriberAccount { get; set; }
}
