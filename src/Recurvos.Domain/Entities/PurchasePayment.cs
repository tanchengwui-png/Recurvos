using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PurchasePayment : CompanyOwnedEntity
{
    public string PurchasePaymentNumber { get; set; } = string.Empty;
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public DateTime PaymentDateUtc { get; set; }
    public string Currency { get; set; } = "MYR";
    public string ReferenceNo { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public PurchasePaymentStatus Status { get; set; } = PurchasePaymentStatus.Draft;
    public decimal TotalAmount { get; set; }
    public Company? Company { get; set; }
    public ICollection<PurchasePaymentAllocation> Allocations { get; set; } = new List<PurchasePaymentAllocation>();
    public ICollection<PurchaseRefund> Refunds { get; set; } = new List<PurchaseRefund>();
}
