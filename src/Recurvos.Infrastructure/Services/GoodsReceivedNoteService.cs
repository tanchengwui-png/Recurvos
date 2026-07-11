using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Purchases;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class GoodsReceivedNoteService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    InventoryMovementService inventoryMovementService) : IGoodsReceivedNoteService
{
    public async Task<IReadOnlyCollection<GoodsReceivedNoteListItemDto>> GetAsync(GoodsReceivedNoteListQuery query, CancellationToken cancellationToken = default)
    {
        await SyncGoodsReceivedNoteStatusesAsync(OwnedCompanyIdsQuery(), cancellationToken);
        var items = dbContext.GoodsReceivedNotes.Include(x => x.Company)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            items = items.Where(x => x.GoodsReceivedNoteNumber.Contains(term) || x.PurchaseOrderNumber.Contains(term) || x.ContactName.Contains(term) || x.ReferenceNo.Contains(term));
        }

        if (query.CompanyId.HasValue) items = items.Where(x => x.CompanyId == query.CompanyId.Value);
        if (query.Status.HasValue) items = items.Where(x => x.Status == query.Status.Value);

        var result = await items.OrderByDescending(x => x.DocumentDateUtc).ThenByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        return result.Select(MapList).ToList();
    }

    public async Task<GoodsReceivedNoteDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await SyncGoodsReceivedNoteStatusesAsync(OwnedCompanyIdsQuery(), cancellationToken);
        var entity = await dbContext.GoodsReceivedNotes.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var relatedDocuments = await LoadRelatedDocumentsAsync(entity.Id, entity.CompanyId, cancellationToken);
        return MapDetails(entity, relatedDocuments);
    }

    public async Task<GoodsReceivedNoteDetailsDto> CreateAsync(GoodsReceivedNoteUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var purchaseOrder = await ValidateCommonAsync(request.CompanyId, request.PurchaseOrderId, request.Lines, cancellationToken);
        PurchaseWorkflowRules.EnsurePurchaseOrderAllowsReceiving(purchaseOrder);
        var warehouseId = await ValidateWarehouseAsync(purchaseOrder.CompanyId, request.WarehouseId, cancellationToken);
        var currency = await ValidateCurrencyAsync(purchaseOrder.CompanyId, purchaseOrder.Currency, cancellationToken);

        var entity = new GoodsReceivedNote
        {
            CompanyId = purchaseOrder.CompanyId,
            GoodsReceivedNoteNumber = await GenerateGoodsReceivedNoteNumberAsync(purchaseOrder.CompanyId, cancellationToken),
            PurchaseOrderId = purchaseOrder.Id,
            WarehouseId = warehouseId,
            PurchaseOrderNumber = purchaseOrder.PurchaseOrderNumber,
            CreatedFromDocumentId = purchaseOrder.Id,
            CreatedFromDocumentNumber = purchaseOrder.PurchaseOrderNumber,
            CreatedFromDocumentType = "PurchaseOrder",
            ContactId = purchaseOrder.ContactId,
            ContactName = purchaseOrder.ContactName,
            ContactEmail = purchaseOrder.ContactEmail,
            ContactPhoneNumber = purchaseOrder.ContactPhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
        };

        ApplyLines(entity, purchaseOrder, request.Lines);
        dbContext.GoodsReceivedNotes.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("goods-received-note.created", nameof(GoodsReceivedNote), entity.Id.ToString(), entity.GoodsReceivedNoteNumber, cancellationToken);
        await auditService.WriteAsync("goods-received-note.converted", nameof(PurchaseOrder), purchaseOrder.Id.ToString(), $"to={entity.GoodsReceivedNoteNumber}", cancellationToken);
        var created = await LoadOrThrowAsync(entity.Id, cancellationToken);
        var relatedDocuments = await LoadRelatedDocumentsAsync(created.Id, created.CompanyId, cancellationToken);
        return MapDetails(created, relatedDocuments);
    }

    public async Task<GoodsReceivedNoteDetailsDto?> UpdateAsync(Guid id, GoodsReceivedNoteUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.GoodsReceivedNotes.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (entity.Status != GoodsReceivedNoteStatus.Draft)
            throw new InvalidOperationException("Only draft GRNs can be edited.");

        var purchaseOrder = await ValidateCommonAsync(request.CompanyId, request.PurchaseOrderId, request.Lines, cancellationToken);
        PurchaseWorkflowRules.EnsurePurchaseOrderAllowsReceiving(purchaseOrder);
        var warehouseId = await ValidateWarehouseAsync(purchaseOrder.CompanyId, request.WarehouseId, cancellationToken);
        if (entity.CompanyId != purchaseOrder.CompanyId || entity.PurchaseOrderId != purchaseOrder.Id)
            throw new InvalidOperationException("GRN source purchase order cannot be changed.");

        entity.DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime();
        entity.WarehouseId = warehouseId;
        entity.ReferenceNo = request.ReferenceNo.Trim();
        entity.Notes = request.Notes.Trim();
        entity.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.GoodsReceivedNoteLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        ApplyLines(entity, purchaseOrder, request.Lines);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("goods-received-note.updated", nameof(GoodsReceivedNote), entity.Id.ToString(), entity.GoodsReceivedNoteNumber, cancellationToken);
        var updated = await LoadOrThrowAsync(entity.Id, cancellationToken);
        var relatedDocuments = await LoadRelatedDocumentsAsync(updated.Id, updated.CompanyId, cancellationToken);
        return MapDetails(updated, relatedDocuments);
    }

    public async Task<GoodsReceivedNoteDetailsDto?> SetStatusAsync(Guid id, GoodsReceivedNoteStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.GoodsReceivedNotes.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;

        var purchaseOrder = await dbContext.PurchaseOrders.Include(x => x.Lines)
            .FirstAsync(x => x.Id == entity.PurchaseOrderId, cancellationToken);

        PurchaseWorkflowRules.EnsureGoodsReceivedNoteManualStatusTransition(entity.Status, request.Status);

        var oldPurchaseOrderStatusSnapshot = purchaseOrder.Status.ToString();

        if (entity.Status == GoodsReceivedNoteStatus.Draft && request.Status == GoodsReceivedNoteStatus.Received)
        {
            PurchaseWorkflowRules.EnsurePurchaseOrderAllowsReceiving(purchaseOrder);
            EnsureQuantitiesCanBeReceived(entity, purchaseOrder);
            ApplyReceivedQuantities(entity, purchaseOrder, 1m);
            purchaseOrder.Status = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(purchaseOrder, PurchaseOrderStatus.Approved);
            await inventoryMovementService.ApplyGoodsReceivedNoteAsync(entity, 1m, cancellationToken);
        }
        else if (entity.Status == GoodsReceivedNoteStatus.Received && request.Status == GoodsReceivedNoteStatus.Cancelled)
        {
            ApplyReceivedQuantities(entity, purchaseOrder, -1m);
            purchaseOrder.Status = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(purchaseOrder, PurchaseOrderStatus.Approved);
            await inventoryMovementService.ApplyGoodsReceivedNoteAsync(entity, -1m, cancellationToken);
        }

        var oldStatus = entity.Status.ToString();
        entity.Status = request.Status;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        purchaseOrder.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteChangeAsync("goods-received-note.status-updated", nameof(GoodsReceivedNote), entity.Id.ToString(), oldStatus, request.Status.ToString(), entity.GoodsReceivedNoteNumber, cancellationToken);
        await auditService.WriteAsync(request.Status == GoodsReceivedNoteStatus.Received ? "goods-received-note.quantities-applied" : "goods-received-note.quantities-reversed", nameof(GoodsReceivedNote), entity.Id.ToString(), entity.GoodsReceivedNoteNumber, cancellationToken);
        if (oldPurchaseOrderStatusSnapshot != purchaseOrder.Status.ToString())
        {
            await auditService.WriteChangeAsync("purchase-order.status-auto-updated", nameof(PurchaseOrder), purchaseOrder.Id.ToString(), oldPurchaseOrderStatusSnapshot, purchaseOrder.Status.ToString(), purchaseOrder.PurchaseOrderNumber, cancellationToken);
        }
        var relatedDocuments = await LoadRelatedDocumentsAsync(entity.Id, entity.CompanyId, cancellationToken);
        return MapDetails(entity, relatedDocuments);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.GoodsReceivedNotes.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return false;
        if (entity.Status != GoodsReceivedNoteStatus.Draft)
            throw new InvalidOperationException("Only draft GRNs can be deleted.");
        dbContext.GoodsReceivedNotes.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("goods-received-note.deleted", nameof(GoodsReceivedNote), entity.Id.ToString(), entity.GoodsReceivedNoteNumber, cancellationToken);
        return true;
    }

    private async Task<PurchaseOrder> ValidateCommonAsync(Guid? companyId, Guid purchaseOrderId, IReadOnlyCollection<GoodsReceivedNoteLineRequest> lines, CancellationToken cancellationToken)
    {
        if (!companyId.HasValue || companyId == Guid.Empty)
            throw new InvalidOperationException("Company is required.");

        await EnsureCompanyAccessAsync(companyId.Value, cancellationToken);

        var purchaseOrder = await dbContext.PurchaseOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId.Value && x.Id == purchaseOrderId, cancellationToken)
            ?? throw new InvalidOperationException("Selected purchase order was not found.");

        if (lines.Count == 0)
            throw new InvalidOperationException("At least one line is required.");

        var duplicateIds = lines.GroupBy(x => x.PurchaseOrderLineId).Where(x => x.Count() > 1).Select(x => x.Key).ToList();
        if (duplicateIds.Count > 0)
            throw new InvalidOperationException("Each purchase order line can only be added once.");

        foreach (var requestLine in lines)
        {
            var sourceLine = purchaseOrder.Lines.FirstOrDefault(x => x.Id == requestLine.PurchaseOrderLineId)
                ?? throw new InvalidOperationException("Selected purchase order line was not found.");
            var remaining = Math.Max(0m, sourceLine.Quantity - sourceLine.ReceivedQuantity);
            if (requestLine.Quantity > remaining)
                throw new InvalidOperationException($"Received quantity for '{sourceLine.Description}' exceeds the remaining quantity.");
        }

        return purchaseOrder;
    }

    private async Task<Guid> ValidateWarehouseAsync(Guid companyId, Guid? warehouseId, CancellationToken cancellationToken)
    {
        if (!warehouseId.HasValue || warehouseId == Guid.Empty)
            throw new InvalidOperationException("Warehouse is required.");

        var exists = await dbContext.Warehouses.AnyAsync(
            x => x.CompanyId == companyId && x.Id == warehouseId.Value && x.IsActive,
            cancellationToken);
        if (!exists)
            throw new InvalidOperationException("Select a valid warehouse.");

        return warehouseId.Value;
    }

    private async Task<string> ValidateCurrencyAsync(Guid companyId, string? currency, CancellationToken cancellationToken)
    {
        var normalized = string.IsNullOrWhiteSpace(currency) ? string.Empty : currency.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
            throw new InvalidOperationException("Select a valid currency.");

        var exists = await dbContext.CurrencyDefinitions.AnyAsync(
            x => x.CompanyId == companyId && x.IsActive && x.Code == normalized,
            cancellationToken);
        if (!exists)
            throw new InvalidOperationException("Select a valid currency.");

        return normalized;
    }

    private static void EnsureQuantitiesCanBeReceived(GoodsReceivedNote entity, PurchaseOrder purchaseOrder)
    {
        foreach (var grnLine in entity.Lines)
        {
            var sourceLine = purchaseOrder.Lines.First(x => x.Id == grnLine.PurchaseOrderLineId);
            var remaining = Math.Max(0m, sourceLine.Quantity - sourceLine.ReceivedQuantity);
            if (grnLine.Quantity > remaining)
            {
                throw new InvalidOperationException($"Received quantity for '{sourceLine.Description}' exceeds the remaining quantity.");
            }
        }
    }

    private static void ApplyLines(GoodsReceivedNote entity, PurchaseOrder purchaseOrder, IReadOnlyCollection<GoodsReceivedNoteLineRequest> requests)
    {
        var subtotal = 0m;
        var tax = 0m;
        var sortOrder = 1;
        var lines = new List<GoodsReceivedNoteLine>();
        foreach (var request in requests)
        {
            var sourceLine = purchaseOrder.Lines.First(x => x.Id == request.PurchaseOrderLineId);
            var lineSubtotal = Math.Round(request.Quantity * sourceLine.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (sourceLine.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);
            lines.Add(new GoodsReceivedNoteLine
            {
                SortOrder = sortOrder++,
                PurchaseOrderLineId = sourceLine.Id,
                ProductId = sourceLine.ProductId,
                TaxCodeId = sourceLine.TaxCodeId,
                ProductNameSnapshot = sourceLine.ProductNameSnapshot,
                Description = sourceLine.Description,
                Quantity = request.Quantity,
                UnitPrice = sourceLine.UnitPrice,
                TaxRate = sourceLine.TaxRate,
                TaxAmount = lineTax,
                LineTotal = lineSubtotal + lineTax,
            });
            subtotal += lineSubtotal;
            tax += lineTax;
        }

        entity.Lines = lines;
        entity.Subtotal = subtotal;
        entity.TaxAmount = tax;
        entity.TotalAmount = subtotal + tax;
    }

    private static void ApplyReceivedQuantities(GoodsReceivedNote entity, PurchaseOrder purchaseOrder, decimal direction)
    {
        foreach (var grnLine in entity.Lines)
        {
            var sourceLine = purchaseOrder.Lines.First(x => x.Id == grnLine.PurchaseOrderLineId);
            sourceLine.ReceivedQuantity = Math.Max(0m, sourceLine.ReceivedQuantity + (grnLine.Quantity * direction));
        }
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.SubscriberId == GetSubscriberId(), cancellationToken);
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private async Task<string> GenerateGoodsReceivedNoteNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.GoodsReceivedNotes.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"GRN-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
    }

    private async Task<GoodsReceivedNote> LoadOrThrowAsync(Guid id, CancellationToken cancellationToken) =>
        await dbContext.GoodsReceivedNotes.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == id, cancellationToken);

    private static GoodsReceivedNoteListItemDto MapList(GoodsReceivedNote entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.GoodsReceivedNoteNumber, entity.PurchaseOrderId, entity.PurchaseOrderNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.Currency, entity.TotalAmount, entity.Status);

    private static GoodsReceivedNoteDetailsDto MapDetails(GoodsReceivedNote entity, GoodsReceivedNoteRelatedDocumentsDto? relatedDocuments = null) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.GoodsReceivedNoteNumber, entity.PurchaseOrderId, entity.PurchaseOrderNumber, entity.WarehouseId, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.CreatedFromDocumentId, entity.CreatedFromDocumentNumber, entity.CreatedFromDocumentType, entity.DocumentDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList(), relatedDocuments ?? new GoodsReceivedNoteRelatedDocumentsDto([]));

    private static PurchaseDocumentLineDto MapLine(GoodsReceivedNoteLine line) =>
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, line.PurchaseOrderLineId, 0m, line.BilledQuantity);

    private async Task<GoodsReceivedNoteRelatedDocumentsDto> LoadRelatedDocumentsAsync(Guid goodsReceivedNoteId, Guid companyId, CancellationToken cancellationToken)
    {
        var bills = await dbContext.PurchaseBills
            .Where(x => x.CompanyId == companyId && x.GoodsReceivedNoteId == goodsReceivedNoteId)
            .OrderByDescending(x => x.IssueDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Select(x => new PurchaseRelatedDocumentDto(x.Id, x.PurchaseBillNumber, "PurchaseBill", x.Status.ToString(), x.IssueDateUtc, x.TotalAmount))
            .ToListAsync(cancellationToken);

        return new GoodsReceivedNoteRelatedDocumentsDto(bills);
    }

    private async Task SyncGoodsReceivedNoteStatusesAsync(IQueryable<Guid> companyIds, CancellationToken cancellationToken)
    {
        var items = await dbContext.GoodsReceivedNotes
            .Include(x => x.Lines)
            .Where(x => companyIds.Contains(x.CompanyId) && x.Status != GoodsReceivedNoteStatus.Cancelled)
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var item in items)
        {
            var nextStatus = PurchaseWorkflowRules.ResolveGoodsReceivedNoteBillingStatus(item);
            if (item.Status != nextStatus)
            {
                item.Status = nextStatus;
                item.UpdatedAtUtc = DateTime.UtcNow;
                changed = true;
            }
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
