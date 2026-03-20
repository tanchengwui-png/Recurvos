using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Refunds;

public sealed class RecordRefundRequest
{
    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Amount { get; set; }

    [Required, MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ExternalRefundId { get; set; }

    public Guid? InvoiceId { get; set; }
}

public sealed record RefundDto(
    Guid Id,
    Guid PaymentId,
    Guid? InvoiceId,
    decimal Amount,
    string Currency,
    string Reason,
    string? ExternalRefundId,
    RefundStatus Status,
    DateTime CreatedAtUtc,
    Guid? CreatedByUserId);

public interface IRefundService
{
    Task<IReadOnlyCollection<RefundDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<RefundDto?> RecordAsync(Guid paymentId, RecordRefundRequest request, CancellationToken cancellationToken = default);
}
