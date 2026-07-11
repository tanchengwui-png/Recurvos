using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class InventoryMovement : CompanyOwnedEntity
{
    public Guid ProductId { get; set; }
    public Guid? WarehouseId { get; set; }
    public decimal Quantity { get; set; }
    public InventoryMovementType MovementType { get; set; }
    public string SourceDocumentType { get; set; } = string.Empty;
    public Guid SourceDocumentId { get; set; }
    public DateTime TransactionDateUtc { get; set; }
    public string Notes { get; set; } = string.Empty;
}
