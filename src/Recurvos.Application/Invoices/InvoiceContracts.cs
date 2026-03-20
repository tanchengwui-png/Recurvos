using System.ComponentModel.DataAnnotations;
using Recurvos.Application.CreditNotes;
using Recurvos.Application.Refunds;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Invoices;

public sealed class RecordInvoicePaymentRequest
{
    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Amount { get; set; }

    [Required, MaxLength(50)]
    public string Method { get; set; } = "Manual";

    [MaxLength(100)]
    public string? Reference { get; set; }

    public DateTime? PaidAtUtc { get; set; }
}

public sealed class ReverseInvoicePaymentRequest
{
    [Required, MaxLength(250)]
    public string Reason { get; set; } = string.Empty;
}

public sealed record PaymentProofUpload(string FileName, string ContentType, byte[] Content);

public sealed class CreateInvoiceLineItemRequest
{
    [Required, MaxLength(250)]
    public string Description { get; set; } = string.Empty;

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    [Range(typeof(decimal), "0.00", "9999999999999999")]
    public decimal UnitAmount { get; set; }
}

public sealed class CreateInvoiceRequest
{
    [Required]
    public Guid CustomerId { get; set; }

    [Required]
    public DateTime DueDateUtc { get; set; }

    [Required, MinLength(1)]
    public List<CreateInvoiceLineItemRequest> LineItems { get; set; } = new();
}

public sealed class PreviewInvoiceRequest
{
    [Required, MaxLength(200)]
    public string CustomerName { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? CustomerEmail { get; set; }

    [MaxLength(500)]
    public string? CustomerAddress { get; set; }

    [MaxLength(50)]
    public string? InvoiceNumber { get; set; }

    [Required]
    public DateTime DueDateUtc { get; set; }

    public bool IsTaxEnabled { get; set; }

    [MaxLength(50)]
    public string? TaxName { get; set; }

    [Range(typeof(decimal), "0.00", "100.00")]
    public decimal? TaxRate { get; set; }

    [MaxLength(100)]
    public string? TaxRegistrationNo { get; set; }

    [Required, MinLength(1)]
    public List<CreateInvoiceLineItemRequest> LineItems { get; set; } = new();
}

public sealed class PreviewReceiptRequest
{
    [Required, MaxLength(200)]
    public string CustomerName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? ReceiptNumber { get; set; }

    [MaxLength(50)]
    public string? InvoiceNumber { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Amount { get; set; }

    [MaxLength(10)]
    public string Currency { get; set; } = "MYR";

    [Required, MaxLength(100)]
    public string PaymentMethod { get; set; } = "Manual";

    [Required]
    public DateTime PaidAtUtc { get; set; }
}

public sealed record InvoiceLineItemDto(string Description, int Quantity, decimal UnitAmount, decimal TotalAmount);

public sealed record InvoiceHistoryDto(DateTime CreatedAtUtc, string Action, string Description);
public sealed record WhatsAppRetryResultDto(bool Success, string Message, string? ExternalMessageId);
public sealed record InvoiceWhatsAppLinkOptionsDto(
    Guid InvoiceId,
    string InvoiceNumber,
    string? ActionLink,
    string? PaymentGatewayLink,
    string? PaymentConfirmationLink);

public sealed record InvoiceDto(
    Guid Id,
    string InvoiceNumber,
    Guid CustomerId,
    string CustomerName,
    string? CustomerPhoneNumber,
    Guid? SubscriptionId,
    InvoiceStatus Status,
    string StatusLabel,
    DateTime IssueDateUtc,
    DateTime DueDateUtc,
    DateTime? PeriodStartUtc,
    DateTime? PeriodEndUtc,
    InvoiceSourceType SourceType,
    decimal Subtotal,
    decimal TaxAmount,
    bool IsTaxEnabled,
    string? TaxName,
    decimal? TaxRate,
    string? TaxRegistrationNo,
    decimal Total,
    decimal PaidAmount,
    decimal BalanceAmount,
    string Currency,
    string? PdfPath,
    IReadOnlyCollection<InvoiceLineItemDto> LineItems,
    IReadOnlyCollection<InvoiceHistoryDto> History,
    IReadOnlyCollection<CreditNoteDto> CreditNotes,
    IReadOnlyCollection<RefundDto> Refunds,
    decimal CreditedAmount,
    decimal EligibleCreditAmount);

public interface IInvoiceService
{
    Task<IReadOnlyCollection<InvoiceDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<InvoiceDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<InvoiceDto> CreateAsync(CreateInvoiceRequest request, CancellationToken cancellationToken = default);
    Task<bool> SendInvoiceAsync(Guid id, CancellationToken cancellationToken = default);
    Task<InvoiceDto?> MarkPaidAsync(Guid id, CancellationToken cancellationToken = default);
    Task<InvoiceDto?> RecordPaymentAsync(Guid id, RecordInvoicePaymentRequest request, CancellationToken cancellationToken = default);
    Task<InvoiceDto?> RecordPaymentWithProofAsync(Guid id, RecordInvoicePaymentRequest request, PaymentProofUpload? proof, CancellationToken cancellationToken = default);
    Task<InvoiceDto?> ReverseLatestManualPaymentAsync(Guid id, ReverseInvoicePaymentRequest request, CancellationToken cancellationToken = default);
    Task<InvoiceDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadPdfAsync(Guid id, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadReceiptAsync(Guid id, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)> GeneratePreviewPdfAsync(PreviewInvoiceRequest request, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)> GenerateReceiptPreviewPdfAsync(PreviewReceiptRequest request, CancellationToken cancellationToken = default);
    Task<InvoiceDto?> GenerateSubscriptionInvoiceNowAsync(Guid subscriptionId, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> GenerateSubscriptionPreviewPdfAsync(Guid subscriptionId, CancellationToken cancellationToken = default);
    Task<int> CountDueInvoicesForCurrentCompanyAsync(CancellationToken cancellationToken = default);
    Task<int> GenerateDueInvoicesForCurrentCompanyAsync(CancellationToken cancellationToken = default);
    Task<int> GenerateDueInvoicesAsync(CancellationToken cancellationToken = default);
    Task<int> SendRemindersAsync(CancellationToken cancellationToken = default);
    Task<WhatsAppRetryResultDto> RetryFailedWhatsAppNotificationAsync(Guid notificationId, CancellationToken cancellationToken = default);
    Task<InvoiceWhatsAppLinkOptionsDto?> GetWhatsAppLinkOptionsAsync(Guid id, CancellationToken cancellationToken = default);
}
