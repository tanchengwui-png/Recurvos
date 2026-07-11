using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PurchaseRefund : CompanyOwnedEntity
{
    public Guid PurchasePaymentId { get; set; }
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public string PurchaseRefundNumber { get; set; } = string.Empty;
    public DateTime RefundDateUtc { get; set; }
    public string Currency { get; set; } = "MYR";
    public string ReferenceNo { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public PurchaseRefundStatus Status { get; set; } = PurchaseRefundStatus.Draft;
    public Company? Company { get; set; }
    public PurchasePayment? PurchasePayment { get; set; }
    public ICollection<PurchaseRefundAllocation> Allocations { get; set; } = new List<PurchaseRefundAllocation>();
}
