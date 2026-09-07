using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PurchaseCreditNoteLine : BaseEntity
{
    public Guid PurchaseCreditNoteId { get; set; }
    public Guid? PurchaseBillLineId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public PurchaseCreditNote? PurchaseCreditNote { get; set; }
}
