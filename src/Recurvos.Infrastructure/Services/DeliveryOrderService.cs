using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using System.Data;
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
        var items = dbContext.DeliveryOrders.Include(x => x.Company).Include(x => x.Lines)
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
        if (entity is null) return null;
        var invoices = await dbContext.Invoices
            .Where(invoice => invoice.CompanyId == entity.CompanyId && invoice.DeliveryOrderId == entity.Id)
            .OrderByDescending(invoice => invoice.IssueDateUtc)
            .Select(invoice => new SalesInvoiceLinkDto(invoice.Id, invoice.InvoiceNumber, invoice.IssueDateUtc, invoice.Status, invoice.Total, invoice.Currency, invoice.DeliveryOrderId))
            .ToListAsync(cancellationToken);
        return MapDetails(entity, invoices);
    }

    public async Task<DeliveryOrderDetailsDto> CreateAsync(DeliveryOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        await using var transaction = dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        if (!request.SalesOrderId.HasValue)
            return await CreateDirectAsync(request, transaction, cancellationToken);

        var salesOrder = await ValidateCommonAsync(request.CompanyId, request.SalesOrderId.Value, request.Lines, null, cancellationToken);
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
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.created", nameof(DeliveryOrder), entity.Id.ToString(), entity.DeliveryOrderNumber, cancellationToken);
        return MapDetails(await LoadOrThrowAsync(entity.Id, cancellationToken));
    }

    public async Task<DeliveryOrderDetailsDto?> UpdateAsync(Guid id, DeliveryOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.DeliveryOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (entity.Status == DeliveryOrderStatus.Cancelled)
            throw new InvalidOperationException("Cancelled delivery orders cannot be edited.");
        await EnsureDeliveryAmendmentDoesNotExceedInvoicedAsync(entity, request.Lines, cancellationToken);

        if (!entity.SalesOrderId.HasValue && !request.SalesOrderId.HasValue)
            return await UpdateDirectAsync(entity, request, cancellationToken);
        if (!request.SalesOrderId.HasValue) throw new InvalidOperationException("Delivery order source cannot be changed.");
        var salesOrder = await ValidateCommonAsync(request.CompanyId, request.SalesOrderId.Value, request.Lines, entity.Id, cancellationToken);
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

    private async Task<DeliveryOrderDetailsDto> CreateDirectAsync(DeliveryOrderUpsertRequest request, IDbContextTransaction? transaction, CancellationToken cancellationToken)
    {
        var (companyId, contact) = await ValidateDirectHeaderAsync(request, cancellationToken);
        var warehouseId = await ValidateWarehouseAsync(companyId, request.WarehouseId, cancellationToken);
        var currency = await ValidateCurrencyAsync(companyId, request.Currency, cancellationToken);
        var entity = new DeliveryOrder
        {
            CompanyId = companyId, DeliveryOrderNumber = await GenerateDeliveryOrderNumberAsync(companyId, cancellationToken), WarehouseId = warehouseId,
            ContactId = contact.Id, ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            ContactEmail = contact.Email, ContactPhoneNumber = contact.PhoneNumber, Currency = currency,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(), ReferenceNo = request.ReferenceNo.Trim(), Notes = request.Notes.Trim(),
        };
        await ApplyDirectLinesAsync(entity, companyId, request.Lines, cancellationToken);
        dbContext.DeliveryOrders.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.created", nameof(DeliveryOrder), entity.Id.ToString(), entity.DeliveryOrderNumber, cancellationToken);
        return MapDetails(await LoadOrThrowAsync(entity.Id, cancellationToken));
    }

    private async Task<DeliveryOrderDetailsDto> UpdateDirectAsync(DeliveryOrder entity, DeliveryOrderUpsertRequest request, CancellationToken cancellationToken)
    {
        var (companyId, contact) = await ValidateDirectHeaderAsync(request, cancellationToken);
        if (entity.CompanyId != companyId) throw new InvalidOperationException("Delivery order company cannot be changed.");
        entity.WarehouseId = await ValidateWarehouseAsync(companyId, request.WarehouseId, cancellationToken);
        entity.Currency = await ValidateCurrencyAsync(companyId, request.Currency, cancellationToken);
        entity.ContactId = contact.Id; entity.ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName;
        entity.ContactEmail = contact.Email; entity.ContactPhoneNumber = contact.PhoneNumber; entity.DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime();
        entity.ReferenceNo = request.ReferenceNo.Trim(); entity.Notes = request.Notes.Trim(); entity.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.DeliveryOrderLines.RemoveRange(entity.Lines); entity.Lines.Clear();
        await ApplyDirectLinesAsync(entity, companyId, request.Lines, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.updated", nameof(DeliveryOrder), entity.Id.ToString(), entity.DeliveryOrderNumber, cancellationToken);
        return MapDetails(await LoadOrThrowAsync(entity.Id, cancellationToken));
    }

    private async Task<(Guid CompanyId, Customer Contact)> ValidateDirectHeaderAsync(DeliveryOrderUpsertRequest request, CancellationToken cancellationToken)
    {
        if (!request.CompanyId.HasValue || request.CompanyId == Guid.Empty) throw new InvalidOperationException("Company is required.");
        await EnsureCompanyAccessAsync(request.CompanyId.Value, cancellationToken);
        var contact = await dbContext.Customers.FirstOrDefaultAsync(x => x.Id == request.ContactId && x.CompanyId == request.CompanyId.Value, cancellationToken)
            ?? throw new InvalidOperationException("Select a valid contact.");
        return (request.CompanyId.Value, contact);
    }

    private async Task ApplyDirectLinesAsync(DeliveryOrder entity, Guid companyId, IReadOnlyCollection<DeliveryOrderLineRequest> requests, CancellationToken cancellationToken)
    {
        if (requests.Count == 0) throw new InvalidOperationException("At least one line is required.");
        var productIds = requests.Where(x => x.ProductId.HasValue).Select(x => x.ProductId!.Value).Distinct().ToList();
        var products = await dbContext.Products.Where(x => x.CompanyId == companyId && x.IsActive && productIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var lines = new List<DeliveryOrderLine>(); var subtotal = 0m; var tax = 0m; var sortOrder = 1;
        foreach (var request in requests)
        {
            if (request.Quantity <= 0m || string.IsNullOrWhiteSpace(request.Description)) throw new InvalidOperationException("Each delivery item needs a description and quantity.");
            if (request.ProductId.HasValue && !products.ContainsKey(request.ProductId.Value)) throw new InvalidOperationException("Selected product was not found.");
            var lineSubtotal = Math.Round(request.Quantity * request.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * request.TaxRate / 100m, 2, MidpointRounding.AwayFromZero);
            var product = request.ProductId.HasValue ? products[request.ProductId.Value] : null;
            lines.Add(new DeliveryOrderLine { SortOrder = sortOrder++, ProductId = request.ProductId, TaxCodeId = request.TaxCodeId, ProductNameSnapshot = product?.Name ?? request.Description.Trim(), Description = request.Description.Trim(), Quantity = request.Quantity, UnitPrice = request.UnitPrice, TaxRate = request.TaxRate, TaxAmount = lineTax, LineTotal = lineSubtotal + lineTax });
            subtotal += lineSubtotal; tax += lineTax;
        }
        entity.Lines = lines; entity.Subtotal = subtotal; entity.TaxAmount = tax; entity.TotalAmount = subtotal + tax;
    }

    public async Task<DeliveryOrderDetailsDto?> SetStatusAsync(Guid id, DeliveryOrderStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.DeliveryOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;

        var salesOrder = entity.SalesOrderId.HasValue
            ? await dbContext.SalesOrders.Include(x => x.Lines).FirstAsync(x => x.Id == entity.SalesOrderId.Value, cancellationToken)
            : null;

        EnsureStatusTransition(entity.Status, request.Status);

        if (entity.Status == DeliveryOrderStatus.Draft && request.Status == DeliveryOrderStatus.Delivered)
        {
            if (salesOrder is not null) { ApplyDeliveryQuantities(entity, salesOrder, 1m); RecomputeSalesOrderStatus(salesOrder); }
        }
        else if ((entity.Status is DeliveryOrderStatus.Delivered or DeliveryOrderStatus.PartiallyInvoiced or DeliveryOrderStatus.FullyInvoiced)
                 && request.Status == DeliveryOrderStatus.Cancelled)
        {
            if (salesOrder is not null) { ApplyDeliveryQuantities(entity, salesOrder, -1m); RecomputeSalesOrderStatus(salesOrder); }
        }

        entity.Status = request.Status;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        if (salesOrder is not null) salesOrder.UpdatedAtUtc = DateTime.UtcNow;
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

    private async Task<SalesOrder> ValidateCommonAsync(Guid? companyId, Guid salesOrderId, IReadOnlyCollection<DeliveryOrderLineRequest> lines, Guid? currentDeliveryOrderId, CancellationToken cancellationToken)
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

        var activeDeliveredBySalesOrderLine = await dbContext.DeliveryOrderLines
            .Where(line => line.SalesOrderLineId.HasValue && line.DeliveryOrder!.CompanyId == companyId.Value
                && line.DeliveryOrder.SalesOrderId == salesOrder.Id
                && line.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled
                && (!currentDeliveryOrderId.HasValue || line.DeliveryOrderId != currentDeliveryOrderId.Value))
            .GroupBy(line => line.SalesOrderLineId!.Value)
            .Select(group => new { SalesOrderLineId = group.Key, Quantity = group.Sum(line => line.Quantity) })
            .ToDictionaryAsync(item => item.SalesOrderLineId, item => item.Quantity, cancellationToken);

        foreach (var requestLine in lines)
        {
            if (requestLine.Quantity <= 0m)
                throw new InvalidOperationException("Delivery quantity must be greater than zero.");
            var sourceLine = salesOrder.Lines.FirstOrDefault(x => x.Id == requestLine.SalesOrderLineId)
                ?? throw new InvalidOperationException("Selected sales order line was not found.");

            var remainingQuantity = Math.Max(0m, sourceLine.Quantity - activeDeliveredBySalesOrderLine.GetValueOrDefault(sourceLine.Id));
            if (requestLine.Quantity > remainingQuantity)
                throw new InvalidOperationException($"The available quantity has changed. Delivery quantity for '{sourceLine.Description}' exceeds the remaining quantity ({remainingQuantity}).");
        }

        return salesOrder;
    }

    private async Task EnsureDeliveryAmendmentDoesNotExceedInvoicedAsync(DeliveryOrder deliveryOrder, IReadOnlyCollection<DeliveryOrderLineRequest> requests, CancellationToken cancellationToken)
    {
        var invoiced = await dbContext.InvoiceLineItems
            .Where(x => x.Invoice!.DeliveryOrderId == deliveryOrder.Id && x.Invoice.Status != InvoiceStatus.Voided && x.DeliveryOrderLineId.HasValue)
            .GroupBy(x => x.DeliveryOrderLineId!.Value)
            .Select(x => new { LineId = x.Key, Quantity = x.Sum(y => y.Quantity) })
            .ToDictionaryAsync(x => x.LineId, x => x.Quantity, cancellationToken);
        foreach (var line in deliveryOrder.Lines.Where(x => invoiced.ContainsKey(x.Id)))
        {
            var amendment = requests.SingleOrDefault(x => x.LineId == line.Id);
            var used = invoiced[line.Id];
            if (amendment is null)
                throw new InvalidOperationException($"Line '{line.Description}' cannot be deleted because {used} units have already been invoiced.");
            if (amendment.Quantity < used)
                throw new InvalidOperationException($"Quantity for '{line.Description}' cannot be reduced below {used} because {used} units have already been invoiced.");
        }
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
            if (!deliveryLine.SalesOrderLineId.HasValue) continue;
            var sourceLine = salesOrder.Lines.First(x => x.Id == deliveryLine.SalesOrderLineId.Value);
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
            DeliveryOrderStatus.Delivered or DeliveryOrderStatus.PartiallyInvoiced or DeliveryOrderStatus.FullyInvoiced => next == DeliveryOrderStatus.Cancelled,
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
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.DeliveryOrderNumber, entity.SalesOrderId, entity.SalesQuotationId, entity.SalesOrderNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.Currency, entity.TotalAmount, entity.Status, entity.Lines.Any(line => line.Quantity > line.InvoicedQuantity));

    internal static DeliveryOrderDetailsDto MapDetails(DeliveryOrder entity, IReadOnlyCollection<SalesInvoiceLinkDto>? invoices = null) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.DeliveryOrderNumber, entity.SalesOrderId, entity.SalesQuotationId, entity.SalesOrderNumber, entity.WarehouseId, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList(), invoices ?? []);

    private static SalesDocumentLineDto MapLine(DeliveryOrderLine line) =>
        // A delivery-order line is itself the fulfilment record; it does not need a
        // further downstream delivery document to be considered delivered.
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, line.SourceQuotationLineId, line.SalesOrderLineId, line.Quantity, line.InvoicedQuantity);
}
