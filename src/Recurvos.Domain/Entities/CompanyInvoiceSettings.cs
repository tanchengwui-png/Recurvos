namespace Recurvos.Domain.Entities;

public sealed class CompanyInvoiceSettings
{
    public Guid CompanyId { get; set; }
    public string Prefix { get; set; } = "INV";
    public int NextNumber { get; set; } = 1;
    public int Padding { get; set; } = 6;
    public bool ResetYearly { get; set; }
    public int? LastResetYear { get; set; }
    public string ReceiptPrefix { get; set; } = "RCT";
    public int ReceiptNextNumber { get; set; } = 1;
    public int ReceiptPadding { get; set; } = 6;
    public bool ReceiptResetYearly { get; set; }
    public int? ReceiptLastResetYear { get; set; }
    public string CreditNotePrefix { get; set; } = "CN";
    public int CreditNoteNextNumber { get; set; } = 1;
    public int CreditNotePadding { get; set; } = 6;
    public bool CreditNoteResetYearly { get; set; }
    public int? CreditNoteLastResetYear { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountName { get; set; }
    public string? BankAccount { get; set; }
    public int PaymentDueDays { get; set; } = 7;
    public string? PaymentLink { get; set; }
    public string PaymentGatewayProvider { get; set; } = "none";
    public bool PaymentGatewayTermsAccepted { get; set; }
    public DateTime? PaymentGatewayTermsAcceptedAtUtc { get; set; }
    public string? SubscriberBillplzApiKey { get; set; }
    public string? SubscriberBillplzCollectionId { get; set; }
    public string? SubscriberBillplzXSignatureKey { get; set; }
    public string? SubscriberBillplzBaseUrl { get; set; }
    public bool? SubscriberBillplzRequireSignatureVerification { get; set; }
    public bool IsTaxEnabled { get; set; }
    public string TaxName { get; set; } = "SST";
    public decimal? TaxRate { get; set; }
    public string? TaxRegistrationNo { get; set; }
    public bool ShowCompanyAddressOnInvoice { get; set; } = true;
    public bool ShowCompanyAddressOnReceipt { get; set; } = true;
    public string? PaymentQrPath { get; set; }
    public DateTime? PaymentQrResponsibilityAcceptedAtUtc { get; set; }
    public string? PaymentQrResponsibilityStatement { get; set; }
    public bool AutoSendInvoices { get; set; } = true;
    public bool CcSubscriberOnCustomerEmails { get; set; } = true;
    public bool WhatsAppEnabled { get; set; }
    public string WhatsAppProvider { get; set; } = "generic_api";
    public string? WhatsAppApiUrl { get; set; }
    public string? WhatsAppAccessToken { get; set; }
    public string? WhatsAppSenderId { get; set; }
    public string? WhatsAppTemplate { get; set; }
    public string? WhatsAppSessionStatus { get; set; }
    public string? WhatsAppSessionPhone { get; set; }
    public DateTime? WhatsAppSessionLastSyncedAtUtc { get; set; }
    public string? FeedbackNotificationEmail { get; set; }
    public string? ProductionIssuerCompanyName { get; set; }
    public string? ProductionIssuerRegistrationNumber { get; set; }
    public string? ProductionIssuerBillingEmail { get; set; }
    public string? ProductionIssuerPhone { get; set; }
    public string? ProductionIssuerAddress { get; set; }
    public string? SmtpHost { get; set; }
    public int? SmtpPort { get; set; }
    public string? SmtpUsername { get; set; }
    public string? SmtpPassword { get; set; }
    public string? SmtpFromEmail { get; set; }
    public string? SmtpFromName { get; set; }
    public bool? SmtpUseSsl { get; set; }
    public bool UseProductionPlatformSettings { get; set; }
    public string? ProductionSmtpHost { get; set; }
    public int? ProductionSmtpPort { get; set; }
    public string? ProductionSmtpUsername { get; set; }
    public string? ProductionSmtpPassword { get; set; }
    public string? ProductionSmtpFromEmail { get; set; }
    public string? ProductionSmtpFromName { get; set; }
    public bool? ProductionSmtpUseSsl { get; set; }
    public bool ProductionLocalEmailCaptureEnabled { get; set; }
    public bool ProductionEmailShieldEnabled { get; set; }
    public string? ProductionEmailShieldAddress { get; set; }
    public string? BillplzApiKey { get; set; }
    public string? BillplzCollectionId { get; set; }
    public string? BillplzXSignatureKey { get; set; }
    public string? BillplzBaseUrl { get; set; }
    public bool? BillplzRequireSignatureVerification { get; set; }
    public string? StripePublishableKey { get; set; }
    public string? StripeSecretKey { get; set; }
    public string? StripeWebhookSecret { get; set; }
    public string? ProductionBillplzApiKey { get; set; }
    public string? ProductionBillplzCollectionId { get; set; }
    public string? ProductionBillplzXSignatureKey { get; set; }
    public string? ProductionBillplzBaseUrl { get; set; }
    public bool? ProductionBillplzRequireSignatureVerification { get; set; }
    public string? ProductionStripePublishableKey { get; set; }
    public string? ProductionStripeSecretKey { get; set; }
    public string? ProductionStripeWebhookSecret { get; set; }
    public string PlatformPaymentGatewayProvider { get; set; } = "billplz";
    public string ProductionPlatformPaymentGatewayProvider { get; set; } = "billplz";
    public bool LocalEmailCaptureEnabled { get; set; }
    public bool EmailShieldEnabled { get; set; }
    public string? EmailShieldAddress { get; set; }
    public bool AutoCompressUploads { get; set; } = true;
    public int UploadMaxBytes { get; set; } = 2 * 1024 * 1024;
    public int UploadImageMaxDimension { get; set; } = 1600;
    public int UploadImageQuality { get; set; } = 80;
    public Company? Company { get; set; }
}
