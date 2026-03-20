using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class CreditNote : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public Guid CustomerId { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal SubtotalReduction { get; set; }
    public decimal TaxReduction { get; set; }
    public decimal TotalReduction { get; set; }
    public string Reason { get; set; } = string.Empty;
    public CreditNoteStatus Status { get; set; } = CreditNoteStatus.Issued;
    public DateTime IssuedAtUtc { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public Invoice? Invoice { get; set; }
    public Customer? Customer { get; set; }
    public ICollection<CreditNoteLine> Lines { get; set; } = new List<CreditNoteLine>();
}
