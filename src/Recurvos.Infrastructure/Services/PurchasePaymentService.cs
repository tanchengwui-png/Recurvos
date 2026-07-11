using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Purchases;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PurchasePaymentService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IPurchasePaymentService
{
    private sealed record RefundAllocationAmount(Guid PurchasePaymentAllocationId, decimal Amount);

    public async Task<IReadOnlyCollection<PurchasePaymentListItemDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyIds = OwnedCompanyIdsQuery();
        var items = await dbContext.PurchasePayments.Include(x => x.Company).Include(x => x.Refunds)
            .Where(x => companyIds.Contains(x.CompanyId))
            .OrderByDescending(x => x.PaymentDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return items.Select(MapList).ToList();
    }

    public async Task<PurchasePaymentDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchasePayments.Include(x => x.Company).Include(x => x.Allocations).Include(x => x.Refunds)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var refundAllocations = await dbContext.PurchaseRefundAllocations
            .Where(x => x.PurchaseRefund!.PurchasePaymentId == entity.Id && x.PurchaseRefund.Status != PurchaseRefundStatus.Cancelled)
            .Select(x => new RefundAllocationAmount(x.PurchasePaymentAllocationId, x.Amount))
            .ToListAsync(cancellationToken);

        return MapDetails(entity, refundAllocations);
    }

    public async Task<PurchasePaymentDetailsDto> CreateAsync(CreatePurchasePaymentRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Allocations.Count == 0)
        {
            throw new InvalidOperationException("At least one purchase bill allocation is required.");
        }

        var requestedBillIds = request.Allocations.Select(x => x.PurchaseBillId).Distinct().ToList();
        if (requestedBillIds.Count != request.Allocations.Count)
        {
            throw new InvalidOperationException("Each purchase bill can only be allocated once per payment.");
        }

        var bills = await dbContext.PurchaseBills
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && requestedBillIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        if (bills.Count != requestedBillIds.Count)
        {
            throw new InvalidOperationException("One or more purchase bills were not found.");
        }

        var firstBill = bills[0];
        if (bills.Any(x => x.CompanyId != firstBill.CompanyId || x.ContactId != firstBill.ContactId))
        {
            throw new InvalidOperationException("All allocated purchase bills must belong to the same supplier.");
        }

        if (bills.Any(x => x.Status == PurchaseBillStatus.Cancelled))
        {
            throw new InvalidOperationException("Cancelled purchase bills cannot be paid.");
        }

        var allocations = new List<PurchasePaymentAllocation>();
        var billPaymentChanges = new List<(Guid BillId, string BillNumber, decimal OldAmountDue, decimal NewAmountDue, string OldStatus, string NewStatus)>();
        foreach (var requestAllocation in request.Allocations)
        {
            var bill = bills.First(x => x.Id == requestAllocation.PurchaseBillId);
            if (requestAllocation.Amount > bill.AmountDue)
            {
                throw new InvalidOperationException($"Payment allocation for {bill.PurchaseBillNumber} exceeds its outstanding amount.");
            }

            allocations.Add(new PurchasePaymentAllocation
            {
                PurchaseBillId = bill.Id,
                PurchaseBillNumber = bill.PurchaseBillNumber,
                Amount = requestAllocation.Amount,
            });
        }

        var totalAmount = allocations.Sum(x => x.Amount);
        var currency = await NormalizeAndValidateCurrencyAsync(firstBill.CompanyId, request.Currency, firstBill.Currency, cancellationToken);
        var entity = new PurchasePayment
        {
            CompanyId = firstBill.CompanyId,
            ContactId = firstBill.ContactId,
            ContactName = firstBill.ContactName,
            ContactEmail = firstBill.ContactEmail,
            ContactPhoneNumber = firstBill.ContactPhoneNumber,
            PurchasePaymentNumber = await GeneratePurchasePaymentNumberAsync(firstBill.CompanyId, cancellationToken),
            PaymentDateUtc = request.PaymentDateUtc.ToUniversalTime(),
            Currency = currency,
            ReferenceNo = request.ReferenceNo.Trim(),
            Notes = request.Notes.Trim(),
            Status = PurchasePaymentStatus.Posted,
            TotalAmount = totalAmount,
            Allocations = allocations,
        };

        foreach (var allocation in allocations)
        {
            var bill = bills.First(x => x.Id == allocation.PurchaseBillId);
            var oldAmountDue = bill.AmountDue;
            var oldStatus = bill.Status.ToString();
            ApplyBillPayment(bill, allocation.Amount);
            billPaymentChanges.Add((bill.Id, bill.PurchaseBillNumber, oldAmountDue, bill.AmountDue, oldStatus, bill.Status.ToString()));
        }

        dbContext.PurchasePayments.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-payment.posted", nameof(PurchasePayment), entity.Id.ToString(), entity.PurchasePaymentNumber, cancellationToken);
        foreach (var change in billPaymentChanges)
        {
            await auditService.WriteChangeAsync("purchase-bill.payment-applied", nameof(PurchaseBill), change.BillId.ToString(), change.OldAmountDue.ToString("0.00"), change.NewAmountDue.ToString("0.00"), change.BillNumber, cancellationToken);
            if (change.OldStatus != change.NewStatus)
            {
                await auditService.WriteChangeAsync("purchase-bill.status-auto-updated", nameof(PurchaseBill), change.BillId.ToString(), change.OldStatus, change.NewStatus, change.BillNumber, cancellationToken);
            }
        }
        return (await GetByIdAsync(entity.Id, cancellationToken))!;
    }

    public async Task<PurchasePaymentDetailsDto?> ReverseAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PurchasePayments.Include(x => x.Company).Include(x => x.Allocations)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        if (entity.Status == PurchasePaymentStatus.Reversed)
        {
            return await GetByIdAsync(entity.Id, cancellationToken);
        }

        var billIds = entity.Allocations.Select(x => x.PurchaseBillId).Distinct().ToList();
        var bills = await dbContext.PurchaseBills
            .Where(x => billIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        var billReversalChanges = new List<(Guid BillId, string BillNumber, decimal OldAmountDue, decimal NewAmountDue, string OldStatus, string NewStatus)>();

        foreach (var allocation in entity.Allocations)
        {
            var bill = bills.First(x => x.Id == allocation.PurchaseBillId);
            var oldAmountDue = bill.AmountDue;
            var oldStatus = bill.Status.ToString();
            bill.AmountPaid = Math.Max(0m, bill.AmountPaid - allocation.Amount);
            bill.AmountDue = Math.Max(0m, bill.TotalAmount - bill.AmountPaid);
            bill.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(bill);
            billReversalChanges.Add((bill.Id, bill.PurchaseBillNumber, oldAmountDue, bill.AmountDue, oldStatus, bill.Status.ToString()));
        }

        entity.Status = PurchasePaymentStatus.Reversed;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("purchase-payment.reversed", nameof(PurchasePayment), entity.Id.ToString(), entity.PurchasePaymentNumber, cancellationToken);
        foreach (var change in billReversalChanges)
        {
            await auditService.WriteChangeAsync("purchase-bill.payment-reversed", nameof(PurchaseBill), change.BillId.ToString(), change.OldAmountDue.ToString("0.00"), change.NewAmountDue.ToString("0.00"), change.BillNumber, cancellationToken);
            if (change.OldStatus != change.NewStatus)
            {
                await auditService.WriteChangeAsync("purchase-bill.status-auto-updated", nameof(PurchaseBill), change.BillId.ToString(), change.OldStatus, change.NewStatus, change.BillNumber, cancellationToken);
            }
        }
        return await GetByIdAsync(entity.Id, cancellationToken);
    }

    private static void ApplyBillPayment(PurchaseBill bill, decimal amount)
    {
        bill.AmountPaid += amount;
        bill.AmountDue = Math.Max(0m, bill.TotalAmount - bill.AmountPaid);
        bill.Status = PurchaseWorkflowRules.ResolvePurchaseBillStatus(bill);
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private async Task<string> GeneratePurchasePaymentNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var count = await dbContext.PurchasePayments.CountAsync(x => x.CompanyId == companyId, cancellationToken);
        return $"PP-{DateTime.UtcNow:yyyy}-{(count + 1).ToString().PadLeft(4, '0')}";
    }

    private async Task<string> NormalizeAndValidateCurrencyAsync(Guid companyId, string? requestCurrency, string? fallbackCurrency, CancellationToken cancellationToken)
    {
        var value = string.IsNullOrWhiteSpace(requestCurrency) ? fallbackCurrency : requestCurrency;
        string currency;
        if (!string.IsNullOrWhiteSpace(value))
        {
            currency = value.Trim().ToUpperInvariant();
        }
        else
        {
            var companyCurrency = await dbContext.Companies
                .Where(x => x.Id == companyId)
                .Select(x => x.Currency)
                .FirstOrDefaultAsync(cancellationToken);

            currency = string.IsNullOrWhiteSpace(companyCurrency) ? string.Empty : companyCurrency.Trim().ToUpperInvariant();
        }

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

    private static PurchasePaymentListItemDto MapList(PurchasePayment entity) =>
        new(entity.Id, entity.CompanyId, entity.Company?.Name ?? string.Empty, entity.PurchasePaymentNumber, entity.ContactId, entity.ContactName, entity.PaymentDateUtc, entity.Currency, entity.TotalAmount, entity.Refunds.Where(x => x.Status != PurchaseRefundStatus.Cancelled).Sum(x => x.TotalAmount), entity.Status);

    private static PurchasePaymentDetailsDto MapDetails(PurchasePayment entity, IReadOnlyCollection<RefundAllocationAmount> refundAllocations)
    {
        var refundAmountsByAllocationId = refundAllocations
            .GroupBy(x => x.PurchasePaymentAllocationId)
            .ToDictionary(x => x.Key, x => x.Sum(item => item.Amount));

        return new PurchasePaymentDetailsDto(
            entity.Id,
            entity.CompanyId,
            entity.Company?.Name ?? string.Empty,
            entity.PurchasePaymentNumber,
            entity.ContactId,
            entity.ContactName,
            entity.ContactEmail,
            entity.ContactPhoneNumber,
            entity.PaymentDateUtc,
            entity.Currency,
            entity.ReferenceNo,
            entity.Notes,
            entity.TotalAmount,
            entity.Refunds.Where(x => x.Status != PurchaseRefundStatus.Cancelled).Sum(x => x.TotalAmount),
            entity.Status,
            entity.Allocations.Select(allocation => MapAllocation(allocation, refundAmountsByAllocationId.GetValueOrDefault(allocation.Id))).ToList(),
            entity.Refunds.OrderByDescending(x => x.RefundDateUtc).ThenByDescending(x => x.CreatedAtUtc).Select(MapRefundSummary).ToList());
    }

    private static PurchasePaymentDetailsDto MapDetails(PurchasePayment entity) => MapDetails(entity, []);

    private static PurchasePaymentAllocationDto MapAllocation(PurchasePaymentAllocation entity, decimal refundedAmount) =>
        new(entity.Id, entity.PurchaseBillId, entity.PurchaseBillNumber, entity.Amount, refundedAmount);

    private static PurchasePaymentRefundSummaryDto MapRefundSummary(PurchaseRefund entity) =>
        new(entity.Id, entity.PurchaseRefundNumber, entity.RefundDateUtc, entity.TotalAmount, entity.Status);
}
