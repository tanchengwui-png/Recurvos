using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PurchaseRefundAllocation : BaseEntity
{
    public Guid PurchaseRefundId { get; set; }
    public Guid PurchasePaymentAllocationId { get; set; }
    public Guid PurchaseBillId { get; set; }
    public string PurchaseBillNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public PurchaseRefund? PurchaseRefund { get; set; }
}
