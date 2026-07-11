using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PurchaseCreditNote : CompanyOwnedEntity
{
    public Guid PurchaseBillId { get; set; }
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public string PurchaseCreditNoteNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public decimal SubtotalReduction { get; set; }
    public decimal TaxReduction { get; set; }
    public decimal TotalReduction { get; set; }
    public string Reason { get; set; } = string.Empty;
    public PurchaseCreditNoteStatus Status { get; set; } = PurchaseCreditNoteStatus.Draft;
    public DateTime IssuedAtUtc { get; set; }
    public Company? Company { get; set; }
    public PurchaseBill? PurchaseBill { get; set; }
    public ICollection<PurchaseCreditNoteLine> Lines { get; set; } = new List<PurchaseCreditNoteLine>();
}
