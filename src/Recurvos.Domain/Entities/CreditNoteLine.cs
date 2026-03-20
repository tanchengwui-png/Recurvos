using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class CreditNoteLine : CompanyOwnedEntity
{
    public Guid CreditNoteId { get; set; }
    public Guid? InvoiceLineId { get; set; }
    public string Description { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public CreditNote? CreditNote { get; set; }
    public InvoiceLineItem? InvoiceLine { get; set; }
}
