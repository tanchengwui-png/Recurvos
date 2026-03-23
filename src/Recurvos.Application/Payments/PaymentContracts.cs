using Recurvos.Domain.Enums;
using Recurvos.Application.Refunds;

namespace Recurvos.Application.Payments;

public sealed class CreatePaymentLinkCommand
{
    public Guid CompanyId { get; set; }
    public Guid GatewayConfigurationCompanyId { get; set; }
    public Guid InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string? CustomerMobile { get; set; }
    public string Description { get; set; } = string.Empty;
    public string CallbackUrl { get; set; } = string.Empty;
    public string? RedirectUrl { get; set; }
}

public sealed record PaymentLinkResult(string ExternalPaymentId, string PaymentUrl, string RawResponse);

public sealed record PaymentAttemptDto(int AttemptNumber, PaymentStatus Status, string? FailureCode, string? FailureMessage);

public sealed record PaymentDto(
    Guid Id,
    Guid InvoiceId,
    string InvoiceNumber,
    decimal Amount,
    string Currency,
    decimal RefundedAmount,
    decimal NetCollectedAmount,
    PaymentStatus Status,
    string GatewayName,
    string? ExternalPaymentId,
    string? PaymentLinkUrl,
    bool HasProof,
    bool HasReceipt,
    string? ProofFileName,
    DateTime? PaidAtUtc,
    IReadOnlyCollection<PaymentAttemptDto> Attempts,
    IReadOnlyCollection<RefundDto> Refunds,
    IReadOnlyCollection<PaymentDisputeDto> Disputes);

public sealed record PaymentDisputeDto(
    Guid Id,
    string ExternalDisputeId,
    decimal Amount,
    string Reason,
    string Status,
    DateTime OpenedAtUtc,
    DateTime? ResolvedAtUtc);

public sealed record PublicPaymentStatusDto(
    string ExternalPaymentId,
    string InvoiceNumber,
    string PaymentStatus,
    string InvoiceStatus,
    bool IsPaid,
    decimal Amount,
    string Currency,
    DateTime? PaidAtUtc);

public interface IPaymentService
{
    Task<IReadOnlyCollection<PaymentDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<PaymentDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PublicPaymentStatusDto?> GetPublicStatusAsync(string? externalPaymentId, Guid? invoiceId, CancellationToken cancellationToken = default);
    Task<PaymentDto?> CreatePaymentLinkAsync(Guid invoiceId, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadProofAsync(Guid id, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadReceiptAsync(Guid id, CancellationToken cancellationToken = default);
    Task<int> RetryFailedPaymentsAsync(CancellationToken cancellationToken = default);
}
