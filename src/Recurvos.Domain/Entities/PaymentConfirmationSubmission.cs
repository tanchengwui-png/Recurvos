using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PaymentConfirmationSubmission : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public string PayerName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime PaidAtUtc { get; set; }
    public string? TransactionReference { get; set; }
    public string? Notes { get; set; }
    public string? ProofFilePath { get; set; }
    public string? ProofFileName { get; set; }
    public string? ProofContentType { get; set; }
    public PaymentConfirmationStatus Status { get; set; } = PaymentConfirmationStatus.Pending;
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public string? ReviewNote { get; set; }
    public Invoice? Invoice { get; set; }
}
