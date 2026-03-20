using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class ReconciliationResult : CompanyOwnedEntity
{
    public Guid? SettlementLineId { get; set; }
    public Guid? PaymentId { get; set; }
    public Guid? RefundId { get; set; }
    public decimal ExpectedAmount { get; set; }
    public decimal ActualAmount { get; set; }
    public string Currency { get; set; } = "MYR";
    public ReconciliationStatus Status { get; set; } = ReconciliationStatus.Pending;
    public string Notes { get; set; } = string.Empty;
    public DateTime EvaluatedAtUtc { get; set; }
    public SettlementLine? SettlementLine { get; set; }
    public Payment? Payment { get; set; }
    public Refund? Refund { get; set; }
}
