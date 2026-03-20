using System.ComponentModel.DataAnnotations;
using Recurvos.Application.Invoices;

namespace Recurvos.Application.Payments;

public sealed record PaymentConfirmationLinkDto(Guid InvoiceId, string InvoiceNumber, string Url);

public sealed record PendingPaymentConfirmationDto(
    Guid Id,
    Guid InvoiceId,
    string InvoiceNumber,
    string CustomerName,
    decimal Amount,
    string Currency,
    DateTime PaidAtUtc,
    string PayerName,
    string? TransactionReference,
    string? Notes,
    bool HasProof,
    string? ProofFileName,
    DateTime CreatedAtUtc,
    string Status,
    string? ReviewNote);

public sealed record PublicPaymentConfirmationInvoiceDto(
    string InvoiceNumber,
    string CustomerName,
    decimal BalanceAmount,
    string Currency,
    DateTime DueDateUtc,
    string? PaymentLinkUrl,
    int ProofUploadMaxBytes,
    bool AutoCompressUploads,
    int UploadImageMaxDimension,
    int UploadImageQuality);

public sealed class SubmitPublicPaymentConfirmationRequest
{
    [Required]
    public string Token { get; set; } = string.Empty;

    [Required, MaxLength(150)]
    public string PayerName { get; set; } = string.Empty;

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Amount { get; set; }

    [Required]
    public DateTime PaidAtUtc { get; set; }

    [MaxLength(100)]
    public string? TransactionReference { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }
}

public sealed class ReviewPaymentConfirmationRequest
{
    [MaxLength(500)]
    public string? ReviewNote { get; set; }
}

public interface IPaymentConfirmationService
{
    Task<PaymentConfirmationLinkDto?> GetOrCreateLinkAsync(Guid invoiceId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PendingPaymentConfirmationDto>> GetPendingAsync(CancellationToken cancellationToken = default);
    Task<PendingPaymentConfirmationDto?> ApproveAsync(Guid id, ReviewPaymentConfirmationRequest request, CancellationToken cancellationToken = default);
    Task<PendingPaymentConfirmationDto?> RejectAsync(Guid id, ReviewPaymentConfirmationRequest request, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadProofAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PublicPaymentConfirmationInvoiceDto?> GetPublicInvoiceAsync(string token, CancellationToken cancellationToken = default);
    Task SubmitPublicAsync(SubmitPublicPaymentConfirmationRequest request, PaymentProofUpload? proof, CancellationToken cancellationToken = default);
}
