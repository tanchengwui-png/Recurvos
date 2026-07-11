using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PurchasePaymentAllocation : BaseEntity
{
    public Guid PurchasePaymentId { get; set; }
    public Guid PurchaseBillId { get; set; }
    public string PurchaseBillNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public PurchasePayment? PurchasePayment { get; set; }
}
