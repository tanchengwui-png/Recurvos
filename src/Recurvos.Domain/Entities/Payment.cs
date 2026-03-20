using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class Payment : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string GatewayName { get; set; } = string.Empty;
    public string? ExternalPaymentId { get; set; }
    public string? GatewayTransactionId { get; set; }
    public string? GatewaySettlementRef { get; set; }
    public string? PaymentLinkUrl { get; set; }
    public string? ProofFilePath { get; set; }
    public string? ProofFileName { get; set; }
    public string? ProofContentType { get; set; }
    public string? ReceiptPdfPath { get; set; }
    public DateTime? PaidAtUtc { get; set; }
    public Invoice? Invoice { get; set; }
    public ICollection<PaymentAttempt> Attempts { get; set; } = new List<PaymentAttempt>();
    public ICollection<Refund> Refunds { get; set; } = new List<Refund>();
    public ICollection<Dispute> Disputes { get; set; } = new List<Dispute>();
    public ICollection<CustomerBalanceTransaction> BalanceTransactions { get; set; } = new List<CustomerBalanceTransaction>();
}
