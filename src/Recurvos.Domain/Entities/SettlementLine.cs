using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class SettlementLine : CompanyOwnedEntity
{
    public Guid PayoutBatchId { get; set; }
    public Guid? PaymentId { get; set; }
    public Guid? RefundId { get; set; }
    public string ExternalReference { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public decimal GrossAmount { get; set; }
    public decimal FeeAmount { get; set; }
    public decimal NetAmount { get; set; }
    public DateTime SettledAtUtc { get; set; }
    public PayoutBatch? PayoutBatch { get; set; }
    public Payment? Payment { get; set; }
    public Refund? Refund { get; set; }
}
