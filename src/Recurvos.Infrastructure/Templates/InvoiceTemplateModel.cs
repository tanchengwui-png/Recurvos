namespace Recurvos.Infrastructure.Templates;

public sealed class InvoiceTemplateModel
{
    public string InvoiceTypeLabel { get; init; } = "Invoice";
    public string InvoiceNumber { get; init; } = string.Empty;
    public DateTime InvoiceDateUtc { get; init; }
    public DateTime DueDateUtc { get; init; }
    public DateTime? PeriodStartUtc { get; init; }
    public DateTime? PeriodEndUtc { get; init; }
    public string Currency { get; init; } = "MYR";
    public string? LogoDataUrl { get; init; }
    public byte[]? LogoBytes { get; init; }
    public string IssuerName { get; init; } = string.Empty;
    public string? IssuerRegistrationNumber { get; init; }
    public string? IssuerSstNumber { get; init; }
    public string? IssuerEmail { get; init; }
    public string? IssuerPhone { get; init; }
    public string? IssuerAddress { get; init; }
    public string CustomerName { get; init; } = string.Empty;
    public string? CustomerCompany { get; init; }
    public string? CustomerEmail { get; init; }
    public string? CustomerAddress { get; init; }
    public decimal Subtotal { get; init; }
    public bool ShowTaxSection { get; init; }
    public string? TaxLabel { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal DiscountTotal { get; init; }
    public decimal AmountDue { get; init; }
    public decimal PaidAmount { get; init; }
    public DateTime? PaymentDateUtc { get; init; }
    public string? BankName { get; init; }
    public string? BankAccountName { get; init; }
    public string? BankAccount { get; init; }
    public string? PaymentGatewayLink { get; init; }
    public string? PaymentConfirmationLink { get; init; }
    public string? PaymentLink { get; init; }
    public string? PaymentQrDataUrl { get; init; }
    public string? ReferenceNumber { get; init; }
    public string? Notes { get; init; }
    public bool SystemGeneratedFlag { get; init; }
    public string? CustomInvoiceFormat { get; init; }
    public IReadOnlyCollection<InvoiceTemplateLineItem> Items { get; init; } = Array.Empty<InvoiceTemplateLineItem>();
}

public sealed class InvoiceTemplateLineItem
{
    public string Description { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal TaxAmount { get; init; }
    public decimal LineTotal { get; init; }
}
