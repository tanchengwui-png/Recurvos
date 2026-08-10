using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Purchases;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PurchaseCreditNoteService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    InventoryMovementService inventoryMovementService) : IPurchaseCreditNoteService
{
    public async Task<IReadOnlyCollection<PurchaseCreditNoteListItemDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyIds = OwnedCompanyIdsQuery();
        var items = await dbContext.PurchaseCreditNotes.Include(x => x.Company).Include(x => x.PurchaseBill)
            .Where(x => companyIds.Contains(x.CompanyId))
            .OrderByDescending(x => x.IssuedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return items.Select(MapList).ToList();
    }

    public async Task<PurchaseCreditNoteDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseCreditNotes.Include(x => x.Company).Include(x => x.PurchaseBill).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        return entity is null ? null : MapDetails(entity);
    }

    public async Task<PurchaseCreditNoteDetailsDto> CreateAsync(CreatePurchaseCreditNoteRequest request, CancellationToken cancellationToken = default)
    {
        var bill = await dbContext.PurchaseBills
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == request.PurchaseBillId, cancellationToken)
            ?? throw new InvalidOperationException("Purchase bill not found.");

        if (bill.Status == PurchaseBillStatus.Cancelled)
        {
            throw new InvalidOperationException("Cancelled purchase bills cannot receive purchase credit notes.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new InvalidOperationException("Reason is required.");
        }

        if (request.Lines.Count == 0)
        {
            throw new InvalidOperationException("At least one purchase credit note line is required.");
        }

        var lines = request.Lines.Select(line =>
        {
            if (string.IsNullOrWhiteSpace(line.Description))
            {
                throw new InvalidOperationException("Purchase credit note description is required.");
            }

            return new PurchaseCreditNoteLine
            {
                Description = line.Description.Trim(),
                Quantity = line.Quantity,
                UnitAmount = line.UnitAmount,
                TaxAmount = line.TaxAmount,
                LineTotal = (line.Quantity * line.UnitAmount) + line.TaxAmount,
            };
        }).ToList();

        var subtotalReduction = lines.Sum(x => x.Quantity * x.UnitAmount);
        var taxReduction = lines.Sum(x => x.TaxAmount);
        var totalReduction = lines.Sum(x => x.LineTotal);
        if (totalReduction <= 0m)
        {
            throw new InvalidOperationException("Purchase credit note amount must be greater than zero.");
        }

        if (totalReduction > bill.AmountDue)
        {
            throw new InvalidOperationException($"Purchase credit note amount cannot exceed the remaining outstanding amount of {bill.Currency} {bill.AmountDue:0.00}.");
        }

        var currency = await ValidateCurrencyAsync(bill.CompanyId, bill.Currency, cancellationToken);

        var entity = new PurchaseCreditNote
        {
            CompanyId = bill.CompanyId,
            PurchaseBillId = bill.Id,
            ContactId = bill.ContactId,
            ContactName = bill.ContactName,
            ContactEmail = bill.ContactEmail,
            ContactPhoneNumber = bill.ContactPhoneNumber,
            PurchaseCreditNoteNumber = await GeneratePurchaseCreditNoteNumberAsync(bill.CompanyId, cancellationToken),
            Currency = currency,
            SubtotalReduction = subtotalReduction,
            TaxReduction = taxReduction,
            TotalReduction = totalReduction,
            Reason = request.Reason.Trim(),
            Status = PurchaseCreditNoteStatus.Applied,
            IssuedAtUtc = request.IssuedAtUtc.Kind == DateTimeKind.Utc ? request.IssuedAtUtc : request.IssuedAtUtc.ToUniversalTime(),
            Lines = lines,
        };

        var oldBillAmountDue = bill.AmountDue;
        var oldBillStatus = bill.Status.ToString();
        ApplyCreditToBill(bill, totalReduction);
        dbContext.PurchaseCreditNotes.Add(entity);
        await inventoryMovementService.ApplyPurchaseCreditNoteAsync(entity, await dbContext.PurchaseBills.Include(x => x.Lines).FirstAsync(x => x.Id == bill.Id, cancellationToken), cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-credit-note.applied", nameof(PurchaseCreditNote), entity.Id.ToString(), entity.PurchaseCreditNoteNumber, cancellationToken);
        await auditService.WriteChangeAsync("purchase-bill.credit-applied", nameof(PurchaseBill), bill.Id.ToString(), oldBillAmountDue.ToString("0.00"), bill.AmountDue.ToString("0.00"), bill.PurchaseBillNumber, cancellationToken);
        if (oldBillStatus != bill.Status.ToString())
        {
            await auditService.WriteChangeAsync("purchase-bill.status-auto-updated", nameof(PurchaseBill), bill.Id.ToString(), oldBillStatus, bill.Status.ToString(), bill.PurchaseBillNumber, cancellationToken);
        }
        return (await GetByIdAsync(entity.Id, cancellationToken))!;
    }

    public async Task<PurchaseCreditNoteDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseCreditNotes.Include(x => x.Company).Include(x => x.PurchaseBill).Include(x => x.Lines)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        if (entity.Status == PurchaseCreditNoteStatus.Cancelled)
        {
            return MapDetails(entity);
        }

        if (entity.PurchaseBill is null)
        {
            throw new InvalidOperationException("Referenced purchase bill not found.");
        }

        var oldBillAmountDue = entity.PurchaseBill.AmountDue;
        var oldBillStatus = entity.PurchaseBill.Status.ToString();
        entity.PurchaseBill.TotalAmount += entity.TotalReduction;
        entity.PurchaseBill.AmountDue = Math.Max(0m, entity.PurchaseBill.TotalAmount - entity.PurchaseBill.AmountPaid);
        entity.PurchaseBill.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(entity.PurchaseBill);
        entity.Status = PurchaseCreditNoteStatus.Cancelled;

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-credit-note.cancelled", nameof(PurchaseCreditNote), entity.Id.ToString(), entity.PurchaseCreditNoteNumber, cancellationToken);
        await auditService.WriteChangeAsync("purchase-bill.credit-reversed", nameof(PurchaseBill), entity.PurchaseBill.Id.ToString(), oldBillAmountDue.ToString("0.00"), entity.PurchaseBill.AmountDue.ToString("0.00"), entity.PurchaseBill.PurchaseBillNumber, cancellationToken);
        if (oldBillStatus != entity.PurchaseBill.Status.ToString())
        {
            await auditService.WriteChangeAsync("purchase-bill.status-auto-updated", nameof(PurchaseBill), entity.PurchaseBill.Id.ToString(), oldBillStatus, entity.PurchaseBill.Status.ToString(), entity.PurchaseBill.PurchaseBillNumber, cancellationToken);
        }
        return MapDetails(entity);
    }

    private static void ApplyCreditToBill(PurchaseBill bill, decimal creditAmount)
    {
        bill.TotalAmount = Math.Max(0m, bill.TotalAmount - creditAmount);
        bill.AmountDue = Math.Max(0m, bill.TotalAmount - bill.AmountPaid);
        bill.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(bill);
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery()
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        return dbContext.Companies.Where(x => x.Id == companyId).Select(x => x.Id);
    }

    private async Task<string> GeneratePurchaseCreditNoteNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.PurchaseCreditNotes.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"PCN-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
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

    private static PurchaseCreditNoteListItemDto MapList(PurchaseCreditNote entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchaseBillId, entity.PurchaseBill?.PurchaseBillNumber ?? string.Empty, entity.PurchaseCreditNoteNumber, entity.ContactId, entity.ContactName, entity.IssuedAtUtc, entity.Currency, entity.TotalReduction, entity.Status);

    private static PurchaseCreditNoteDetailsDto MapDetails(PurchaseCreditNote entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchaseBillId, entity.PurchaseBill?.PurchaseBillNumber ?? string.Empty, entity.PurchaseCreditNoteNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.IssuedAtUtc, entity.Currency, entity.SubtotalReduction, entity.TaxReduction, entity.TotalReduction, entity.Reason, entity.Status, entity.Lines.Select(MapLine).ToList());

    private static PurchaseCreditNoteLineDto MapLine(PurchaseCreditNoteLine entity) =>
        new(entity.Id, entity.Description, entity.Quantity, entity.UnitAmount, entity.TaxAmount, entity.LineTotal);
}
