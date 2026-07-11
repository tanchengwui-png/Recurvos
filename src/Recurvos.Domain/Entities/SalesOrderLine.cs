using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class SalesOrderLine : BaseEntity
{
    public Guid SalesOrderId { get; set; }
    public int SortOrder { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? TaxCodeId { get; set; }
    public string ProductNameSnapshot { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public decimal DeliveredQuantity { get; set; }
    public decimal InvoicedQuantity { get; set; }
    public Guid? SourceQuotationLineId { get; set; }
    public SalesOrder? SalesOrder { get; set; }
}
