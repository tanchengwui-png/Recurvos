using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Purchases;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PurchaseBillService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IPurchaseBillService
{
    public async Task<IReadOnlyCollection<PurchaseBillListItemDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyIds = OwnedCompanyIdsQuery();
        await SyncBillStatusesAsync(companyIds, cancellationToken);
        var items = await dbContext.PurchaseBills.Include(x => x.Company)
            .Where(x => companyIds.Contains(x.CompanyId))
            .OrderByDescending(x => x.IssueDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return items.Select(MapList).ToList();
    }

    public async Task<PurchaseBillDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await SyncBillStatusesAsync(OwnedCompanyIdsQuery(), cancellationToken);
        var entity = await dbContext.PurchaseBills.Include(x => x.Company).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var relatedDocuments = await LoadRelatedDocumentsAsync(entity.Id, entity.CompanyId, cancellationToken);
        return MapDetails(entity, relatedDocuments);
    }

    public async Task<PurchaseBillDetailsDto?> CreateFromPurchaseOrderAsync(Guid purchaseOrderId, CreatePurchaseBillRequest request, CancellationToken cancellationToken = default)
    {
        var purchaseOrder = await dbContext.PurchaseOrders.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == purchaseOrderId, cancellationToken);
        if (purchaseOrder is null) return null;
        if (request.Lines.Count == 0) throw new InvalidOperationException("At least one bill line item is required.");
        PurchaseWorkflowRules.EnsurePurchaseOrderAllowsBilling(purchaseOrder);

        var lines = BuildFromPurchaseOrder(purchaseOrder, request.Lines);
        var oldPurchaseOrderStatus = purchaseOrder.Status.ToString();
        var currency = await ValidateCurrencyAsync(purchaseOrder.CompanyId, purchaseOrder.Currency, cancellationToken);
        var bill = await CreateBillAsync(purchaseOrder.CompanyId, purchaseOrder.ContactId, purchaseOrder.ContactName, purchaseOrder.ContactEmail, purchaseOrder.ContactPhoneNumber, currency, purchaseOrder.Id, null, purchaseOrder.Id, purchaseOrder.PurchaseOrderNumber, "PurchaseOrder", request, lines, cancellationToken);
        ApplyPurchaseOrderBilledQuantities(purchaseOrder, lines, 1m);
        purchaseOrder.Status = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(purchaseOrder, PurchaseOrderStatus.Approved);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-bill.created-from-po", nameof(PurchaseBill), bill.Id.ToString(), purchaseOrder.PurchaseOrderNumber, cancellationToken);
        await auditService.WriteAsync("purchase-order.converted-to-bill", nameof(PurchaseOrder), purchaseOrder.Id.ToString(), $"to={bill.PurchaseBillNumber}", cancellationToken);
        if (oldPurchaseOrderStatus != purchaseOrder.Status.ToString())
        {
            await auditService.WriteChangeAsync("purchase-order.status-auto-updated", nameof(PurchaseOrder), purchaseOrder.Id.ToString(), oldPurchaseOrderStatus, purchaseOrder.Status.ToString(), purchaseOrder.PurchaseOrderNumber, cancellationToken);
        }
        var created = await LoadOrThrowAsync(bill.Id, cancellationToken);
        var relatedDocuments = await LoadRelatedDocumentsAsync(created.Id, created.CompanyId, cancellationToken);
        return MapDetails(created, relatedDocuments);
    }

    public async Task<PurchaseBillDetailsDto?> CreateFromGoodsReceivedNoteAsync(Guid goodsReceivedNoteId, CreatePurchaseBillRequest request, CancellationToken cancellationToken = default)
    {
        var grn = await dbContext.GoodsReceivedNotes.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == goodsReceivedNoteId, cancellationToken);
        if (grn is null) return null;
        PurchaseWorkflowRules.EnsureGoodsReceivedNoteAllowsBilling(grn);
        var purchaseOrder = await dbContext.PurchaseOrders.Include(x => x.Lines)
            .FirstAsync(x => x.Id == grn.PurchaseOrderId, cancellationToken);
        if (request.Lines.Count == 0) throw new InvalidOperationException("At least one bill line item is required.");

        var lines = BuildFromGrn(grn, purchaseOrder, request.Lines);
        var oldGrnStatus = grn.Status.ToString();
        var oldPurchaseOrderStatus = purchaseOrder.Status.ToString();
        var currency = await ValidateCurrencyAsync(grn.CompanyId, grn.Currency, cancellationToken);
        var bill = await CreateBillAsync(grn.CompanyId, grn.ContactId, grn.ContactName, grn.ContactEmail, grn.ContactPhoneNumber, currency, purchaseOrder.Id, grn.Id, grn.Id, grn.GoodsReceivedNoteNumber, "GoodsReceivedNote", request, lines, cancellationToken);
        ApplyGrnBilledQuantities(grn, purchaseOrder, lines, 1m);
        grn.Status = PurchaseWorkflowRules.ResolveGoodsReceivedNoteBillingStatus(grn);
        purchaseOrder.Status = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(purchaseOrder, PurchaseOrderStatus.Approved);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-bill.created-from-grn", nameof(PurchaseBill), bill.Id.ToString(), grn.GoodsReceivedNoteNumber, cancellationToken);
        await auditService.WriteAsync("goods-received-note.converted-to-bill", nameof(GoodsReceivedNote), grn.Id.ToString(), $"to={bill.PurchaseBillNumber}", cancellationToken);
        if (oldGrnStatus != grn.Status.ToString())
        {
            await auditService.WriteChangeAsync("goods-received-note.status-auto-updated", nameof(GoodsReceivedNote), grn.Id.ToString(), oldGrnStatus, grn.Status.ToString(), grn.GoodsReceivedNoteNumber, cancellationToken);
        }
        if (oldPurchaseOrderStatus != purchaseOrder.Status.ToString())
        {
            await auditService.WriteChangeAsync("purchase-order.status-auto-updated", nameof(PurchaseOrder), purchaseOrder.Id.ToString(), oldPurchaseOrderStatus, purchaseOrder.Status.ToString(), purchaseOrder.PurchaseOrderNumber, cancellationToken);
        }
        var created = await LoadOrThrowAsync(bill.Id, cancellationToken);
        var relatedDocuments = await LoadRelatedDocumentsAsync(created.Id, created.CompanyId, cancellationToken);
        return MapDetails(created, relatedDocuments);
    }

    public async Task<PurchaseBillDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var bill = await dbContext.PurchaseBills.Include(x => x.Lines).Include(x => x.Company)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (bill is null) return null;
        if (bill.AmountPaid > 0) throw new InvalidOperationException("Paid purchase bills cannot be cancelled.");
        if (bill.Status == PurchaseBillStatus.Cancelled) return MapDetails(bill);
        var oldBillStatus = bill.Status.ToString();
        StatusChangeRecord? relatedPurchaseOrderStatusChange = null;
        StatusChangeRecord? relatedGrnStatusChange = null;

        if (bill.GoodsReceivedNoteId.HasValue)
        {
            var grn = await dbContext.GoodsReceivedNotes.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == bill.GoodsReceivedNoteId.Value, cancellationToken);
            var po = bill.PurchaseOrderId.HasValue
                ? await dbContext.PurchaseOrders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == bill.PurchaseOrderId.Value, cancellationToken)
                : null;
            if (grn is not null && po is not null)
            {
                var oldGrnStatus = grn.Status.ToString();
                var oldPurchaseOrderStatus = po.Status.ToString();
                ApplyGrnBilledQuantities(grn, po, bill.Lines, -1m);
                grn.Status = PurchaseWorkflowRules.ResolveGoodsReceivedNoteBillingStatus(grn);
                po.Status = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(po, PurchaseOrderStatus.Approved);
                relatedGrnStatusChange = oldGrnStatus != grn.Status.ToString()
                    ? new StatusChangeRecord(nameof(GoodsReceivedNote), grn.Id, grn.GoodsReceivedNoteNumber, oldGrnStatus, grn.Status.ToString())
                    : null;
                relatedPurchaseOrderStatusChange = oldPurchaseOrderStatus != po.Status.ToString()
                    ? new StatusChangeRecord(nameof(PurchaseOrder), po.Id, po.PurchaseOrderNumber, oldPurchaseOrderStatus, po.Status.ToString())
                    : null;
            }
        }
        else if (bill.PurchaseOrderId.HasValue)
        {
            var po = await dbContext.PurchaseOrders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == bill.PurchaseOrderId.Value, cancellationToken);
            if (po is not null)
            {
                var oldPurchaseOrderStatus = po.Status.ToString();
                ApplyPurchaseOrderBilledQuantities(po, bill.Lines, -1m);
                po.Status = PurchaseWorkflowRules.ResolvePurchaseOrderStatus(po, PurchaseOrderStatus.Approved);
                relatedPurchaseOrderStatusChange = oldPurchaseOrderStatus != po.Status.ToString()
                    ? new StatusChangeRecord(nameof(PurchaseOrder), po.Id, po.PurchaseOrderNumber, oldPurchaseOrderStatus, po.Status.ToString())
                    : null;
            }
        }

        bill.Status = PurchaseBillStatus.Cancelled;
        bill.AmountDue = 0m;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-bill.cancelled", nameof(PurchaseBill), bill.Id.ToString(), bill.PurchaseBillNumber, cancellationToken);
        await auditService.WriteChangeAsync("purchase-bill.status-updated", nameof(PurchaseBill), bill.Id.ToString(), oldBillStatus, bill.Status.ToString(), bill.PurchaseBillNumber, cancellationToken);
        if (relatedGrnStatusChange is not null)
        {
            await auditService.WriteChangeAsync("goods-received-note.status-auto-updated", relatedGrnStatusChange.EntityName, relatedGrnStatusChange.EntityId.ToString(), relatedGrnStatusChange.OldValue, relatedGrnStatusChange.NewValue, relatedGrnStatusChange.Metadata, cancellationToken);
        }
        if (relatedPurchaseOrderStatusChange is not null)
        {
            await auditService.WriteChangeAsync("purchase-order.status-auto-updated", relatedPurchaseOrderStatusChange.EntityName, relatedPurchaseOrderStatusChange.EntityId.ToString(), relatedPurchaseOrderStatusChange.OldValue, relatedPurchaseOrderStatusChange.NewValue, relatedPurchaseOrderStatusChange.Metadata, cancellationToken);
        }
        var relatedDocuments = await LoadRelatedDocumentsAsync(bill.Id, bill.CompanyId, cancellationToken);
        return MapDetails(bill, relatedDocuments);
    }

    private async Task<PurchaseBill> CreateBillAsync(Guid companyId, Guid contactId, string contactName, string contactEmail, string contactPhone, string currency, Guid? purchaseOrderId, Guid? goodsReceivedNoteId, Guid createdFromDocumentId, string createdFromDocumentNumber, string createdFromDocumentType, CreatePurchaseBillRequest request, List<PurchaseBillLine> lines, CancellationToken cancellationToken)
    {
        var subtotal = lines.Sum(x => x.Quantity * x.UnitPrice);
        var tax = lines.Sum(x => x.TaxAmount);
        var total = subtotal + tax;
        var issueDateUtc = DateTime.UtcNow;
        var dueDateUtc = await ResolveDueDateAsync(companyId, request.PaymentTermId, issueDateUtc, request.DueDateUtc, cancellationToken);
        var entity = new PurchaseBill
        {
            CompanyId = companyId,
            ContactId = contactId,
            ContactName = contactName,
            ContactEmail = contactEmail,
            ContactPhoneNumber = contactPhone,
            PurchaseOrderId = purchaseOrderId,
            GoodsReceivedNoteId = goodsReceivedNoteId,
            CreatedFromDocumentId = createdFromDocumentId,
            CreatedFromDocumentNumber = createdFromDocumentNumber,
            CreatedFromDocumentType = createdFromDocumentType,
            PurchaseBillNumber = await GeneratePurchaseBillNumberAsync(companyId, cancellationToken),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
            IssueDateUtc = issueDateUtc,
            DueDateUtc = dueDateUtc,
            Subtotal = subtotal,
            TaxAmount = tax,
            TotalAmount = total,
            AmountDue = total,
            AmountPaid = 0m,
            Lines = lines,
        };
        entity.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(entity);
        dbContext.PurchaseBills.Add(entity);
        return entity;
    }

    private async Task<DateTime> ResolveDueDateAsync(Guid companyId, Guid? paymentTermId, DateTime issueDateUtc, DateTime requestedDueDateUtc, CancellationToken cancellationToken)
    {
        if (!paymentTermId.HasValue || paymentTermId == Guid.Empty)
        {
            return requestedDueDateUtc.ToUniversalTime();
        }

        var paymentTerm = await dbContext.PaymentTerms.FirstOrDefaultAsync(
            x => x.CompanyId == companyId && x.Id == paymentTermId.Value && x.IsActive,
            cancellationToken)
            ?? throw new InvalidOperationException("Select a valid payment term.");

        return issueDateUtc.Date.AddDays(paymentTerm.Days);
    }

    private static List<PurchaseBillLine> BuildFromPurchaseOrder(PurchaseOrder purchaseOrder, IReadOnlyCollection<PurchaseBillSourceLineRequest> requests)
    {
        var duplicateIds = requests.Where(x => x.PurchaseOrderLineId.HasValue).GroupBy(x => x.PurchaseOrderLineId).Where(x => x.Count() > 1).ToList();
        if (duplicateIds.Count > 0) throw new InvalidOperationException("Each purchase order line can only be billed once per document.");

        var lines = new List<PurchaseBillLine>();
        foreach (var request in requests)
        {
            if (!request.PurchaseOrderLineId.HasValue) throw new InvalidOperationException("Purchase order line is required.");
            var sourceLine = purchaseOrder.Lines.FirstOrDefault(x => x.Id == request.PurchaseOrderLineId.Value)
                ?? throw new InvalidOperationException("Selected purchase order line was not found.");
            var remainingReceived = Math.Max(0m, sourceLine.ReceivedQuantity - sourceLine.BilledQuantity);
            if (request.Quantity > remainingReceived) throw new InvalidOperationException($"Bill quantity for '{sourceLine.Description}' exceeds the received quantity available to bill.");
            var lineSubtotal = Math.Round(request.Quantity * sourceLine.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (sourceLine.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);
            lines.Add(new PurchaseBillLine
            {
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
        }
        return lines;
    }

    private static List<PurchaseBillLine> BuildFromGrn(GoodsReceivedNote grn, PurchaseOrder purchaseOrder, IReadOnlyCollection<PurchaseBillSourceLineRequest> requests)
    {
        var duplicateIds = requests.Where(x => x.GoodsReceivedNoteLineId.HasValue).GroupBy(x => x.GoodsReceivedNoteLineId).Where(x => x.Count() > 1).ToList();
        if (duplicateIds.Count > 0) throw new InvalidOperationException("Each GRN line can only be billed once per document.");

        var lines = new List<PurchaseBillLine>();
        foreach (var request in requests)
        {
            if (!request.GoodsReceivedNoteLineId.HasValue) throw new InvalidOperationException("GRN line is required.");
            var grnLine = grn.Lines.FirstOrDefault(x => x.Id == request.GoodsReceivedNoteLineId.Value)
                ?? throw new InvalidOperationException("Selected GRN line was not found.");
            var remaining = Math.Max(0m, grnLine.Quantity - grnLine.BilledQuantity);
            if (request.Quantity > remaining) throw new InvalidOperationException($"Bill quantity for '{grnLine.Description}' exceeds the remaining quantity.");
            var lineSubtotal = Math.Round(request.Quantity * grnLine.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (grnLine.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);
            lines.Add(new PurchaseBillLine
            {
                PurchaseOrderLineId = grnLine.PurchaseOrderLineId,
                GoodsReceivedNoteLineId = grnLine.Id,
                ProductId = grnLine.ProductId,
                TaxCodeId = grnLine.TaxCodeId,
                ProductNameSnapshot = grnLine.ProductNameSnapshot,
                Description = grnLine.Description,
                Quantity = request.Quantity,
                UnitPrice = grnLine.UnitPrice,
                TaxRate = grnLine.TaxRate,
                TaxAmount = lineTax,
                LineTotal = lineSubtotal + lineTax,
            });
        }
        return lines;
    }

    private static void ApplyPurchaseOrderBilledQuantities(PurchaseOrder purchaseOrder, IEnumerable<PurchaseBillLine> lines, decimal direction)
    {
        foreach (var line in lines)
        {
            if (!line.PurchaseOrderLineId.HasValue) continue;
            var poLine = purchaseOrder.Lines.FirstOrDefault(x => x.Id == line.PurchaseOrderLineId.Value);
            if (poLine is null) continue;
            poLine.BilledQuantity = Math.Max(0m, poLine.BilledQuantity + (line.Quantity * direction));
        }
    }

    private static void ApplyGrnBilledQuantities(GoodsReceivedNote grn, PurchaseOrder purchaseOrder, IEnumerable<PurchaseBillLine> lines, decimal direction)
    {
        foreach (var line in lines)
        {
            if (line.GoodsReceivedNoteLineId.HasValue)
            {
                var grnLine = grn.Lines.FirstOrDefault(x => x.Id == line.GoodsReceivedNoteLineId.Value);
                if (grnLine is not null) grnLine.BilledQuantity = Math.Max(0m, grnLine.BilledQuantity + (line.Quantity * direction));
            }
            if (line.PurchaseOrderLineId.HasValue)
            {
                var poLine = purchaseOrder.Lines.FirstOrDefault(x => x.Id == line.PurchaseOrderLineId.Value);
                if (poLine is not null) poLine.BilledQuantity = Math.Max(0m, poLine.BilledQuantity + (line.Quantity * direction));
            }
        }
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private async Task<string> GeneratePurchaseBillNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.PurchaseBills.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"PB-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
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

    private static PurchaseBillListItemDto MapList(PurchaseBill entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchaseBillNumber, entity.ContactId, entity.ContactName, entity.IssueDateUtc, entity.DueDateUtc, entity.Currency, entity.TotalAmount, entity.AmountDue, entity.Status);

    private static PurchaseBillDetailsDto MapDetails(PurchaseBill entity, PurchaseBillRelatedDocumentsDto? relatedDocuments = null) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchaseBillNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.PurchaseOrderId, entity.GoodsReceivedNoteId, entity.CreatedFromDocumentId, entity.CreatedFromDocumentNumber, entity.CreatedFromDocumentType, entity.IssueDateUtc, entity.DueDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.Subtotal, entity.TaxAmount, entity.TotalAmount, entity.AmountDue, entity.AmountPaid, entity.Status, entity.Lines.Select(MapLine).ToList(), relatedDocuments ?? new PurchaseBillRelatedDocumentsDto([]));

    private static PurchaseBillLineDto MapLine(PurchaseBillLine line) =>
        new(line.Id, line.PurchaseOrderLineId, line.GoodsReceivedNoteLineId, line.ProductId, line.TaxCodeId, line.ProductNameSnapshot, line.Description, line.Quantity, line.UnitPrice, line.TaxRate, line.TaxAmount, line.LineTotal);

    private Task<PurchaseBill> LoadOrThrowAsync(Guid purchaseBillId, CancellationToken cancellationToken) =>
        dbContext.PurchaseBills.Include(x => x.Company).Include(x => x.Lines).FirstAsync(x => x.Id == purchaseBillId, cancellationToken);

    private async Task SyncBillStatusesAsync(IQueryable<Guid> companyIds, CancellationToken cancellationToken)
    {
        var candidates = await dbContext.PurchaseBills
            .Where(x => companyIds.Contains(x.CompanyId) && x.Status != PurchaseBillStatus.Cancelled)
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var bill in candidates)
        {
            var nextStatus = PurchaseWorkflowRules.ResolvePurchaseBillStatus(bill);
            if (bill.Status != nextStatus)
            {
                bill.Status = nextStatus;
                bill.UpdatedAtUtc = DateTime.UtcNow;
                changed = true;
            }
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<PurchaseBillRelatedDocumentsDto> LoadRelatedDocumentsAsync(Guid purchaseBillId, Guid companyId, CancellationToken cancellationToken)
    {
        var payments = await dbContext.PurchasePaymentAllocations
            .Where(x => x.PurchaseBillId == purchaseBillId && x.PurchasePayment != null && x.PurchasePayment.CompanyId == companyId)
            .Select(x => new
            {
                PaymentId = x.PurchasePayment!.Id,
                x.PurchasePayment.PurchasePaymentNumber,
                x.PurchasePayment.Status,
                x.PurchasePayment.PaymentDateUtc,
                x.PurchasePayment.CreatedAtUtc,
                x.Amount,
            })
            .Distinct()
            .OrderByDescending(x => x.PaymentDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Select(x => new PurchaseRelatedDocumentDto(x.PaymentId, x.PurchasePaymentNumber, "PurchasePayment", x.Status.ToString(), x.PaymentDateUtc, x.Amount))
            .ToListAsync(cancellationToken);

        return new PurchaseBillRelatedDocumentsDto(payments);
    }

    private sealed record StatusChangeRecord(string EntityName, Guid EntityId, string Metadata, string OldValue, string NewValue);
}
