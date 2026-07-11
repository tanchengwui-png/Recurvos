using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class InventoryBalance : CompanyOwnedEntity
{
    public Guid ProductId { get; set; }
    public Guid? WarehouseId { get; set; }
    public decimal QuantityOnHand { get; set; }
}
