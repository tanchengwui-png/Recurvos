using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Sales;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class DeliveryOrderService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IDeliveryOrderService
{
    public async Task<IReadOnlyCollection<DeliveryOrderListItemDto>> GetAsync(DeliveryOrderListQuery query, CancellationToken cancellationToken = default)
    {
        var items = dbContext.DeliveryOrders.Include(x => x.Company)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            items = items.Where(x => x.DeliveryOrderNumber.Contains(term) || x.SalesOrderNumber.Contains(term) || x.ContactName.Contains(term) || x.ReferenceNo.Contains(term));
        }

        if (query.CompanyId.HasValue)
        {
            items = items.Where(x => x.CompanyId == query.CompanyId.Value);
        }

        if (query.Status.HasValue)
        {
            items = items.Where(x => x.Status == query.Status.Value);
        }

        var result = await items
            .OrderByDescending(x => x.DocumentDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return result.Select(MapList).ToList();
    }

    public async Task<DeliveryOrderDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.DeliveryOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        return entity is null ? null : MapDetails(entity);
    }

    public async Task<DeliveryOrderDetailsDto> CreateAsync(DeliveryOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var salesOrder = await ValidateCommonAsync(request.CompanyId, request.SalesOrderId, request.Lines, cancellationToken);
        if (salesOrder.Status == SalesOrderStatus.Closed || salesOrder.Status == SalesOrderStatus.Cancelled)
            throw new InvalidOperationException("Closed or cancelled sales orders cannot be delivered.");
        var warehouseId = await ValidateWarehouseAsync(salesOrder.CompanyId, request.WarehouseId, cancellationToken);
        var currency = await ValidateCurrencyAsync(salesOrder.CompanyId, salesOrder.Currency, cancellationToken);

        var entity = new DeliveryOrder
        {
            CompanyId = salesOrder.CompanyId,
            DeliveryOrderNumber = await GenerateDeliveryOrderNumberAsync(salesOrder.CompanyId, cancellationToken),
            SalesOrderId = salesOrder.Id,
            WarehouseId = warehouseId,
            SalesOrderNumber = salesOrder.SalesOrderNumber,
            ContactId = salesOrder.ContactId,
            ContactName = salesOrder.ContactName,
            ContactEmail = salesOrder.ContactEmail,
            ContactPhoneNumber = salesOrder.ContactPhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
        };

        ApplyLines(entity, salesOrder, request.Lines);
        dbContext.DeliveryOrders.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.created", nameof(DeliveryOrder), entity.Id.ToString(), entity.DeliveryOrderNumber, cancellationToken);
        return MapDetails(await LoadOrThrowAsync(entity.Id, cancellationToken));
    }

    public async Task<DeliveryOrderDetailsDto?> UpdateAsync(Guid id, DeliveryOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.DeliveryOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (entity.Status != DeliveryOrderStatus.Draft)
            throw new InvalidOperationException("Only draft delivery orders can be edited.");

        var salesOrder = await ValidateCommonAsync(request.CompanyId, request.SalesOrderId, request.Lines, cancellationToken);
        var warehouseId = await ValidateWarehouseAsync(salesOrder.CompanyId, request.WarehouseId, cancellationToken);
        if (entity.CompanyId != salesOrder.CompanyId || entity.SalesOrderId != salesOrder.Id)
            throw new InvalidOperationException("Delivery order source sales order cannot be changed.");

        entity.DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime();
        entity.WarehouseId = warehouseId;
        entity.ReferenceNo = request.ReferenceNo.Trim();
        entity.Notes = request.Notes.Trim();
        entity.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.DeliveryOrderLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        ApplyLines(entity, salesOrder, request.Lines);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.updated", nameof(DeliveryOrder), entity.Id.ToString(), entity.DeliveryOrderNumber, cancellationToken);
        return MapDetails(await LoadOrThrowAsync(entity.Id, cancellationToken));
    }

    public async Task<DeliveryOrderDetailsDto?> SetStatusAsync(Guid id, DeliveryOrderStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.DeliveryOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;

        var salesOrder = await dbContext.SalesOrders.Include(x => x.Lines)
            .FirstAsync(x => x.Id == entity.SalesOrderId, cancellationToken);

        EnsureStatusTransition(entity.Status, request.Status);

        if (entity.Status == DeliveryOrderStatus.Draft && request.Status == DeliveryOrderStatus.Delivered)
        {
            ApplyDeliveryQuantities(entity, salesOrder, 1m);
            RecomputeSalesOrderStatus(salesOrder);
        }
        else if (entity.Status == DeliveryOrderStatus.Delivered && request.Status == DeliveryOrderStatus.Cancelled)
        {
            ApplyDeliveryQuantities(entity, salesOrder, -1m);
            RecomputeSalesOrderStatus(salesOrder);
        }

        entity.Status = request.Status;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        salesOrder.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.status-updated", nameof(DeliveryOrder), entity.Id.ToString(), request.Status.ToString(), cancellationToken);
        return MapDetails(entity);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.DeliveryOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return false;
        if (entity.Status != DeliveryOrderStatus.Draft)
            throw new InvalidOperationException("Only draft delivery orders can be deleted.");

        dbContext.DeliveryOrders.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.deleted", nameof(DeliveryOrder), entity.Id.ToString(), entity.DeliveryOrderNumber, cancellationToken);
        return true;
    }

    private async Task<SalesOrder> ValidateCommonAsync(Guid? companyId, Guid salesOrderId, IReadOnlyCollection<DeliveryOrderLineRequest> lines, CancellationToken cancellationToken)
    {
        if (!companyId.HasValue || companyId == Guid.Empty)
            throw new InvalidOperationException("Company is required.");

        await EnsureCompanyAccessAsync(companyId.Value, cancellationToken);

        var salesOrder = await dbContext.SalesOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId.Value && x.Id == salesOrderId, cancellationToken)
            ?? throw new InvalidOperationException("Selected sales order was not found.");

        if (lines.Count == 0)
            throw new InvalidOperationException("At least one line is required.");

        var duplicateSourceIds = lines.GroupBy(x => x.SalesOrderLineId).Where(x => x.Count() > 1).Select(x => x.Key).ToList();
        if (duplicateSourceIds.Count > 0)
            throw new InvalidOperationException("Each sales order line can only be added once.");

        foreach (var requestLine in lines)
        {
            var sourceLine = salesOrder.Lines.FirstOrDefault(x => x.Id == requestLine.SalesOrderLineId)
                ?? throw new InvalidOperationException("Selected sales order line was not found.");

            var remainingQuantity = Math.Max(0m, sourceLine.Quantity - sourceLine.DeliveredQuantity);
            if (requestLine.Quantity > remainingQuantity)
                throw new InvalidOperationException($"Delivery quantity for '{sourceLine.Description}' exceeds the remaining quantity.");
        }

        return salesOrder;
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

    private static void ApplyLines(DeliveryOrder entity, SalesOrder salesOrder, IReadOnlyCollection<DeliveryOrderLineRequest> requests)
    {
        var subtotal = 0m;
        var tax = 0m;
        var sortOrder = 1;
        var lines = new List<DeliveryOrderLine>();

        foreach (var request in requests)
        {
            var sourceLine = salesOrder.Lines.First(x => x.Id == request.SalesOrderLineId);
            var lineSubtotal = Math.Round(request.Quantity * sourceLine.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (sourceLine.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);
            lines.Add(new DeliveryOrderLine
            {
                SortOrder = sortOrder++,
                SalesOrderLineId = sourceLine.Id,
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

    private static void ApplyDeliveryQuantities(DeliveryOrder entity, SalesOrder salesOrder, decimal direction)
    {
        foreach (var deliveryLine in entity.Lines)
        {
            var sourceLine = salesOrder.Lines.First(x => x.Id == deliveryLine.SalesOrderLineId);
            sourceLine.DeliveredQuantity = Math.Max(0m, sourceLine.DeliveredQuantity + (deliveryLine.Quantity * direction));
        }
    }

    private static void RecomputeSalesOrderStatus(SalesOrder salesOrder)
    {
        if (salesOrder.Status is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled)
            return;

        var anyDelivered = salesOrder.Lines.Any(x => x.DeliveredQuantity > 0m);
        var fullyDelivered = salesOrder.Lines.Count > 0 && salesOrder.Lines.All(x => x.DeliveredQuantity >= x.Quantity);

        salesOrder.Status = fullyDelivered
            ? SalesOrderStatus.FullyDelivered
            : anyDelivered
                ? SalesOrderStatus.PartiallyDelivered
                : salesOrder.Status == SalesOrderStatus.Draft
                    ? SalesOrderStatus.Draft
                    : SalesOrderStatus.Confirmed;
    }

    private static void EnsureStatusTransition(DeliveryOrderStatus current, DeliveryOrderStatus next)
    {
        if (current == next) return;
        if (current == DeliveryOrderStatus.Cancelled)
            throw new InvalidOperationException("Cancelled delivery orders cannot change status.");

        var valid = current switch
        {
            DeliveryOrderStatus.Draft => next is DeliveryOrderStatus.Delivered or DeliveryOrderStatus.Cancelled,
            DeliveryOrderStatus.Delivered => next == DeliveryOrderStatus.Cancelled,
            _ => false,
        };

        if (!valid)
            throw new InvalidOperationException("This delivery order status transition is not allowed yet.");
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery()
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        return dbContext.Companies.Where(x => x.Id == companyId).Select(x => x.Id);
    }

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = companyId == (currentUserService.CompanyId ?? throw new UnauthorizedAccessException());
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private async Task<string> GenerateDeliveryOrderNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.DeliveryOrders.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"DO-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
    }

    private async Task<DeliveryOrder> LoadOrThrowAsync(Guid id, CancellationToken cancellationToken) =>
        await dbContext.DeliveryOrders.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == id, cancellationToken);

    private static DeliveryOrderListItemDto MapList(DeliveryOrder entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.DeliveryOrderNumber, entity.SalesOrderId, entity.SalesOrderNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.Currency, entity.TotalAmount, entity.Status);

    private static DeliveryOrderDetailsDto MapDetails(DeliveryOrder entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.DeliveryOrderNumber, entity.SalesOrderId, entity.SalesOrderNumber, entity.WarehouseId, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList());

    private static SalesDocumentLineDto MapLine(DeliveryOrderLine line) =>
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, null, line.SalesOrderLineId, 0m, line.InvoicedQuantity);
}
