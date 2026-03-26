using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Settings;

public sealed class DunningRuleRequest
{
    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 60)]
    public int OffsetDays { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed class UpdateDunningRulesRequest
{
    [MinLength(1)]
    public List<DunningRuleRequest> Rules { get; set; } = new();
}

public sealed record DunningRuleDto(Guid Id, string Name, int OffsetDays, bool IsActive);

public sealed record ReminderHistoryItemDto(
    Guid Id,
    string ReminderName,
    Guid InvoiceId,
    string InvoiceNumber,
    string CustomerName,
    DateTime ScheduledAtUtc,
    DateTime? SentAtUtc,
    bool Cancelled,
    string Status);

public sealed record ReminderHistoryPageDto(
    IReadOnlyCollection<ReminderHistoryItemDto> Items,
    int Page,
    int PageSize,
    int TotalCount);

public sealed class UpdateCompanyInvoiceSettingsRequest
{
    [Required, MaxLength(20)]
    public string Prefix { get; set; } = "INV";

    [Range(1, int.MaxValue)]
    public int NextNumber { get; set; } = 1;

    [Range(1, 12)]
    public int Padding { get; set; } = 6;

    public bool ResetYearly { get; set; }

    [Required, MaxLength(20)]
    public string ReceiptPrefix { get; set; } = "RCT";

    [Range(1, int.MaxValue)]
    public int ReceiptNextNumber { get; set; } = 1;

    [Range(1, 12)]
    public int ReceiptPadding { get; set; } = 6;

    public bool ReceiptResetYearly { get; set; }

    [Required, MaxLength(20)]
    public string CreditNotePrefix { get; set; } = "CN";

    [Range(1, int.MaxValue)]
    public int CreditNoteNextNumber { get; set; } = 1;

    [Range(1, 12)]
    public int CreditNotePadding { get; set; } = 6;

    public bool CreditNoteResetYearly { get; set; }

    [MaxLength(100)]
    public string? BankName { get; set; }

    [MaxLength(100)]
    public string? BankAccountName { get; set; }

    [MaxLength(100)]
    public string? BankAccount { get; set; }

    [Range(0, 90)]
    public int PaymentDueDays { get; set; } = 7;

    [MaxLength(500)]
    public string? PaymentLink { get; set; }

    [Required, RegularExpression("none|billplz")]
    public string PaymentGatewayProvider { get; set; } = "none";

    public bool PaymentGatewayTermsAccepted { get; set; }

    [MaxLength(200)]
    public string? SubscriberBillplzApiKey { get; set; }

    [MaxLength(100)]
    public string? SubscriberBillplzCollectionId { get; set; }

    [MaxLength(200)]
    public string? SubscriberBillplzXSignatureKey { get; set; }

    [MaxLength(200)]
    public string? SubscriberBillplzBaseUrl { get; set; }

    public bool SubscriberBillplzRequireSignatureVerification { get; set; } = true;

    public bool IsTaxEnabled { get; set; }

    [MaxLength(50)]
    public string TaxName { get; set; } = "SST";

    [Range(typeof(decimal), "0.01", "100.00")]
    public decimal? TaxRate { get; set; }

    [MaxLength(100)]
    public string? TaxRegistrationNo { get; set; }

    public bool ShowCompanyAddressOnInvoice { get; set; } = true;
    public bool ShowCompanyAddressOnReceipt { get; set; } = true;

    public bool AutoSendInvoices { get; set; }
    public bool CcSubscriberOnCustomerEmails { get; set; } = true;

    public bool WhatsAppEnabled { get; set; }

    [MaxLength(2000)]
    public string? WhatsAppTemplate { get; set; }
}

public sealed class UpdatePlatformWhatsAppSettingsRequest
{
    public bool IsEnabled { get; set; }

    [Required, MaxLength(50)]
    public string Provider { get; set; } = "generic_api";

    [MaxLength(500)]
    public string? ApiUrl { get; set; }

    [MaxLength(500)]
    public string? AccessToken { get; set; }

    [MaxLength(100)]
    public string? SenderId { get; set; }

    [MaxLength(100)]
    public string? Template { get; set; }
}

public sealed class PlatformWhatsAppTestMessageRequest
{
    [Required, MaxLength(50)]
    public string RecipientPhoneNumber { get; set; } = string.Empty;

    [Required, MaxLength(2000)]
    public string Message { get; set; } = string.Empty;
}

public sealed class UpdatePlatformFeedbackSettingsRequest
{
    [MaxLength(200)]
    public string? OwnerNotificationEmail { get; set; }
}

public sealed class UpdatePlatformIssuerSettingsRequest
{
    [Required, RegularExpression("staging|production")]
    public string Environment { get; set; } = "staging";

    [Required, MaxLength(150)]
    public string CompanyName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string RegistrationNumber { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string BillingEmail { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Phone { get; set; }

    [MaxLength(500)]
    public string? Address { get; set; }
}

public sealed class UpdatePlatformSmtpSettingsRequest
{
    [Required, RegularExpression("staging|production")]
    public string Environment { get; set; } = "staging";

    [MaxLength(200)]
    public string? Host { get; set; }

    [Range(1, 65535)]
    public int Port { get; set; } = 1025;

    [MaxLength(200)]
    public string? Username { get; set; }

    [MaxLength(500)]
    public string? Password { get; set; }

    [MaxLength(200)]
    public string? FromEmail { get; set; }

    [MaxLength(150)]
    public string? FromName { get; set; }

    public bool UseSsl { get; set; }

    public bool LocalEmailCaptureEnabled { get; set; }

    public bool EmailShieldEnabled { get; set; }

    [MaxLength(200)]
    public string? EmailShieldAddress { get; set; }
}

public sealed record PlatformSmtpTestResultDto(
    bool Success,
    string Message);

public sealed class UpdatePlatformBillplzSettingsRequest
{
    [Required, RegularExpression("staging|production")]
    public string Environment { get; set; } = "staging";

    [MaxLength(200)]
    public string? ApiKey { get; set; }

    [MaxLength(100)]
    public string? CollectionId { get; set; }

    [MaxLength(200)]
    public string? XSignatureKey { get; set; }

    [MaxLength(200)]
    public string? BaseUrl { get; set; }

    public bool RequireSignatureVerification { get; set; } = true;
}

public sealed record PlatformWhatsAppSettingsDto(
    bool IsEnabled,
    string Provider,
    string? ApiUrl,
    string? AccessToken,
    string? SenderId,
    string? Template,
    bool IsReady,
    string SessionStatus,
    string? SessionPhone,
    DateTime? SessionLastSyncedAtUtc,
    string? SessionQrCodeDataUrl,
    string? SessionLastError);

public sealed record PlatformWhatsAppTestMessageResultDto(
    bool Success,
    string Message,
    string? ExternalMessageId);

public sealed record PlatformFeedbackSettingsDto(
    string? OwnerNotificationEmail,
    bool IsReady);

public sealed record PlatformIssuerSettingsDto(
    string Environment,
    string CompanyName,
    string RegistrationNumber,
    string BillingEmail,
    string? Phone,
    string? Address,
    bool IsActiveProfile,
    bool IsReady);

public sealed record PlatformDocumentNumberingSettingsDto(
    string InvoicePrefix,
    int InvoiceNextNumber,
    int InvoiceMinimumDigits,
    bool InvoiceResetYearly,
    int? InvoiceLastResetYear,
    string ReceiptPrefix,
    int ReceiptNextNumber,
    int ReceiptMinimumDigits,
    bool ReceiptResetYearly,
    int? ReceiptLastResetYear,
    string CreditNotePrefix,
    int CreditNoteNextNumber,
    int CreditNoteMinimumDigits,
    bool CreditNoteResetYearly,
    int? CreditNoteLastResetYear);

public sealed record PlatformSmtpSettingsDto(
    string Environment,
    string? Host,
    int Port,
    string? Username,
    string? Password,
    string? FromEmail,
    string? FromName,
    bool UseSsl,
    bool LocalEmailCaptureEnabled,
    bool EmailShieldEnabled,
    string? EmailShieldAddress,
    bool IsActiveProfile,
    bool IsReady);

public sealed record PlatformBillplzSettingsDto(
    string Environment,
    string? ApiKey,
    string? CollectionId,
    string? XSignatureKey,
    string? BaseUrl,
    bool RequireSignatureVerification,
    bool IsActiveProfile,
    bool IsReady);

public sealed class UpdatePlatformRuntimeProfileRequest
{
    [Required, RegularExpression("staging|production")]
    public string ActiveEnvironment { get; set; } = "staging";
}

public sealed record PlatformRuntimeProfileDto(
    string ActiveEnvironment);

public sealed record PlatformBillplzTestResultDto(
    bool Success,
    string Message);

public sealed class UpdatePlatformDocumentNumberingSettingsRequest
{
    [Required, MaxLength(20)]
    public string InvoicePrefix { get; set; } = "SUB";

    [Range(1, 999999999)]
    public int InvoiceNextNumber { get; set; } = 1;

    [Range(1, 12)]
    public int InvoiceMinimumDigits { get; set; } = 6;

    public bool InvoiceResetYearly { get; set; }

    [Required, MaxLength(20)]
    public string ReceiptPrefix { get; set; } = "RCT";

    [Range(1, 999999999)]
    public int ReceiptNextNumber { get; set; } = 1;

    [Range(1, 12)]
    public int ReceiptMinimumDigits { get; set; } = 6;

    public bool ReceiptResetYearly { get; set; }
}

public sealed class TestCompanyPaymentGatewayRequest
{
    [Required, RegularExpression("none|billplz")]
    public string PaymentGatewayProvider { get; set; } = "none";

    [MaxLength(200)]
    public string? SubscriberBillplzApiKey { get; set; }

    [MaxLength(100)]
    public string? SubscriberBillplzCollectionId { get; set; }

    [MaxLength(200)]
    public string? SubscriberBillplzXSignatureKey { get; set; }

    [MaxLength(200)]
    public string? SubscriberBillplzBaseUrl { get; set; }

    public bool SubscriberBillplzRequireSignatureVerification { get; set; } = true;
}

public sealed record CompanyPaymentGatewayTestResultDto(
    bool Success,
    string Message);

public sealed class UpdatePlatformUploadPolicyRequest
{
    public bool AutoCompressUploads { get; set; } = true;

    [Range(200_000, 5_000_000)]
    public int UploadMaxBytes { get; set; } = 2_000_000;

    [Range(600, 2400)]
    public int UploadImageMaxDimension { get; set; } = 1600;

    [Range(50, 95)]
    public int UploadImageQuality { get; set; } = 80;
}

public sealed record PlatformUploadPolicyDto(
    bool AutoCompressUploads,
    int UploadMaxBytes,
    int UploadImageMaxDimension,
    int UploadImageQuality);

public sealed record CompanyInvoiceSettingsDto(
    Guid CompanyId,
    string Prefix,
    int NextNumber,
    int Padding,
    bool ResetYearly,
    int? LastResetYear,
    string ReceiptPrefix,
    int ReceiptNextNumber,
    int ReceiptPadding,
    bool ReceiptResetYearly,
    int? ReceiptLastResetYear,
    string CreditNotePrefix,
    int CreditNoteNextNumber,
    int CreditNotePadding,
    bool CreditNoteResetYearly,
    int? CreditNoteLastResetYear,
    string? BankName,
    string? BankAccountName,
    string? BankAccount,
    int PaymentDueDays,
    string? PaymentLink,
    string PaymentGatewayProvider,
    bool PaymentGatewayTermsAccepted,
    DateTime? PaymentGatewayTermsAcceptedAtUtc,
    string? SubscriberBillplzApiKey,
    string? SubscriberBillplzCollectionId,
    string? SubscriberBillplzXSignatureKey,
    string? SubscriberBillplzBaseUrl,
    bool SubscriberBillplzRequireSignatureVerification,
    bool PaymentGatewayReady,
    bool IsTaxEnabled,
    string TaxName,
    decimal? TaxRate,
    string? TaxRegistrationNo,
    bool ShowCompanyAddressOnInvoice,
    bool ShowCompanyAddressOnReceipt,
    bool AutoSendInvoices,
    bool CcSubscriberOnCustomerEmails,
    bool HasPaymentQr,
    bool WhatsAppEnabled,
    string? WhatsAppTemplate,
    bool WhatsAppReady,
    int WhatsAppMonthlyLimit,
    int WhatsAppMonthlySent);

public sealed record CompanyPaymentQrFile(string FileName, byte[] Content, string ContentType);

public interface ISettingsService
{
    Task<IReadOnlyCollection<DunningRuleDto>> GetDunningRulesAsync(Guid? companyId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<DunningRuleDto>> UpdateDunningRulesAsync(Guid? companyId, UpdateDunningRulesRequest request, CancellationToken cancellationToken = default);
    Task<ReminderHistoryPageDto> GetReminderHistoryAsync(Guid? companyId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<CompanyInvoiceSettingsDto> GetCompanyInvoiceSettingsAsync(Guid? companyId, CancellationToken cancellationToken = default);
    Task<CompanyInvoiceSettingsDto> UpdateCompanyInvoiceSettingsAsync(Guid? companyId, UpdateCompanyInvoiceSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSettingsDto> GetPlatformWhatsAppSettingsAsync(CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSettingsDto> UpdatePlatformWhatsAppSettingsAsync(UpdatePlatformWhatsAppSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSettingsDto> ConnectPlatformWhatsAppSessionAsync(CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSettingsDto> DisconnectPlatformWhatsAppSessionAsync(CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppSettingsDto> RefreshPlatformWhatsAppSessionAsync(CancellationToken cancellationToken = default);
    Task<PlatformWhatsAppTestMessageResultDto> SendPlatformWhatsAppTestMessageAsync(PlatformWhatsAppTestMessageRequest request, CancellationToken cancellationToken = default);
    Task<PlatformFeedbackSettingsDto> GetPlatformFeedbackSettingsAsync(CancellationToken cancellationToken = default);
    Task<PlatformFeedbackSettingsDto> UpdatePlatformFeedbackSettingsAsync(UpdatePlatformFeedbackSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformIssuerSettingsDto> GetPlatformIssuerSettingsAsync(string environment, CancellationToken cancellationToken = default);
    Task<PlatformIssuerSettingsDto> UpdatePlatformIssuerSettingsAsync(UpdatePlatformIssuerSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformDocumentNumberingSettingsDto> GetPlatformDocumentNumberingSettingsAsync(CancellationToken cancellationToken = default);
    Task<PlatformDocumentNumberingSettingsDto> UpdatePlatformDocumentNumberingSettingsAsync(UpdatePlatformDocumentNumberingSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformRuntimeProfileDto> GetPlatformRuntimeProfileAsync(CancellationToken cancellationToken = default);
    Task<PlatformRuntimeProfileDto> UpdatePlatformRuntimeProfileAsync(UpdatePlatformRuntimeProfileRequest request, CancellationToken cancellationToken = default);
    Task<PlatformSmtpSettingsDto> GetPlatformSmtpSettingsAsync(string environment, CancellationToken cancellationToken = default);
    Task<PlatformSmtpSettingsDto> UpdatePlatformSmtpSettingsAsync(UpdatePlatformSmtpSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformSmtpTestResultDto> TestPlatformSmtpAsync(UpdatePlatformSmtpSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformBillplzSettingsDto> GetPlatformBillplzSettingsAsync(string environment, CancellationToken cancellationToken = default);
    Task<PlatformBillplzSettingsDto> UpdatePlatformBillplzSettingsAsync(UpdatePlatformBillplzSettingsRequest request, CancellationToken cancellationToken = default);
    Task<PlatformBillplzTestResultDto> TestPlatformBillplzAsync(UpdatePlatformBillplzSettingsRequest request, CancellationToken cancellationToken = default);
    Task<CompanyPaymentGatewayTestResultDto> TestCompanyPaymentGatewayAsync(Guid? companyId, TestCompanyPaymentGatewayRequest request, CancellationToken cancellationToken = default);
    Task<PlatformUploadPolicyDto> GetPlatformUploadPolicyAsync(CancellationToken cancellationToken = default);
    Task<PlatformUploadPolicyDto> UpdatePlatformUploadPolicyAsync(UpdatePlatformUploadPolicyRequest request, CancellationToken cancellationToken = default);
    Task<PlatformUploadPolicyDto> GetCurrentUploadPolicyAsync(CancellationToken cancellationToken = default);
    Task<CompanyInvoiceSettingsDto?> UploadPaymentQrAsync(Guid? companyId, Stream content, string fileName, CancellationToken cancellationToken = default);
    Task<CompanyPaymentQrFile?> GetPaymentQrAsync(Guid? companyId, CancellationToken cancellationToken = default);
}
