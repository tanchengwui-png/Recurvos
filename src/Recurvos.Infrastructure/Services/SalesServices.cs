using Microsoft.EntityFrameworkCore;
using System.Data;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Sales;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class SalesQuotationService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : ISalesQuotationService
{
    public async Task<IReadOnlyCollection<SalesQuotationListItemDto>> GetAsync(SalesQuotationListQuery query, CancellationToken cancellationToken = default)
    {
        var items = dbContext.SalesQuotations
            .Include(x => x.Lines)
            .Include(x => x.Company)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            items = items.Where(x => x.QuotationNumber.Contains(term) || x.ContactName.Contains(term) || x.ReferenceNo.Contains(term));
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

        var quotationIds = result.Select(x => x.Id).ToList();
        var convertedByQuotationLine = await GetConsumedQuantitiesAsync(quotationIds, cancellationToken);
        return result.Select(entity => MapList(entity, convertedByQuotationLine.GetValueOrDefault(entity.Id))).ToList();
    }

    public async Task<SalesQuotationDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesQuotations
            .Include(x => x.Lines)
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;

        var quantityByQuotationLine = (await GetConsumedQuantitiesAsync([entity.Id], cancellationToken)).GetValueOrDefault(entity.Id);
        var deliveredQuantityByQuotationLine = await GetDeliveredQuantitiesAsync(entity.Id, cancellationToken);
        var invoicedQuantityByQuotationLine = await GetInvoicedQuantitiesAsync(entity.Id, cancellationToken);

        var salesOrders = await dbContext.SalesOrders
            .Where(order => order.SalesQuotationId == entity.Id)
            .OrderBy(order => order.DocumentDateUtc)
            .ThenBy(order => order.CreatedAtUtc)
            .Select(order => new SalesOrderLinkDto(order.Id, order.SalesOrderNumber, order.DocumentDateUtc, order.Status, order.TotalAmount, order.Currency))
            .ToListAsync(cancellationToken);

        return MapDetails(entity, quantityByQuotationLine, deliveredQuantityByQuotationLine, invoicedQuantityByQuotationLine, salesOrders);
    }

    public async Task<SalesQuotationDetailsDto> CreateAsync(SalesQuotationUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.DocumentDateUtc, request.ExpiryDateUtc, request.Lines, cancellationToken);
        var contact = await LoadContactAsync(request.ContactId, cancellationToken);
        var currency = await NormalizeAndValidateCurrencyAsync(companyId, request.Currency, contact.Currency, cancellationToken);
        var entity = new SalesQuotation
        {
            CompanyId = companyId,
            QuotationNumber = await GenerateQuotationNumberAsync(companyId, cancellationToken),
            ContactId = contact.Id,
            ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            ContactEmail = contact.Email,
            ContactPhoneNumber = contact.PhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            ExpiryDateUtc = request.ExpiryDateUtc?.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
        };
        await ApplyLinesAsync(entity, request.Lines, cancellationToken);
        dbContext.SalesQuotations.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-quotation.created", nameof(SalesQuotation), entity.Id.ToString(), entity.QuotationNumber, cancellationToken);
        return MapDetails(await LoadQuotationOrThrowAsync(entity.Id, cancellationToken));
    }

    public async Task<SalesQuotationDetailsDto?> UpdateAsync(Guid id, SalesQuotationUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesQuotations.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        var hasActiveChildren = await dbContext.SalesOrders.AnyAsync(x => x.SalesQuotationId == entity.Id && x.Status != SalesOrderStatus.Cancelled, cancellationToken)
            || await dbContext.DeliveryOrders.AnyAsync(x => x.SalesQuotationId == entity.Id && x.Status != DeliveryOrderStatus.Cancelled, cancellationToken);
        if (hasActiveChildren)
            throw new InvalidOperationException("Converted quotations cannot be edited.");

        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.DocumentDateUtc, request.ExpiryDateUtc, request.Lines, cancellationToken);
        if (entity.CompanyId != companyId)
            throw new InvalidOperationException("Quotation company cannot be changed.");

        var contact = await LoadContactAsync(request.ContactId, cancellationToken);
        var currency = await NormalizeAndValidateCurrencyAsync(companyId, request.Currency, contact.Currency, cancellationToken);
        entity.ContactId = contact.Id;
        entity.ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName;
        entity.ContactEmail = contact.Email;
        entity.ContactPhoneNumber = contact.PhoneNumber;
        entity.DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime();
        entity.ExpiryDateUtc = request.ExpiryDateUtc?.ToUniversalTime();
        entity.Currency = currency;
        entity.ReferenceNo = request.ReferenceNo.Trim();
        entity.Notes = request.Notes.Trim();
        entity.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.SalesQuotationLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        await ApplyLinesAsync(entity, request.Lines, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-quotation.updated", nameof(SalesQuotation), entity.Id.ToString(), entity.QuotationNumber, cancellationToken);
        return MapDetails(await LoadQuotationOrThrowAsync(entity.Id, cancellationToken));
    }

    public async Task<SalesQuotationDetailsDto?> SetStatusAsync(Guid id, SalesQuotationStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesQuotations.Include(x => x.Lines)
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        EnsureQuotationStatusTransition(entity.Status, request.Status);
        entity.Status = request.Status;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-quotation.status-updated", nameof(SalesQuotation), entity.Id.ToString(), request.Status.ToString(), cancellationToken);
        return MapDetails(entity);
    }

    public async Task<SalesOrderDetailsDto?> ConvertToSalesOrderAsync(Guid id, ConvertQuotationToSalesOrderRequest request, CancellationToken cancellationToken = default)
    {
        await using var transaction = dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        var quotation = await dbContext.SalesQuotations.Include(x => x.Lines).Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (quotation is null) return null;
        if (quotation.Status != SalesQuotationStatus.Accepted)
            throw new InvalidOperationException("Mark this quotation as accepted before converting it to a sales order.");
        if (request.Lines.Count == 0)
            throw new InvalidOperationException("Select at least one quotation line to convert.");
        if (request.Lines.GroupBy(line => line.SalesQuotationLineId).Any(group => group.Count() > 1))
            throw new InvalidOperationException("Each quotation line can only be selected once.");

        var activeConverted = await dbContext.SalesOrderLines
            .Where(line => line.SalesOrder!.SalesQuotationId == quotation.Id
                && line.SalesOrder.Status != SalesOrderStatus.Cancelled
                && line.SourceQuotationLineId.HasValue)
            .GroupBy(line => line.SourceQuotationLineId!.Value)
            .Select(group => new { SourceQuotationLineId = group.Key, Quantity = group.Sum(line => line.Quantity) })
            .ToDictionaryAsync(item => item.SourceQuotationLineId, item => item.Quantity, cancellationToken);
        var activeDirectDelivery = await dbContext.DeliveryOrderLines
            .Where(line => line.DeliveryOrder!.SalesQuotationId == quotation.Id
                && line.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled
                && line.SourceQuotationLineId.HasValue)
            .GroupBy(line => line.SourceQuotationLineId!.Value)
            .Select(group => new { SourceQuotationLineId = group.Key, Quantity = group.Sum(line => line.Quantity) })
            .ToDictionaryAsync(item => item.SourceQuotationLineId, item => item.Quantity, cancellationToken);

        var selectedLines = new List<(SalesQuotationLine Line, decimal Quantity)>();
        foreach (var selection in request.Lines)
        {
            var line = quotation.Lines.SingleOrDefault(line => line.Id == selection.SalesQuotationLineId)
                ?? throw new InvalidOperationException("A selected quotation line was not found.");
            var remaining = line.Quantity - activeConverted.GetValueOrDefault(line.Id) - activeDirectDelivery.GetValueOrDefault(line.Id);
            if (selection.Quantity <= 0)
                throw new InvalidOperationException($"Cannot convert a non-positive quantity of {line.Description}.");
            if (selection.Quantity > remaining)
                throw new InvalidOperationException(ConversionCapacityError(selection.Quantity, line.Description, Math.Max(0m, remaining), quotation.QuotationNumber));
            selectedLines.Add((line, selection.Quantity));
        }

        var order = new SalesOrder
        {
            CompanyId = quotation.CompanyId,
            SalesOrderNumber = await GenerateSalesOrderNumberAsync(quotation.CompanyId, cancellationToken),
            ContactId = quotation.ContactId,
            ContactName = quotation.ContactName,
            ContactEmail = quotation.ContactEmail,
            ContactPhoneNumber = quotation.ContactPhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            Currency = quotation.Currency,
            ReferenceNo = string.IsNullOrWhiteSpace(request.ReferenceNo) ? quotation.ReferenceNo : request.ReferenceNo.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? quotation.Notes : request.Notes.Trim(),
            SalesQuotationId = quotation.Id,
            Status = SalesOrderStatus.Draft,
            Lines = selectedLines
                .OrderBy(x => x.Line.SortOrder)
                .Select((selection, index) => new SalesOrderLine
                {
                    SortOrder = index + 1,
                    ProductId = selection.Line.ProductId,
                    TaxCodeId = selection.Line.TaxCodeId,
                    ProductNameSnapshot = selection.Line.ProductNameSnapshot,
                    Description = selection.Line.Description,
                    Quantity = selection.Quantity,
                    UnitPrice = selection.Line.UnitPrice,
                    TaxRate = selection.Line.TaxRate,
                    TaxAmount = Math.Round(selection.Quantity * selection.Line.UnitPrice * (selection.Line.TaxRate / 100m), 2, MidpointRounding.AwayFromZero),
                    LineTotal = Math.Round(selection.Quantity * selection.Line.UnitPrice, 2, MidpointRounding.AwayFromZero) + Math.Round(selection.Quantity * selection.Line.UnitPrice * (selection.Line.TaxRate / 100m), 2, MidpointRounding.AwayFromZero),
                    SourceQuotationLineId = selection.Line.Id,
                }).ToList(),
        };
        order.Subtotal = order.Lines.Sum(line => Math.Round(line.Quantity * line.UnitPrice, 2, MidpointRounding.AwayFromZero));
        order.TaxAmount = order.Lines.Sum(line => line.TaxAmount);
        order.TotalAmount = order.Subtotal + order.TaxAmount;
        quotation.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.SalesOrders.Add(order);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("sales-quotation.converted", nameof(SalesQuotation), quotation.Id.ToString(), order.SalesOrderNumber, cancellationToken);
        await auditService.WriteAsync("sales-order.created", nameof(SalesOrder), order.Id.ToString(), $"from={quotation.QuotationNumber}", cancellationToken);
        return SalesOrderService.MapDetails(await dbContext.SalesOrders.Include(x => x.Lines).Include(x => x.Company).FirstAsync(x => x.Id == order.Id, cancellationToken));
    }

    public async Task<DeliveryOrderDetailsDto?> ConvertToDeliveryOrderAsync(Guid id, ConvertQuotationToDeliveryOrderRequest request, CancellationToken cancellationToken = default)
    {
        await using var transaction = dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        var quotation = await dbContext.SalesQuotations.Include(x => x.Lines).Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (quotation is null) return null;
        if (quotation.Status != SalesQuotationStatus.Accepted)
            throw new InvalidOperationException("Mark this quotation as accepted before creating a delivery order.");
        if (request.Lines.Count == 0 || request.Lines.GroupBy(line => line.SalesQuotationLineId).Any(group => group.Count() > 1))
            throw new InvalidOperationException("Select at least one quotation line to deliver.");
        var warehouseExists = await dbContext.Warehouses.AnyAsync(x => x.CompanyId == quotation.CompanyId && x.Id == request.WarehouseId && x.IsActive, cancellationToken);
        if (!warehouseExists) throw new InvalidOperationException("Select a valid warehouse.");

        var consumed = await dbContext.SalesOrderLines
            .Where(line => line.SalesOrder!.SalesQuotationId == quotation.Id && line.SalesOrder.Status != SalesOrderStatus.Cancelled && line.SourceQuotationLineId.HasValue)
            .Select(line => new { SourceQuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity })
            .Concat(dbContext.DeliveryOrderLines
                .Where(line => line.DeliveryOrder!.SalesQuotationId == quotation.Id && line.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled && line.SourceQuotationLineId.HasValue)
                .Select(line => new { SourceQuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity }))
            .GroupBy(line => line.SourceQuotationLineId)
            .Select(group => new { SourceQuotationLineId = group.Key, Quantity = group.Sum(line => line.Quantity) })
            .ToDictionaryAsync(item => item.SourceQuotationLineId, item => item.Quantity, cancellationToken);

        var selected = new List<(SalesQuotationLine Line, decimal Quantity)>();
        foreach (var selection in request.Lines)
        {
            var line = quotation.Lines.SingleOrDefault(line => line.Id == selection.SalesQuotationLineId)
                ?? throw new InvalidOperationException("A selected quotation line was not found.");
            var remaining = line.Quantity - consumed.GetValueOrDefault(line.Id);
            if (selection.Quantity <= 0)
                throw new InvalidOperationException($"Cannot convert a non-positive quantity of {line.Description}.");
            if (selection.Quantity > remaining)
                throw new InvalidOperationException(ConversionCapacityError(selection.Quantity, line.Description, Math.Max(0m, remaining), quotation.QuotationNumber));
            selected.Add((line, selection.Quantity));
        }

        var count = await dbContext.DeliveryOrders.CountAsync(x => x.CompanyId == quotation.CompanyId, cancellationToken);
        var deliveryOrder = new DeliveryOrder
        {
            CompanyId = quotation.CompanyId,
            DeliveryOrderNumber = $"DO-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}",
            SalesQuotationId = quotation.Id,
            WarehouseId = request.WarehouseId,
            ContactId = quotation.ContactId,
            ContactName = quotation.ContactName,
            ContactEmail = quotation.ContactEmail,
            ContactPhoneNumber = quotation.ContactPhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            Currency = quotation.Currency,
            ReferenceNo = string.IsNullOrWhiteSpace(request.ReferenceNo) ? quotation.ReferenceNo : request.ReferenceNo.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? quotation.Notes : request.Notes.Trim(),
            Lines = selected.Select((selection, index) => {
                var subtotal = Math.Round(selection.Quantity * selection.Line.UnitPrice, 2, MidpointRounding.AwayFromZero);
                var tax = Math.Round(subtotal * (selection.Line.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);
                return new DeliveryOrderLine { SortOrder = index + 1, SourceQuotationLineId = selection.Line.Id, ProductId = selection.Line.ProductId, TaxCodeId = selection.Line.TaxCodeId, ProductNameSnapshot = selection.Line.ProductNameSnapshot, Description = selection.Line.Description, Quantity = selection.Quantity, UnitPrice = selection.Line.UnitPrice, TaxRate = selection.Line.TaxRate, TaxAmount = tax, LineTotal = subtotal + tax };
            }).ToList(),
        };
        deliveryOrder.Subtotal = deliveryOrder.Lines.Sum(line => Math.Round(line.Quantity * line.UnitPrice, 2, MidpointRounding.AwayFromZero));
        deliveryOrder.TaxAmount = deliveryOrder.Lines.Sum(line => line.TaxAmount);
        deliveryOrder.TotalAmount = deliveryOrder.Subtotal + deliveryOrder.TaxAmount;
        dbContext.DeliveryOrders.Add(deliveryOrder);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("delivery-order.created-from-quotation", nameof(DeliveryOrder), deliveryOrder.Id.ToString(), quotation.QuotationNumber, cancellationToken);
        return DeliveryOrderService.MapDetails(await dbContext.DeliveryOrders.Include(x => x.Lines).Include(x => x.Company).FirstAsync(x => x.Id == deliveryOrder.Id, cancellationToken));
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesQuotations.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return false;
        if (entity.Status != SalesQuotationStatus.Draft)
            throw new InvalidOperationException("Only draft quotations can be deleted.");
        dbContext.SalesQuotations.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-quotation.deleted", nameof(SalesQuotation), entity.Id.ToString(), entity.QuotationNumber, cancellationToken);
        return true;
    }

    private async Task<Guid> ValidateCommonAsync(Guid? companyId, Guid contactId, DateTime documentDateUtc, DateTime? expiryDateUtc, IReadOnlyCollection<SalesDocumentLineRequest> lines, CancellationToken cancellationToken)
    {
        if (!companyId.HasValue || companyId == Guid.Empty)
            throw new InvalidOperationException("Company is required.");
        await EnsureCompanyAccessAsync(companyId.Value, cancellationToken);
        _ = await LoadContactAsync(contactId, cancellationToken);
        if (expiryDateUtc.HasValue && expiryDateUtc.Value.Date < documentDateUtc.Date)
            throw new InvalidOperationException("Expiry date cannot be before document date.");
        ValidateLines(lines);
        return companyId.Value;
    }

    private static void ValidateLines(IReadOnlyCollection<SalesDocumentLineRequest> lines)
    {
        if (lines.Count == 0)
            throw new InvalidOperationException("At least one line is required.");
        if (lines.Any(x => string.IsNullOrWhiteSpace(x.Description)))
            throw new InvalidOperationException("Each line requires a description.");
        if (lines.Any(x => !x.TaxCodeId.HasValue || x.TaxCodeId == Guid.Empty))
            throw new InvalidOperationException("Select a tax code for each line.");
    }

    private async Task ApplyLinesAsync(SalesQuotation entity, IReadOnlyCollection<SalesDocumentLineRequest> requests, CancellationToken cancellationToken)
    {
        var subtotal = 0m;
        var tax = 0m;
        var lines = new List<SalesQuotationLine>();
        var order = 1;
        foreach (var request in requests)
        {
            var taxCode = await LoadTaxCodeAsync(entity.CompanyId, request.TaxCodeId, cancellationToken);
            var taxRate = taxCode?.Rate ?? request.TaxRate;
            var lineSubtotal = Math.Round(request.Quantity * request.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (taxRate / 100m), 2, MidpointRounding.AwayFromZero);
            var productName = ResolveProductSnapshot(request.ProductId, entity.CompanyId, cancellationToken);
            lines.Add(new SalesQuotationLine
            {
                SortOrder = order++,
                ProductId = request.ProductId,
                TaxCodeId = taxCode?.Id,
                ProductNameSnapshot = productName,
                Description = request.Description.Trim(),
                Quantity = request.Quantity,
                UnitPrice = request.UnitPrice,
                TaxRate = taxRate,
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

    private string ResolveProductSnapshot(Guid? productId, Guid companyId, CancellationToken cancellationToken)
    {
        if (!productId.HasValue) return string.Empty;
        var product = dbContext.Products.FirstOrDefault(x => x.CompanyId == companyId && x.Id == productId.Value);
        if (product is null) throw new InvalidOperationException("Selected product was not found.");
        return product.Name;
    }

    private async Task<Customer> LoadContactAsync(Guid contactId, CancellationToken cancellationToken) =>
        await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == contactId, cancellationToken)
        ?? throw new InvalidOperationException("Contact not found.");

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = companyId == GetCompanyId();
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.Id == GetCompanyId()).Select(x => x.Id);

    private async Task<string> GenerateQuotationNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.SalesQuotations.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"QT-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
    }

    private async Task<string> GenerateSalesOrderNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.SalesOrders.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"SO-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
    }

    private async Task<string> ResolveCurrencyAsync(Guid companyId, string? requestCurrency, string? contactCurrency, CancellationToken cancellationToken)
    {
        var value = string.IsNullOrWhiteSpace(requestCurrency) ? contactCurrency : requestCurrency;
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value.Trim().ToUpperInvariant();
        }

        var companyCurrency = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => x.Currency)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(companyCurrency) ? string.Empty : companyCurrency.Trim().ToUpperInvariant();
    }

    private async Task<string> NormalizeAndValidateCurrencyAsync(Guid companyId, string? requestCurrency, string? contactCurrency, CancellationToken cancellationToken)
    {
        var currency = await ResolveCurrencyAsync(companyId, requestCurrency, contactCurrency, cancellationToken);
        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new InvalidOperationException("Select a valid currency.");
        }

        var exists = await dbContext.CurrencyDefinitions.AnyAsync(
            x => x.CompanyId == companyId && x.IsActive && x.Code == currency,
            cancellationToken);
        if (!exists)
        {
            throw new InvalidOperationException("Select a valid currency.");
        }

        return currency;
    }

    private async Task<TaxCode?> LoadTaxCodeAsync(Guid companyId, Guid? taxCodeId, CancellationToken cancellationToken)
    {
        if (!taxCodeId.HasValue || taxCodeId == Guid.Empty)
        {
            return null;
        }

        return await dbContext.TaxCodes.FirstOrDefaultAsync(
                   x => x.CompanyId == companyId
                     && x.Id == taxCodeId.Value
                     && x.IsActive
                     && (x.Scope == TaxScope.Sales || x.Scope == TaxScope.Both),
                   cancellationToken)
               ?? throw new InvalidOperationException("Select a valid tax code.");
    }

    private async Task<SalesQuotation> LoadQuotationOrThrowAsync(Guid id, CancellationToken cancellationToken) =>
        await dbContext.SalesQuotations.Include(x => x.Lines).Include(x => x.Company).FirstAsync(x => x.Id == id, cancellationToken);

    private static void EnsureQuotationStatusTransition(SalesQuotationStatus current, SalesQuotationStatus next)
    {
        if (current == next) return;
        if (current == SalesQuotationStatus.Converted || current == SalesQuotationStatus.Rejected || current == SalesQuotationStatus.Expired)
            throw new InvalidOperationException("This quotation status cannot be changed.");
        if (next == SalesQuotationStatus.Converted)
            throw new InvalidOperationException("Use convert to sales order instead.");

        var valid = current switch
        {
            SalesQuotationStatus.Draft => next == SalesQuotationStatus.Sent,
            SalesQuotationStatus.Sent => next is SalesQuotationStatus.Accepted or SalesQuotationStatus.Rejected or SalesQuotationStatus.Expired,
            SalesQuotationStatus.Accepted => false,
            _ => false,
        };

        if (!valid)
            throw new InvalidOperationException("This quotation status cannot be changed.");
    }

    private async Task<Dictionary<Guid, Dictionary<Guid, decimal>>> GetConsumedQuantitiesAsync(IReadOnlyCollection<Guid> quotationIds, CancellationToken cancellationToken)
    {
        if (quotationIds.Count == 0) return [];
        var salesOrderLines = await dbContext.SalesOrderLines
            .Where(line => quotationIds.Contains(line.SalesOrder!.SalesQuotationId!.Value)
                && line.SalesOrder.Status != SalesOrderStatus.Cancelled
                && line.SourceQuotationLineId.HasValue)
            .Select(line => new { QuotationId = line.SalesOrder!.SalesQuotationId!.Value, QuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity })
            .ToListAsync(cancellationToken);
        var deliveryOrderLines = await dbContext.DeliveryOrderLines
            .Where(line => quotationIds.Contains(line.DeliveryOrder!.SalesQuotationId!.Value)
                && line.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled
                && line.SourceQuotationLineId.HasValue)
            .Select(line => new { QuotationId = line.DeliveryOrder!.SalesQuotationId!.Value, QuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity })
            .ToListAsync(cancellationToken);

        return salesOrderLines.Select(line => (line.QuotationId, line.QuotationLineId, line.Quantity))
            .Concat(deliveryOrderLines.Select(line => (line.QuotationId, line.QuotationLineId, line.Quantity)))
            .GroupBy(line => line.QuotationId)
            .ToDictionary(
                group => group.Key,
                group => group.GroupBy(line => line.QuotationLineId).ToDictionary(lines => lines.Key, lines => lines.Sum(line => line.Quantity)));
    }

    private async Task<Dictionary<Guid, decimal>> GetDeliveredQuantitiesAsync(Guid quotationId, CancellationToken cancellationToken)
    {
        var directDeliveries = await dbContext.DeliveryOrderLines
            .Where(line => line.DeliveryOrder!.SalesQuotationId == quotationId
                && line.DeliveryOrder.Status != DeliveryOrderStatus.Draft
                && line.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled
                && line.SourceQuotationLineId.HasValue)
            .Select(line => new { QuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity })
            .ToListAsync(cancellationToken);
        var orderDeliveries = await dbContext.DeliveryOrderLines
            .Join(dbContext.SalesOrderLines, deliveryLine => deliveryLine.SalesOrderLineId, orderLine => orderLine.Id, (deliveryLine, orderLine) => new { deliveryLine, orderLine })
            .Where(x => x.orderLine.SalesOrder!.SalesQuotationId == quotationId
                && x.orderLine.SourceQuotationLineId.HasValue
                && x.deliveryLine.DeliveryOrder!.Status != DeliveryOrderStatus.Draft
                && x.deliveryLine.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled)
            .Select(x => new { QuotationLineId = x.orderLine.SourceQuotationLineId!.Value, x.deliveryLine.Quantity })
            .ToListAsync(cancellationToken);
        return directDeliveries.Concat(orderDeliveries)
            .GroupBy(line => line.QuotationLineId)
            .ToDictionary(group => group.Key, group => group.Sum(line => line.Quantity));
    }

    private async Task<Dictionary<Guid, decimal>> GetInvoicedQuantitiesAsync(Guid quotationId, CancellationToken cancellationToken)
    {
        var orderInvoices = await dbContext.InvoiceLineItems
            .Join(dbContext.SalesOrderLines, invoiceLine => invoiceLine.SalesOrderLineId, orderLine => orderLine.Id, (invoiceLine, orderLine) => new { invoiceLine, orderLine })
            .Where(x => x.invoiceLine.Invoice!.Status != InvoiceStatus.Voided
                && !x.invoiceLine.Invoice.DeliveryOrderId.HasValue
                && x.orderLine.SalesOrder!.SalesQuotationId == quotationId
                && x.orderLine.SourceQuotationLineId.HasValue)
            .Select(x => new { QuotationLineId = x.orderLine.SourceQuotationLineId!.Value, x.invoiceLine.Quantity })
            .ToListAsync(cancellationToken);
        var directDeliveryInvoices = await dbContext.InvoiceLineItems
            .Join(dbContext.DeliveryOrderLines, invoiceLine => invoiceLine.DeliveryOrderLineId, deliveryLine => deliveryLine.Id, (invoiceLine, deliveryLine) => new { invoiceLine, deliveryLine })
            .Where(x => x.invoiceLine.Invoice!.Status != InvoiceStatus.Voided
                && x.deliveryLine.DeliveryOrder!.SalesQuotationId == quotationId
                && x.deliveryLine.SourceQuotationLineId.HasValue)
            .Select(x => new { QuotationLineId = x.deliveryLine.SourceQuotationLineId!.Value, x.invoiceLine.Quantity })
            .ToListAsync(cancellationToken);
        var orderDeliveryInvoices = await dbContext.InvoiceLineItems
            .Join(dbContext.DeliveryOrderLines, invoiceLine => invoiceLine.DeliveryOrderLineId, deliveryLine => deliveryLine.Id, (invoiceLine, deliveryLine) => new { invoiceLine, deliveryLine })
            .Join(dbContext.SalesOrderLines, x => x.deliveryLine.SalesOrderLineId, orderLine => orderLine.Id, (x, orderLine) => new { x.invoiceLine, orderLine })
            .Where(x => x.invoiceLine.Invoice!.Status != InvoiceStatus.Voided
                && x.orderLine.SalesOrder!.SalesQuotationId == quotationId
                && x.orderLine.SourceQuotationLineId.HasValue)
            .Select(x => new { QuotationLineId = x.orderLine.SourceQuotationLineId!.Value, x.invoiceLine.Quantity })
            .ToListAsync(cancellationToken);
        return orderInvoices.Concat(directDeliveryInvoices)
            .Concat(orderDeliveryInvoices)
            .GroupBy(line => line.QuotationLineId)
            .ToDictionary(group => group.Key, group => group.Sum(line => line.Quantity));
    }

    internal static string ConversionCapacityError(decimal requestedQuantity, string description, decimal remainingQuantity, string quotationNumber) =>
        remainingQuantity <= 0m
            ? $"Cannot convert {requestedQuantity} unit{(requestedQuantity == 1m ? string.Empty : "s")} of {description}. The quotation quantity has already been fully converted."
            : $"Cannot convert {requestedQuantity} unit{(requestedQuantity == 1m ? string.Empty : "s")} of {description}. Only {remainingQuantity} unit{(remainingQuantity == 1m ? string.Empty : "s")} remain available on quotation {quotationNumber}.";

    private static SalesQuotationListItemDto MapList(SalesQuotation entity, IReadOnlyDictionary<Guid, decimal>? convertedQuantityByQuotationLine = null)
    {
        var lines = entity.Lines.Select(line => MapLine(line, convertedQuantityByQuotationLine)).ToList();
        var conversionStatus = lines.All(line => line.RemainingQuantity <= 0)
            ? SalesQuotationConversionStatus.FullyConverted
            : lines.Any(line => line.ConvertedQuantity > 0)
                ? SalesQuotationConversionStatus.PartiallyConverted
                : SalesQuotationConversionStatus.NotConverted;
        return new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.QuotationNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.ExpiryDateUtc, entity.Currency, entity.TotalAmount, entity.Status, conversionStatus, lines.Any(line => line.ConvertedQuantity > 0m), entity.ConvertedSalesOrderId);
    }

    internal static SalesQuotationDetailsDto MapDetails(SalesQuotation entity, IReadOnlyDictionary<Guid, decimal>? convertedQuantityByQuotationLine = null, IReadOnlyDictionary<Guid, decimal>? deliveredQuantityByQuotationLine = null, IReadOnlyDictionary<Guid, decimal>? invoicedQuantityByQuotationLine = null, IReadOnlyCollection<SalesOrderLinkDto>? salesOrders = null)
    {
        var lines = entity.Lines.OrderBy(x => x.SortOrder).Select(line => MapLine(line, convertedQuantityByQuotationLine, deliveredQuantityByQuotationLine, invoicedQuantityByQuotationLine)).ToList();
        var conversionStatus = lines.All(line => line.RemainingQuantity <= 0)
            ? SalesQuotationConversionStatus.FullyConverted
            : lines.Any(line => line.ConvertedQuantity > 0)
                ? SalesQuotationConversionStatus.PartiallyConverted
                : SalesQuotationConversionStatus.NotConverted;
        return new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.QuotationNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.ExpiryDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, conversionStatus, lines.Any(line => line.ConvertedQuantity > 0m), entity.ConvertedSalesOrderId, lines, salesOrders ?? []);
    }

    internal static SalesDocumentLineDto MapLine(SalesQuotationLine line, IReadOnlyDictionary<Guid, decimal>? convertedQuantityByQuotationLine = null, IReadOnlyDictionary<Guid, decimal>? deliveredQuantityByQuotationLine = null, IReadOnlyDictionary<Guid, decimal>? invoicedQuantityByQuotationLine = null)
    {
        var convertedQuantity = convertedQuantityByQuotationLine is not null && convertedQuantityByQuotationLine.TryGetValue(line.Id, out var converted)
            ? converted
            : 0m;
        return new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, null, null, deliveredQuantityByQuotationLine?.GetValueOrDefault(line.Id) ?? 0m, invoicedQuantityByQuotationLine?.GetValueOrDefault(line.Id) ?? 0m, convertedQuantity, Math.Max(0, line.Quantity - convertedQuantity));
    }
}

