using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PurchaseBillLine : BaseEntity
{
    public Guid PurchaseBillId { get; set; }
    public Guid? PurchaseOrderLineId { get; set; }
    public Guid? GoodsReceivedNoteLineId { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? TaxCodeId { get; set; }
    public string ProductNameSnapshot { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public PurchaseBill? PurchaseBill { get; set; }
}
