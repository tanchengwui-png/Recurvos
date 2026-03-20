namespace Recurvos.Infrastructure.Configuration;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";
    public string InvoiceDirectory { get; set; } = "storage/invoices";
    public string CompanyLogoDirectory { get; set; } = "storage/company-logos";
    public string PaymentQrDirectory { get; set; } = "storage/payment-qrs";
    public string PaymentProofDirectory { get; set; } = "storage/payment-proofs";
    public string FeedbackAttachmentDirectory { get; set; } = "storage/feedback";
}
