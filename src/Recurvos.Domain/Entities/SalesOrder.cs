using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class SalesOrder : CompanyOwnedEntity
{
    public string SalesOrderNumber { get; set; } = string.Empty;
    public Guid ContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhoneNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public string ReferenceNo { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime DocumentDateUtc { get; set; }
    public SalesOrderStatus Status { get; set; } = SalesOrderStatus.Draft;
    public Guid? SalesQuotationId { get; set; }
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public Company? Company { get; set; }
    public ICollection<SalesOrderLine> Lines { get; set; } = new List<SalesOrderLine>();
}
