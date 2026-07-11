using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PurchaseBill : CompanyOwnedEntity
{
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public Guid? PurchaseOrderId { get; set; }
    public Guid? GoodsReceivedNoteId { get; set; }
    public Guid CreatedFromDocumentId { get; set; }
    public string CreatedFromDocumentNumber { get; set; } = string.Empty;
    public string CreatedFromDocumentType { get; set; } = string.Empty;
    public string PurchaseBillNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public string ReferenceNo { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime IssueDateUtc { get; set; }
    public DateTime DueDateUtc { get; set; }
    public PurchaseBillStatus Status { get; set; } = PurchaseBillStatus.Draft;
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal AmountDue { get; set; }
    public decimal AmountPaid { get; set; }
    public Company? Company { get; set; }
    public ICollection<PurchaseBillLine> Lines { get; set; } = new List<PurchaseBillLine>();
}
