using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class GoodsReceivedNote : CompanyOwnedEntity
{
    public string GoodsReceivedNoteNumber { get; set; } = string.Empty;
    public Guid? PurchaseOrderId { get; set; }
    public Guid? WarehouseId { get; set; }
    public string PurchaseOrderNumber { get; set; } = string.Empty;
    public Guid? CreatedFromDocumentId { get; set; }
    public string CreatedFromDocumentNumber { get; set; } = string.Empty;
    public string CreatedFromDocumentType { get; set; } = "PurchaseOrder";
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public string ReferenceNo { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime DocumentDateUtc { get; set; }
    public GoodsReceivedNoteStatus Status { get; set; } = GoodsReceivedNoteStatus.Draft;
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public Company? Company { get; set; }
    public ICollection<GoodsReceivedNoteLine> Lines { get; set; } = new List<GoodsReceivedNoteLine>();
}
