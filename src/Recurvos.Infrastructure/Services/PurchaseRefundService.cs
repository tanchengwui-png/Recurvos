using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Purchases;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PurchaseRefundService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IPurchaseRefundService
{
    public async Task<IReadOnlyCollection<PurchaseRefundListItemDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyIds = OwnedCompanyIdsQuery();
        var items = await dbContext.PurchaseRefunds
            .Include(x => x.Company)
            .Include(x => x.PurchasePayment)
            .Where(x => companyIds.Contains(x.CompanyId))
            .OrderByDescending(x => x.RefundDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return items.Select(MapList).ToList();
    }

    public async Task<PurchaseRefundDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseRefunds
            .Include(x => x.Company)
            .Include(x => x.PurchasePayment)
            .Include(x => x.Allocations)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);

        return entity is null ? null : MapDetails(entity);
    }

    public async Task<PurchaseRefundDetailsDto?> CreateAsync(Guid purchasePaymentId, CreatePurchaseRefundRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Allocations.Count == 0)
        {
            throw new InvalidOperationException("At least one purchase refund allocation is required.");
        }

        var payment = await dbContext.PurchasePayments
            .Include(x => x.Company)
            .Include(x => x.Allocations)
            .Include(x => x.Refunds)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == purchasePaymentId, cancellationToken);
        if (payment is null)
        {
            return null;
        }

        if (payment.Status != PurchasePaymentStatus.Posted)
        {
            throw new InvalidOperationException("Only posted purchase payments can be refunded.");
        }

        var requestedAllocationIds = request.Allocations.Select(x => x.PurchasePaymentAllocationId).Distinct().ToList();
        if (requestedAllocationIds.Count != request.Allocations.Count)
        {
            throw new InvalidOperationException("Each purchase payment allocation can only be refunded once per document.");
        }

        var sourceAllocations = payment.Allocations
            .Where(x => requestedAllocationIds.Contains(x.Id))
            .ToDictionary(x => x.Id);
        if (sourceAllocations.Count != requestedAllocationIds.Count)
        {
            throw new InvalidOperationException("One or more purchase payment allocations were not found.");
        }

        var priorRefundAllocations = await dbContext.PurchaseRefundAllocations
            .Where(x => requestedAllocationIds.Contains(x.PurchasePaymentAllocationId) && x.PurchaseRefund!.Status != PurchaseRefundStatus.Cancelled)
            .GroupBy(x => x.PurchasePaymentAllocationId)
            .Select(group => new RefundAmountRow(group.Key, group.Sum(item => item.Amount)))
            .ToListAsync(cancellationToken);
        var alreadyRefundedByAllocationId = priorRefundAllocations.ToDictionary(x => x.PurchasePaymentAllocationId, x => x.Amount);

        var billIds = sourceAllocations.Values.Select(x => x.PurchaseBillId).Distinct().ToList();
        var bills = await dbContext.PurchaseBills
            .Where(x => billIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var allocations = new List<PurchaseRefundAllocation>();
        foreach (var requestAllocation in request.Allocations)
        {
            var sourceAllocation = sourceAllocations[requestAllocation.PurchasePaymentAllocationId];
            var alreadyRefunded = alreadyRefundedByAllocationId.GetValueOrDefault(sourceAllocation.Id);
            var remainingRefundable = Math.Max(0m, sourceAllocation.Amount - alreadyRefunded);
            if (requestAllocation.Amount > remainingRefundable)
            {
                throw new InvalidOperationException($"Refund allocation for {sourceAllocation.PurchaseBillNumber} exceeds the remaining refundable amount.");
            }

            allocations.Add(new PurchaseRefundAllocation
            {
                PurchasePaymentAllocationId = sourceAllocation.Id,
                PurchaseBillId = sourceAllocation.PurchaseBillId,
                PurchaseBillNumber = sourceAllocation.PurchaseBillNumber,
                Amount = requestAllocation.Amount,
            });
        }

        var totalAmount = allocations.Sum(x => x.Amount);
        if (totalAmount <= 0m)
        {
            throw new InvalidOperationException("Purchase refund amount must be greater than zero.");
        }

        var currency = await ValidateCurrencyAsync(payment.CompanyId, payment.Currency, cancellationToken);

        var entity = new PurchaseRefund
        {
            CompanyId = payment.CompanyId,
            PurchasePaymentId = payment.Id,
            ContactId = payment.ContactId,
            ContactName = payment.ContactName,
            ContactEmail = payment.ContactEmail,
            ContactPhoneNumber = payment.ContactPhoneNumber,
            PurchaseRefundNumber = await GeneratePurchaseRefundNumberAsync(payment.CompanyId, cancellationToken),
            RefundDateUtc = request.RefundDateUtc.Kind == DateTimeKind.Utc ? request.RefundDateUtc : request.RefundDateUtc.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
            TotalAmount = totalAmount,
            Status = PurchaseRefundStatus.Refunded,
            Allocations = allocations,
        };

        foreach (var allocation in allocations)
        {
            var bill = bills[allocation.PurchaseBillId];
            bill.AmountPaid = Math.Max(0m, bill.AmountPaid - allocation.Amount);
            bill.AmountDue = Math.Max(0m, bill.TotalAmount - bill.AmountPaid);
            bill.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(bill);
        }

        dbContext.PurchaseRefunds.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-refund.recorded", nameof(PurchaseRefund), entity.Id.ToString(), entity.PurchaseRefundNumber, cancellationToken);
        return await GetByIdAsync(entity.Id, cancellationToken);
    }

    public async Task<PurchaseRefundDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchaseRefunds
            .Include(x => x.Company)
            .Include(x => x.PurchasePayment)
            .Include(x => x.Allocations)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        if (entity.Status == PurchaseRefundStatus.Cancelled)
        {
            return MapDetails(entity);
        }

        var billIds = entity.Allocations.Select(x => x.PurchaseBillId).Distinct().ToList();
        var bills = await dbContext.PurchaseBills
            .Where(x => billIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (bills.Values.Any(x => x.Status == PurchaseBillStatus.Cancelled))
        {
            throw new InvalidOperationException("Cancelled purchase bills prevent this purchase refund from being cancelled.");
        }

        foreach (var allocation in entity.Allocations)
        {
            var bill = bills[allocation.PurchaseBillId];
            bill.AmountPaid += allocation.Amount;
            bill.AmountDue = Math.Max(0m, bill.TotalAmount - bill.AmountPaid);
            bill.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(bill);
        }

        entity.Status = PurchaseRefundStatus.Cancelled;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-refund.cancelled", nameof(PurchaseRefund), entity.Id.ToString(), entity.PurchaseRefundNumber, cancellationToken);
        return MapDetails(entity);
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private async Task<string> GeneratePurchaseRefundNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.PurchaseRefunds.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"PRF-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
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

    private static PurchaseRefundListItemDto MapList(PurchaseRefund entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchasePaymentId, entity.PurchasePayment?.PurchasePaymentNumber ?? string.Empty, entity.PurchaseRefundNumber, entity.ContactId, entity.ContactName, entity.RefundDateUtc, entity.Currency, entity.TotalAmount, entity.Status);

    private static PurchaseRefundDetailsDto MapDetails(PurchaseRefund entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchasePaymentId, entity.PurchasePayment?.PurchasePaymentNumber ?? string.Empty, entity.PurchaseRefundNumber, entity.ContactId, entity.ContactName, entity.ContactEmail, entity.ContactPhoneNumber, entity.RefundDateUtc, entity.Currency, entity.ReferenceNo, entity.Notes, entity.TotalAmount, entity.Status, entity.Allocations.Select(MapAllocation).ToList());

    private static PurchaseRefundAllocationDto MapAllocation(PurchaseRefundAllocation entity) =>
        new(entity.Id, entity.PurchasePaymentAllocationId, entity.PurchaseBillId, entity.PurchaseBillNumber, entity.Amount);

    private sealed record RefundAmountRow(Guid PurchasePaymentAllocationId, decimal Amount);
}
