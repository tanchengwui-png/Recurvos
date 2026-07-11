using Microsoft.EntityFrameworkCore;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class InventoryMovementService(AppDbContext dbContext)
{
    public async Task ApplyGoodsReceivedNoteAsync(GoodsReceivedNote goodsReceivedNote, decimal direction, CancellationToken cancellationToken = default)
    {
        var warehouseId = goodsReceivedNote.WarehouseId;

        foreach (var line in goodsReceivedNote.Lines.Where(x => x.ProductId.HasValue && x.Quantity > 0m))
        {
            var quantityDelta = line.Quantity * direction;
            if (quantityDelta == 0m)
            {
                continue;
            }

            await ApplyMovementAsync(
                goodsReceivedNote.CompanyId,
                line.ProductId!.Value,
                warehouseId,
                quantityDelta,
                quantityDelta > 0m ? InventoryMovementType.PurchaseReceipt : InventoryMovementType.PurchaseReturn,
                nameof(GoodsReceivedNote),
                goodsReceivedNote.Id,
                goodsReceivedNote.DocumentDateUtc,
                goodsReceivedNote.GoodsReceivedNoteNumber,
                cancellationToken);
        }
    }

    public async Task ApplyPurchaseCreditNoteAsync(PurchaseCreditNote creditNote, PurchaseBill purchaseBill, CancellationToken cancellationToken = default)
    {
        var warehouseId = await GetDefaultWarehouseIdAsync(creditNote.CompanyId, cancellationToken);

        foreach (var creditLine in creditNote.Lines.Where(x => x.Quantity > 0m))
        {
            var sourceBillLine = purchaseBill.Lines
                .FirstOrDefault(x => x.ProductId.HasValue && string.Equals(x.Description.Trim(), creditLine.Description.Trim(), StringComparison.OrdinalIgnoreCase));
            if (sourceBillLine?.ProductId is not Guid productId)
            {
                continue;
            }

            await ApplyMovementAsync(
                creditNote.CompanyId,
                productId,
                warehouseId,
                -creditLine.Quantity,
                InventoryMovementType.PurchaseReturn,
                nameof(PurchaseCreditNote),
                creditNote.Id,
                creditNote.IssuedAtUtc,
                creditNote.PurchaseCreditNoteNumber,
                cancellationToken);
        }
    }

    private async Task ApplyMovementAsync(Guid companyId, Guid productId, Guid? warehouseId, decimal quantityDelta, InventoryMovementType movementType, string sourceDocumentType, Guid sourceDocumentId, DateTime transactionDateUtc, string notes, CancellationToken cancellationToken)
    {
        var balance = await dbContext.InventoryBalances
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.ProductId == productId && x.WarehouseId == warehouseId, cancellationToken);

        if (balance is null)
        {
            balance = new InventoryBalance
            {
                CompanyId = companyId,
                ProductId = productId,
                WarehouseId = warehouseId,
                QuantityOnHand = 0m,
            };
            dbContext.InventoryBalances.Add(balance);
        }

        balance.QuantityOnHand += quantityDelta;
        if (balance.QuantityOnHand < 0m)
        {
            throw new InvalidOperationException("Inventory movement would result in negative stock.");
        }

        dbContext.InventoryMovements.Add(new InventoryMovement
        {
            CompanyId = companyId,
            ProductId = productId,
            WarehouseId = warehouseId,
            Quantity = quantityDelta,
            MovementType = movementType,
            SourceDocumentType = sourceDocumentType,
            SourceDocumentId = sourceDocumentId,
            TransactionDateUtc = transactionDateUtc.Kind == DateTimeKind.Utc ? transactionDateUtc : transactionDateUtc.ToUniversalTime(),
            Notes = notes,
        });
    }

    private async Task<Guid?> GetDefaultWarehouseIdAsync(Guid companyId, CancellationToken cancellationToken)
        => await dbContext.Warehouses
            .Where(x => x.CompanyId == companyId && x.IsActive)
            .OrderBy(x => x.Code)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
}
