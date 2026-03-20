using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class Invoice : CompanyOwnedEntity
{
    public Guid CustomerId { get; set; }
    public Guid? SubscriberCompanyId { get; set; }
    public Guid? SubscriptionId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Draft;
    public DateTime IssueDateUtc { get; set; }
    public DateTime DueDateUtc { get; set; }
    public DateTime? PeriodStartUtc { get; set; }
    public DateTime? PeriodEndUtc { get; set; }
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public bool IsTaxEnabled { get; set; }
    public string? TaxName { get; set; }
    public decimal? TaxRate { get; set; }
    public string? TaxRegistrationNo { get; set; }
    public decimal Total { get; set; }
    public decimal AmountDue { get; set; }
    public decimal AmountPaid { get; set; }
    public string Currency { get; set; } = "MYR";
    public InvoiceSourceType SourceType { get; set; } = InvoiceSourceType.Manual;
    public string? PdfPath { get; set; }
    public string? PaymentConfirmationTokenHash { get; set; }
    public DateTime? PaymentConfirmationTokenIssuedAtUtc { get; set; }
    public DateTime? AccountingExportedAtUtc { get; set; }
    public Customer? Customer { get; set; }
    public Subscription? Subscription { get; set; }
    public ICollection<InvoiceLineItem> LineItems { get; set; } = new List<InvoiceLineItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<PaymentConfirmationSubmission> PaymentConfirmations { get; set; } = new List<PaymentConfirmationSubmission>();
    public ICollection<Refund> Refunds { get; set; } = new List<Refund>();
    public ICollection<CreditNote> CreditNotes { get; set; } = new List<CreditNote>();
    public ICollection<CustomerBalanceTransaction> BalanceTransactions { get; set; } = new List<CustomerBalanceTransaction>();
}
