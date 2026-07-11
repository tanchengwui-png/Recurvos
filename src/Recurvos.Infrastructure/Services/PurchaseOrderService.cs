using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Purchases;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PurchaseOrderService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IPurchaseOrderService
{
    public async Task<IReadOnlyCollection<PurchaseOrderListItemDto>> GetAsync(PurchaseOrderListQuery query, CancellationToken cancellationToken = default)
    {
        await SyncPurchaseOrderStatusesAsync(OwnedCompanyIdsQuery(), cancellationToken);
        var items = dbContext.PurchaseOrders.Include(x => x.Company)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            items = items.Where(x => x.PurchaseOrderNumber.Contains(term) || x.ContactName.Contains(term) || x.ReferenceNo.Contains(term));
        }

        if (query.CompanyId.HasValue) items = items.Where(x => x.CompanyId == query.CompanyId.Value);
        if (query.Status.HasValue) items = items.Where(x => x.Status == query.Status.Value);

        var result = await items.OrderByDescending(x => x.DocumentDateUtc).ThenByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        return result.Select(MapList).ToList();
    }

    public async Task<PurchaseOrderDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await SyncPurchaseOrderStatusesAsync(OwnedCompanyIdsQuery(), cancellationToken);
        var entity = await dbContext.PurchaseOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var relatedDocuments = await LoadRelatedDocumentsAsync(entity.Id, entity.CompanyId, cancellationToken);
        return MapDetails(entity, relatedDocuments);
    }

    public async Task<PurchaseOrderDetailsDto> CreateAsync(PurchaseOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.Lines, cancellationToken);
        var contact = await LoadSupplierAsync(request.ContactId, cancellationToken);
        var currency = await NormalizeAndValidateCurrencyAsync(companyId, request.Currency, contact.Currency, cancellationToken);
        var entity = new PurchaseOrder
        {
            CompanyId = companyId,
            PurchaseOrderNumber = await GeneratePurchaseOrderNumberAsync(companyId, cancellationToken),
            ContactId = contact.Id,
            ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            ContactEmail = contact.Email,
            ContactPhoneNumber = contact.PhoneNumber,
            DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
        };
        await ApplyLinesAsync(entity, request.Lines, cancellationToken);
        dbContext.PurchaseOrders.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-order.created", nameof(PurchaseOrder), entity.Id.ToString(), entity.PurchaseOrderNumber, cancellationToken);
        return MapDetails(await dbContext.PurchaseOrders.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == entity.Id, cancellationToken));
    }

    public async Task<PurchaseOrderDetailsDto?> UpdateAsync(Guid id, PurchaseOrderUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        if (entity.Status is PurchaseOrderStatus.Closed or PurchaseOrderStatus.Cancelled or PurchaseOrderStatus.PartiallyReceived or PurchaseOrderStatus.FullyReceived)
            throw new InvalidOperationException("Received, closed, or cancelled purchase orders cannot be edited.");

        var companyId = await ValidateCommonAsync(request.CompanyId, request.ContactId, request.Lines, cancellationToken);
        if (entity.CompanyId != companyId) throw new InvalidOperationException("Purchase order company cannot be changed.");

        var contact = await LoadSupplierAsync(request.ContactId, cancellationToken);
        var currency = await NormalizeAndValidateCurrencyAsync(companyId, request.Currency, contact.Currency, cancellationToken);
        entity.ContactId = contact.Id;
        entity.ContactName = string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName;
        entity.ContactEmail = contact.Email;
        entity.ContactPhoneNumber = contact.PhoneNumber;
        entity.DocumentDateUtc = request.DocumentDateUtc.ToUniversalTime();
        entity.Currency = currency;
        entity.ReferenceNo = request.ReferenceNo.Trim();
        entity.Notes = request.Notes.Trim();
        entity.UpdatedAtUtc = DateTime.UtcNow;
        dbContext.PurchaseOrderLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        await ApplyLinesAsync(entity, request.Lines, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-order.updated", nameof(PurchaseOrder), entity.Id.ToString(), entity.PurchaseOrderNumber, cancellationToken);
        return MapDetails(await dbContext.PurchaseOrders.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == entity.Id, cancellationToken));
    }

    public async Task<PurchaseOrderDetailsDto?> SetStatusAsync(Guid id, PurchaseOrderStatusRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseOrders.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return null;
        PurchaseWorkflowRules.EnsurePurchaseOrderManualStatusTransition(entity.Status, request.Status);
        var oldStatus = entity.Status.ToString();
        entity.Status = request.Status;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteChangeAsync("purchase-order.status-updated", nameof(PurchaseOrder), entity.Id.ToString(), oldStatus, request.Status.ToString(), entity.PurchaseOrderNumber, cancellationToken);
        var relatedDocuments = await LoadRelatedDocumentsAsync(entity.Id, entity.CompanyId, cancellationToken);
        return MapDetails(entity, relatedDocuments);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null) return false;
        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new InvalidOperationException("Only draft purchase orders can be deleted.");
        dbContext.PurchaseOrders.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-order.deleted", nameof(PurchaseOrder), entity.Id.ToString(), entity.PurchaseOrderNumber, cancellationToken);
        return true;
    }

    private async Task<Guid> ValidateCommonAsync(Guid? companyId, Guid contactId, IReadOnlyCollection<PurchaseDocumentLineRequest> lines, CancellationToken cancellationToken)
    {
        if (!companyId.HasValue || companyId == Guid.Empty) throw new InvalidOperationException("Company is required.");
        await EnsureCompanyAccessAsync(companyId.Value, cancellationToken);
        _ = await LoadSupplierAsync(contactId, cancellationToken);
        if (lines.Count == 0) throw new InvalidOperationException("At least one line is required.");
        if (lines.Any(x => string.IsNullOrWhiteSpace(x.Description))) throw new InvalidOperationException("Each line requires a description.");
        return companyId.Value;
    }

    private async Task ApplyLinesAsync(PurchaseOrder entity, IReadOnlyCollection<PurchaseDocumentLineRequest> requests, CancellationToken cancellationToken)
    {
        var subtotal = 0m;
        var tax = 0m;
        var lines = new List<PurchaseOrderLine>();
        var order = 1;
        foreach (var request in requests)
        {
            var taxCode = await LoadTaxCodeAsync(entity.CompanyId, request.TaxCodeId, cancellationToken);
            var taxRate = taxCode?.Rate ?? request.TaxRate;
            var lineSubtotal = Math.Round(request.Quantity * request.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (taxRate / 100m), 2, MidpointRounding.AwayFromZero);
            var productName = ResolveProductSnapshot(request.ProductId, entity.CompanyId);
            lines.Add(new PurchaseOrderLine
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

    private string ResolveProductSnapshot(Guid? productId, Guid companyId)
    {
        if (!productId.HasValue) return string.Empty;
        var product = dbContext.Products.FirstOrDefault(x => x.CompanyId == companyId && x.Id == productId.Value);
        if (product is null) throw new InvalidOperationException("Selected product was not found.");
        return product.Name;
    }

    private async Task<Customer> LoadSupplierAsync(Guid contactId, CancellationToken cancellationToken)
    {
        var contact = await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == contactId, cancellationToken)
            ?? throw new InvalidOperationException("Supplier not found.");
        if (!contact.ContactType.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Any(x => x.Equals("Supplier", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Selected contact is not a supplier.");
        return contact;
    }

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.SubscriberId == GetSubscriberId(), cancellationToken);
        if (!hasAccess) throw new UnauthorizedAccessException();
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private async Task<string> GeneratePurchaseOrderNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.PurchaseOrders.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"PO-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
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
                     && (x.Scope == TaxScope.Purchase || x.Scope == TaxScope.Both),
                   cancellationToken)
               ?? throw new InvalidOperationException("Select a valid tax code.");
    }

    private static PurchaseOrderListItemDto MapList(PurchaseOrder entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchaseOrderNumber, entity.ContactId, entity.ContactName, entity.DocumentDateUtc, entity.Currency, entity.TotalAmount, entity.Status);

    internal static PurchaseOrderDetailsDto MapDetails(PurchaseOrder entity, PurchaseOrderRelatedDocumentsDto? relatedDocuments = null) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchaseOrderNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.DocumentDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.Status, entity.Lines.OrderBy(x => x.SortOrder).Select(MapLine).ToList(), relatedDocuments ?? new PurchaseOrderRelatedDocumentsDto([], []));

    internal static PurchaseDocumentLineDto MapLine(PurchaseOrderLine line) =>
        new(line.Id, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal, line.Id, line.ReceivedQuantity, line.BilledQuantity);

    private async Task<PurchaseOrderRelatedDocumentsDto> LoadRelatedDocumentsAsync(Guid purchaseOrderId, Guid companyId, CancellationToken cancellationToken)
    {
        var goodsReceivedNotes = await dbContext.GoodsReceivedNotes
            .Where(x => x.CompanyId == companyId && x.PurchaseOrderId == purchaseOrderId)
            .OrderByDescending(x => x.DocumentDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Select(x => new PurchaseRelatedDocumentDto(x.Id, x.GoodsReceivedNoteNumber, "GoodsReceivedNote", x.Status.ToString(), x.DocumentDateUtc, x.TotalAmount))
            .ToListAsync(cancellationToken);

        var bills = await dbContext.PurchaseBills
            .Where(x => x.CompanyId == companyId && x.PurchaseOrderId == purchaseOrderId)
            .OrderByDescending(x => x.IssueDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Select(x => new PurchaseRelatedDocumentDto(x.Id, x.PurchaseBillNumber, "PurchaseBill", x.Status.ToString(), x.IssueDateUtc, x.TotalAmount))
            .ToListAsync(cancellationToken);

        return new PurchaseOrderRelatedDocumentsDto(goodsReceivedNotes, bills);
    }

    private async Task SyncPurchaseOrderStatusesAsync(IQueryable<Guid> companyIds, CancellationToken cancellationToken)
    {
        var items = await dbContext.PurchaseOrders
            .Include(x => x.Lines)
            .Where(x => companyIds.Contains(x.CompanyId) && x.Status != PurchaseOrderStatus.Cancelled)
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var item in items)
        {
            var fallbackStatus = item.Status switch
            {
                PurchaseOrderStatus.Draft => PurchaseOrderStatus.Draft,
                PurchaseOrderStatus.Sent => PurchaseOrderStatus.Sent,
                _ => PurchaseOrderStatus.Approved,
            };
            var nextStatus = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(item, fallbackStatus);
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
