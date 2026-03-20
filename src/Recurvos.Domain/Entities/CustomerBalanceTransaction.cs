using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class CustomerBalanceTransaction : CompanyOwnedEntity
{
    public Guid CustomerId { get; set; }
    public Guid? InvoiceId { get; set; }
    public Guid? PaymentId { get; set; }
    public Guid? RefundId { get; set; }
    public Guid? CreditNoteId { get; set; }
    public CustomerBalanceTransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string Description { get; set; } = string.Empty;
    public Guid? CreatedByUserId { get; set; }
    public Customer? Customer { get; set; }
    public Invoice? Invoice { get; set; }
    public Payment? Payment { get; set; }
    public Refund? Refund { get; set; }
    public CreditNote? CreditNote { get; set; }
}
