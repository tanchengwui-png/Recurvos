using Microsoft.EntityFrameworkCore;
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

        return result.Select(MapList).ToList();
    }

    public async Task<SalesQuotationDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesQuotations
            .Include(x => x.Lines)
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        return entity is null ? null : MapDetails(entity);
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
        if (entity.Status == SalesQuotationStatus.Converted)
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
        var quotation = await dbContext.SalesQuotations.Include(x => x.Lines).Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (quotation is null) return null;
        if (quotation.Status is not (SalesQuotationStatus.Sent or SalesQuotationStatus.Accepted))
            throw new InvalidOperationException("This quotation cannot be converted to a sales order.");

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
            Subtotal = quotation.Subtotal,
            TaxAmount = quotation.TaxAmount,
            TotalAmount = quotation.TotalAmount,
            Lines = quotation.Lines
                .OrderBy(x => x.SortOrder)
                .Select((line, index) => new SalesOrderLine
                {
                    SortOrder = index + 1,
                ProductId = line.ProductId,
                TaxCodeId = line.TaxCodeId,
                ProductNameSnapshot = line.ProductNameSnapshot,
                Description = line.Description,
                Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    TaxRate = line.TaxRate,
                    TaxAmount = line.TaxAmount,
                    LineTotal = line.LineTotal,
                    SourceQuotationLineId = line.Id,
                }).ToList(),
        };

        quotation.Status = SalesQuotationStatus.Converted;
        quotation.ConvertedSalesOrderId = order.Id;
        quotation.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.SalesOrders.Add(order);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("sales-quotation.converted", nameof(SalesQuotation), quotation.Id.ToString(), order.SalesOrderNumber, cancellationToken);
        await auditService.WriteAsync("sales-order.created", nameof(SalesOrder), order.Id.ToString(), $"from={quotation.QuotationNumber}", cancellationToken);
        return SalesOrderService.MapDetails(await dbContext.SalesOrders.Include(x => x.Lines).Include(x => x.Company).FirstAsync(x => x.Id == order.Id, cancellationToken));
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
        await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == contactId, cancellationToken)
        ?? throw new InvalidOperationException("Contact not found.");

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.SubscriberId == GetSubscriberId(), cancellationToken);
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

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
            SalesQuotationStatus.Accepted => next == SalesQuotationStatus.Sent,
            _ => false,
        };

        if (!valid)
            throw new InvalidOperationException("This quotation status cannot be changed.");
    }

    private static SalesQuotationListItemDto MapList(SalesQuotation entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.QuotationNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.ExpiryDateUtc, entity.Currency, entity.TotalAmount, entity.Status, entity.ConvertedSalesOrderId);

    internal static SalesQuotationDetailsDto MapDetails(SalesQuotation entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.QuotationNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.ExpiryDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.ConvertedSalesOrderId, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList());

    internal static SalesDocumentLineDto MapLine(SalesQuotationLine line) =>
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, null, null, 0m, 0m);
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
        return entity is null ? null : MapDetails(entity);
    }

    public async Task<SalesOrderDetailsDto> CreateAsync(SalesOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.Lines, request.SalesQuotationId, cancellationToken);
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
        var entity = await dbContext.SalesOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (entity.Status is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled or SalesOrderStatus.PartiallyDelivered or SalesOrderStatus.FullyDelivered)
            throw new InvalidOperationException("Delivered, closed, or cancelled sales orders cannot be edited.");
        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.Lines, request.SalesQuotationId, cancellationToken);
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
        await auditService.WriteAsync("sales-order.updated", nameof(SalesOrder), entity.Id.ToString(), entity.SalesOrderNumber, cancellationToken);
        return MapDetails(await dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == entity.Id, cancellationToken));
    }

    public async Task<SalesOrderDetailsDto?> SetStatusAsync(Guid id, SalesOrderStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.SalesOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
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

    private async Task<Guid> ValidateCommonAsync(Guid? companyId, Guid contactId, IReadOnlyCollection<SalesDocumentLineRequest> lines, Guid? salesQuotationId, CancellationToken cancellationToken)
    {
        if (!companyId.HasValue || companyId == Guid.Empty) throw new InvalidOperationException("Company is required.");
        await EnsureCompanyAccessAsync(companyId.Value, cancellationToken);
        _ = await LoadContactAsync(contactId, cancellationToken);
        if (salesQuotationId.HasValue)
        {
            var quotationExists = await dbContext.SalesQuotations.AnyAsync(x => x.CompanyId == companyId.Value && x.Id == salesQuotationId.Value, cancellationToken);
            if (!quotationExists) throw new InvalidOperationException("Selected quotation was not found.");
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
        await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == contactId, cancellationToken)
        ?? throw new InvalidOperationException("Contact not found.");

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.SubscriberId == GetSubscriberId(), cancellationToken);
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);
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
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.SalesOrderNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.Currency, entity.TotalAmount, entity.Status, entity.SalesQuotationId);

    internal static SalesOrderDetailsDto MapDetails(SalesOrder entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.SalesOrderNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.SalesQuotationId, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList());

    internal static SalesDocumentLineDto MapLine(SalesOrderLine line) =>
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, line.SourceQuotationLineId, line.Id, line.DeliveredQuantity, line.InvoicedQuantity);
}
