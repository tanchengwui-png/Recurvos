using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Refunds;
using Recurvos.Application.Invoices;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class RefundService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : IRefundService
{
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private static readonly HashSet<string> AllowedProofExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    };

    private static readonly HashSet<string> AllowedProofContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpeg",
        "image/webp",
    };

    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<RefundDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        var refunds = await dbContext.Refunds
            .Where(x => x.CompanyId == companyId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return refunds.Select(Map).ToList();
    }

    public async Task<RefundDto?> RecordAsync(Guid paymentId, RecordRefundRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        var payment = await dbContext.Payments
            .Include(x => x.Invoice)
            .Include(x => x.Refunds)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == paymentId, cancellationToken);

        if (payment is null)
        {
            return null;
        }

        if (payment.Status != PaymentStatus.Succeeded)
        {
            throw new InvalidOperationException("Only succeeded payments can be refunded.");
        }

        if (request.InvoiceId.HasValue && request.InvoiceId != payment.InvoiceId)
        {
            throw new InvalidOperationException("Refund invoice must match the payment invoice.");
        }

        var totalRefunded = payment.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount);
        var collectedAmount = payment.Amount;
        if (totalRefunded + request.Amount > collectedAmount)
        {
            throw new InvalidOperationException("Refund total cannot exceed payment collected.");
        }

        var refund = new Refund
        {
            CompanyId = companyId,
            PaymentId = payment.Id,
            InvoiceId = request.InvoiceId ?? payment.InvoiceId,
            Amount = request.Amount,
            Currency = payment.Currency,
            Reason = request.Reason.Trim(),
            ExternalRefundId = string.IsNullOrWhiteSpace(request.ExternalRefundId) ? null : request.ExternalRefundId.Trim(),
            Status = RefundStatus.Succeeded,
            CreatedByUserId = currentUserService.UserId
        };

        dbContext.Refunds.Add(refund);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("refund.recorded", nameof(Refund), refund.Id.ToString(), $"payment={payment.Id}", cancellationToken);
        return Map(refund);
    }

    internal static RefundDto Map(Refund refund) =>
        new(refund.Id, refund.PaymentId, refund.InvoiceId, refund.Amount, refund.Currency, refund.Reason, refund.ExternalRefundId, refund.Status, refund.CreatedAtUtc, refund.CreatedByUserId);

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
}
