using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class Refund : CompanyOwnedEntity
{
    public Guid PaymentId { get; set; }
    public Guid? InvoiceId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string Reason { get; set; } = string.Empty;
    public string? ExternalRefundId { get; set; }
    public RefundStatus Status { get; set; } = RefundStatus.Succeeded;
    public Guid? CreatedByUserId { get; set; }
    public Payment? Payment { get; set; }
    public Invoice? Invoice { get; set; }
}
