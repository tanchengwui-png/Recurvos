using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class InvoiceLineItem : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public Guid? SubscriptionItemId { get; set; }
    public Guid? SalesOrderLineId { get; set; }
    public Guid? DeliveryOrderLineId { get; set; }
    public Guid? TaxCodeId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitAmount { get; set; }
    public decimal TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal LineTotal { get; set; }
    public Invoice? Invoice { get; set; }
    public SubscriptionItem? SubscriptionItem { get; set; }
}
