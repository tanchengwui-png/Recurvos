using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class DeliveryOrder : CompanyOwnedEntity
{
    public string DeliveryOrderNumber { get; set; } = string.Empty;
    public Guid? SalesOrderId { get; set; }
    public Guid? SalesQuotationId { get; set; }
    public Guid? WarehouseId { get; set; }
    public string SalesOrderNumber { get; set; } = string.Empty;
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public string ReferenceNo { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime DocumentDateUtc { get; set; }
    public DeliveryOrderStatus Status { get; set; } = DeliveryOrderStatus.Draft;
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public Company? Company { get; set; }
    public ICollection<DeliveryOrderLine> Lines { get; set; } = new List<DeliveryOrderLine>();
}
