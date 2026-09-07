using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class SalesPaymentAllocation : BaseEntity
{
    public Guid PaymentId { get; set; }
    public Guid InvoiceId { get; set; }
    public decimal Amount { get; set; }
    public Payment? Payment { get; set; }
    public Invoice? Invoice { get; set; }
}