public sealed class SalesOrderService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : ISalesOrderService
{
    public async Task<IReadOnlyCollection<SalesOrderListItemDto>> GetAsync(SalesOrderListQuery query, CancellationToken cancellationToken = default)
    {
        var items = dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            items = items.Where(x => x.SalesOrderNumber.Contains(term) || x.ContactName.Contains(term) || x.ReferenceNo.Contains(term));
        }
        if (query.CompanyId.HasValue) items = items.Where(x => x.CompanyId == query.CompanyId.Value);
        if (query.Status.HasValue) items = items.Where(x => x.Status == query.Status.Value);
        var result = await items.OrderByDescending(x => x.DocumentDateUtc).ThenByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        return result.Select(MapList).ToList();
    }

    public async Task<SalesOrderDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        var invoices = await dbContext.Invoices
            .Where(invoice => invoice.CompanyId == entity.CompanyId && invoice.SalesOrderId == entity.Id)
            .OrderByDescending(invoice => invoice.IssueDateUtc)
            .Select(invoice => new SalesInvoiceLinkDto(invoice.Id, invoice.InvoiceNumber, invoice.IssueDateUtc, invoice.Status, invoice.Total, invoice.Currency, invoice.DeliveryOrderId))
            .ToListAsync(cancellationToken);
        return MapDetails(entity, invoices);
    }

    public async Task<SalesOrderDetailsDto> CreateAsync(SalesOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        if (request.SalesQuotationId.HasValue)
            throw new InvalidOperationException("Use the quotation conversion action to create an order from a quotation.");
        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.Lines, request.SalesQuotationId, null, cancellationToken);
        var contact = await LoadContactAsync(request.ContactId, cancellationToken);
        var currency = await NormalizeAndValidateCurrencyAsync(companyId, request.Currency, contact.Currency, cancellationToken);
        var entity = new SalesOrder
        {
            CompanyId = companyId,
            SalesOrderNumber = await GenerateSalesOrderNumberAsync(companyId, cancellationToken),
            ContactId = contact.Id,
            ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            ContactEmail = contact.Email,
            ContactPhoneNumber = contact.PhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
            SalesQuotationId = request.SalesQuotationId,
        };
        await ApplyLinesAsync(entity, request.Lines, cancellationToken);
        dbContext.SalesOrders.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-order.created", nameof(SalesOrder), entity.Id.ToString(), entity.SalesOrderNumber, cancellationToken);
        return MapDetails(await dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == entity.Id, cancellationToken));
    }

    public async Task<SalesOrderDetailsDto?> UpdateAsync(Guid id, SalesOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        await using var transaction = dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        var entity = await dbContext.SalesOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (entity.Status is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled or SalesOrderStatus.PartiallyDelivered or SalesOrderStatus.FullyDelivered)
            throw new InvalidOperationException("Delivered, closed, or cancelled sales orders cannot be edited.");
        if (entity.Lines.Count > 0 && entity.Lines.All(line => line.InvoicedQuantity >= line.Quantity))
            throw new InvalidOperationException("Fully invoiced sales orders cannot be edited.");
        if (request.SalesQuotationId != entity.SalesQuotationId)
            throw new InvalidOperationException("The source quotation cannot be changed.");
        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.Lines, request.SalesQuotationId, id, cancellationToken);
        if (entity.CompanyId != companyId) throw new InvalidOperationException("Sales order company cannot be changed.");
        var contact = await LoadContactAsync(request.ContactId, cancellationToken);
        var currency = await NormalizeAndValidateCurrencyAsync(companyId, request.Currency, contact.Currency, cancellationToken);
        entity.ContactId = contact.Id;
        entity.ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName;
        entity.ContactEmail = contact.Email;
        entity.ContactPhoneNumber = contact.PhoneNumber;
        entity.DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime();
        entity.Currency = currency;
        entity.ReferenceNo = request.ReferenceNo.Trim();
        entity.Notes = request.Notes.Trim();
        entity.SalesQuotationId = request.SalesQuotationId;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.SalesOrderLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        await ApplyLinesAsync(entity, request.Lines, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("sales-order.updated", nameof(SalesOrder), entity.Id.ToString(), entity.SalesOrderNumber, cancellationToken);
        return MapDetails(await dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == entity.Id, cancellationToken));
    }

    public async Task<SalesOrderDetailsDto?> SetStatusAsync(Guid id, SalesOrderStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (request.Status == SalesOrderStatus.Closed && entity.Lines.Count > 0 && entity.Lines.All(line => line.InvoicedQuantity >= line.Quantity))
            throw new InvalidOperationException("This sales order is already fully completed and closes automatically.");
        EnsureSalesOrderStatusTransition(entity.Status, request.Status);
        entity.Status = request.Status;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-order.status-updated", nameof(SalesOrder), entity.Id.ToString(), request.Status.ToString(), cancellationToken);
        return MapDetails(entity);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return false;
        if (entity.Status != SalesOrderStatus.Draft)
            throw new InvalidOperationException("Only draft sales orders can be deleted.");
        dbContext.SalesOrders.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-order.deleted", nameof(SalesOrder), entity.Id.ToString(), entity.SalesOrderNumber, cancellationToken);
        return true;
    }

    private async Task<Guid> ValidateCommonAsync(Guid? companyId, Guid contactId, IReadOnlyCollection<SalesDocumentLineRequest> lines, Guid? salesQuotationId, Guid? currentOrderId, CancellationToken cancellationToken)
    {
        if (!companyId.HasValue || companyId == Guid.Empty) throw new InvalidOperationException("Company is required.");
        await EnsureCompanyAccessAsync(companyId.Value, cancellationToken);
        _ = await LoadContactAsync(contactId, cancellationToken);
        if (salesQuotationId.HasValue)
        {
            var quotation = await dbContext.SalesQuotations.Include(x => x.Lines).FirstOrDefaultAsync(x => x.CompanyId == companyId.Value && x.Id == salesQuotationId.Value, cancellationToken)
                ?? throw new InvalidOperationException("Selected quotation was not found.");
            if (quotation.Status != SalesQuotationStatus.Accepted)
                throw new InvalidOperationException("Mark this quotation as accepted before converting it to a sales order.");
            if (!currentOrderId.HasValue)
                throw new InvalidOperationException("Use the quotation conversion action to create an order from a quotation.");

            if (lines.Any(line => !line.SourceQuotationLineId.HasValue))
                throw new InvalidOperationException("Each line on an order created from a quotation must retain its source quotation line.");
            if (lines.GroupBy(line => line.SourceQuotationLineId).Any(group => group.Count() > 1))
                throw new InvalidOperationException("Each quotation line can only be added once.");

            var consumedByOtherDocuments = await dbContext.SalesOrderLines
                .Where(line => line.SalesOrder!.SalesQuotationId == quotation.Id
                    && line.SalesOrderId != currentOrderId.Value
                    && line.SalesOrder.Status != SalesOrderStatus.Cancelled
                    && line.SourceQuotationLineId.HasValue)
                .Select(line => new { QuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity })
                .Concat(dbContext.DeliveryOrderLines
                    .Where(line => line.DeliveryOrder!.SalesQuotationId == quotation.Id
                        && line.DeliveryOrder.Status != DeliveryOrderStatus.Cancelled
                        && line.SourceQuotationLineId.HasValue)
                    .Select(line => new { QuotationLineId = line.SourceQuotationLineId!.Value, line.Quantity }))
                .GroupBy(line => line.QuotationLineId)
                .Select(group => new { QuotationLineId = group.Key, Quantity = group.Sum(line => line.Quantity) })
                .ToDictionaryAsync(line => line.QuotationLineId, line => line.Quantity, cancellationToken);

            foreach (var requestLine in lines)
            {
                var quotationLine = quotation.Lines.SingleOrDefault(line => line.Id == requestLine.SourceQuotationLineId!.Value)
                    ?? throw new InvalidOperationException("A source quotation line was not found.");
                var remaining = Math.Max(0m, quotationLine.Quantity - consumedByOtherDocuments.GetValueOrDefault(quotationLine.Id));
                if (requestLine.Quantity > remaining)
                    throw new InvalidOperationException(SalesQuotationService.ConversionCapacityError(requestLine.Quantity, quotationLine.Description, remaining, quotation.QuotationNumber));
            }
        }
        if (lines.Count == 0) throw new InvalidOperationException("At least one line is required.");
        return companyId.Value;
    }

    private async Task ApplyLinesAsync(SalesOrder entity, IReadOnlyCollection<SalesDocumentLineRequest> requests, CancellationToken cancellationToken)
    {
        var subtotal = 0m;
        var tax = 0m;
        var order = 1;
        var lines = new List<SalesOrderLine>();
        foreach (var request in requests)
        {
            var taxCode = await LoadTaxCodeAsync(entity.CompanyId, request.TaxCodeId, cancellationToken);
            var taxRate = taxCode?.Rate ?? request.TaxRate;
            var lineSubtotal = Math.Round(request.Quantity * request.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (taxRate / 100m), 2, MidpointRounding.AwayFromZero);
            var productName = ResolveProductSnapshot(request.ProductId, entity.CompanyId, cancellationToken);
            lines.Add(new SalesOrderLine
            {
                SortOrder = order++,
                ProductId = request.ProductId,
                TaxCodeId = taxCode?.Id,
                ProductNameSnapshot = productName,
                Description = request.Description.Trim(),
                Quantity = request.Quantity,
                UnitPrice = request.UnitPrice,
                TaxRate = taxRate,
                TaxAmount = lineTax,
                LineTotal = lineSubtotal + lineTax,
                SourceQuotationLineId = request.SourceQuotationLineId,
            });
            subtotal += lineSubtotal;
            tax += lineTax;
        }
        entity.Lines = lines;
        entity.Subtotal = subtotal;
        entity.TaxAmount = tax;
        entity.TotalAmount = subtotal + tax;
    }

    private string ResolveProductSnapshot(Guid? productId, Guid companyId, CancellationToken cancellationToken)
    {
        if (!productId.HasValue) return string.Empty;
        var product = dbContext.Products.FirstOrDefault(x => x.CompanyId == companyId && x.Id == productId.Value);
        if (product is null) throw new InvalidOperationException("Selected product was not found.");
        return product.Name;
    }

    private async Task<Customer> LoadContactAsync(Guid contactId, CancellationToken cancellationToken) =>
        await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == contactId, cancellationToken)
        ?? throw new InvalidOperationException("Contact not found.");

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = companyId == GetCompanyId();
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.Id == GetCompanyId()).Select(x => x.Id);
    private async Task<string> ResolveCurrencyAsync(Guid companyId, string? requestCurrency, string? contactCurrency, CancellationToken cancellationToken)
    {
        var value = string.IsNullOrWhiteSpace(requestCurrency) ? contactCurrency : requestCurrency;
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value.Trim().ToUpperInvariant();
        }

        var companyCurrency = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => x.Currency)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(companyCurrency) ? string.Empty : companyCurrency.Trim().ToUpperInvariant();
    }

    private async Task<string> NormalizeAndValidateCurrencyAsync(Guid companyId, string? requestCurrency, string? contactCurrency, CancellationToken cancellationToken)
    {
        var currency = await ResolveCurrencyAsync(companyId, requestCurrency, contactCurrency, cancellationToken);
        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new InvalidOperationException("Select a valid currency.");
        }

        var exists = await dbContext.CurrencyDefinitions.AnyAsync(
            x => x.CompanyId == companyId && x.IsActive && x.Code == currency,
            cancellationToken);
        if (!exists)
        {
            throw new InvalidOperationException("Select a valid currency.");
        }

        return currency;
    }

    private async Task<TaxCode?> LoadTaxCodeAsync(Guid companyId, Guid? taxCodeId, CancellationToken cancellationToken)
    {
        if (!taxCodeId.HasValue || taxCodeId == Guid.Empty)
        {
            return null;
        }

        return await dbContext.TaxCodes.FirstOrDefaultAsync(
                   x => x.CompanyId == companyId
                     && x.Id == taxCodeId.Value
                     && x.IsActive
                     && (x.Scope == TaxScope.Sales || x.Scope == TaxScope.Both),
                   cancellationToken)
               ?? throw new InvalidOperationException("Select a valid tax code.");
    }

    private async Task<string> GenerateSalesOrderNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.SalesOrders.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"SO-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
    }

    private static void EnsureSalesOrderStatusTransition(SalesOrderStatus current, SalesOrderStatus next)
    {
        if (current == next) return;
        if (current is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled)
            throw new InvalidOperationException("This sales order status cannot be changed.");

        var valid = current switch
        {
            SalesOrderStatus.Draft => next is SalesOrderStatus.Confirmed or SalesOrderStatus.Cancelled,
            SalesOrderStatus.Confirmed => next is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled,
            SalesOrderStatus.PartiallyDelivered => next == SalesOrderStatus.Closed,
            SalesOrderStatus.FullyDelivered => next == SalesOrderStatus.Closed,
            _ => false,
        };

        if (!valid)
            throw new InvalidOperationException("This sales order status cannot be changed.");
    }

    private static SalesOrderListItemDto MapList(SalesOrder entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.SalesOrderNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.Currency, entity.TotalAmount, entity.Status, entity.Lines.Any(line => line.Quantity > line.DeliveredQuantity + line.InvoicedQuantity), entity.Lines.Any(line => line.InvoicedQuantity < line.Quantity), entity.SalesQuotationId);

    internal static SalesOrderDetailsDto MapDetails(SalesOrder entity, IReadOnlyCollection<SalesInvoiceLinkDto>? invoices = null) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.SalesOrderNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.SalesQuotationId, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList(), invoices ?? []);

    internal static SalesDocumentLineDto MapLine(SalesOrderLine line) =>
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, line.SourceQuotationLineId, line.Id, line.DeliveredQuantity, line.InvoicedQuantity);
}
