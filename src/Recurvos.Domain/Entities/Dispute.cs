using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class Dispute : CompanyOwnedEntity
{
    public Guid PaymentId { get; set; }
    public string ExternalDisputeId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DisputeStatus Status { get; set; } = DisputeStatus.Open;
    public DateTime OpenedAtUtc { get; set; }
    public DateTime? ResolvedAtUtc { get; set; }
    public Payment? Payment { get; set; }
}
