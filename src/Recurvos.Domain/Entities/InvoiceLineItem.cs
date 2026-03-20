using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class InvoiceLineItem : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public Guid? SubscriptionItemId { get; set; }
    public string Description { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public Invoice? Invoice { get; set; }
    public SubscriptionItem? SubscriptionItem { get; set; }
}
