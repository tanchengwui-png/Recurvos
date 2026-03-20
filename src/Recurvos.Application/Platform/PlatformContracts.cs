namespace Recurvos.Application.Platform;

public sealed record SubscriberCompanyDto(
    Guid CompanyId,
    string CompanyName,
    string RegistrationNumber,
    string Email,
    int CustomerCount,
    int SubscriptionCount,
    int OpenInvoiceCount,
    string? PackageCode,
    string? PackageName,
    string? PackageStatus,
    DateTime? PackageGracePeriodEndsAtUtc,
    DateTime? TrialEndsAtUtc);
public sealed record PlatformDashboardSummaryDto(
    int TotalSubscribers,
    int SubscribersPaid,
    int SubscribersPendingPayment,
    int SubscribersInGracePeriod,
    int SubscribersOnTrial,
    int BillingProfiles,
    int Products,
    int Customers,
    int Subscriptions,
    int OpenInvoices,
    decimal OutstandingAmount,
    int WhatsAppSentThisMonth,
    int CompaniesUsingWhatsAppThisMonth);
public sealed record EmailDispatchLogDto(
    Guid Id,
    string OriginalRecipient,
    string EffectiveRecipient,
    string Subject,
    string DeliveryMode,
    bool WasRedirected,
    string? RedirectReason,
    bool Succeeded,
    string? ErrorMessage,
    DateTime CreatedAtUtc);
public sealed record FailedWhatsAppNotificationDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    Guid InvoiceId,
    string InvoiceNumber,
    string CustomerName,
    string RecipientPhoneNumber,
    bool IsReminder,
    string? ErrorMessage,
    DateTime CreatedAtUtc);
public sealed record AuditLogEntryDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    Guid? UserId,
    string? UserEmail,
    string Action,
    string EntityName,
    string EntityId,
    string? Metadata,
    DateTime CreatedAtUtc);
public sealed record PlatformUserDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    string FullName,
    string Email,
    string Role,
    bool IsPlatformAccess,
    bool IsActive,
    bool IsEmailVerified,
    DateTime CreatedAtUtc);
public sealed record PlatformPackageItemDto(Guid Id, string Text, int SortOrder);
public sealed record PlatformPackageDto(
    Guid Id,
    string Code,
    string Name,
    string PriceLabel,
    string Description,
    decimal Amount,
    string Currency,
    string IntervalUnit,
    int IntervalCount,
    int GracePeriodDays,
    int MaxCompanies,
    int MaxProducts,
    int MaxPlans,
    int MaxCustomers,
    int MaxWhatsAppRemindersPerMonth,
    bool IsActive,
    int DisplayOrder,
    IReadOnlyCollection<PlatformPackageItemDto> Features,
    IReadOnlyCollection<PlatformPackageItemDto> TrustPoints);
public sealed record UpdatePlatformPackageRequest(
    string Name,
    string PriceLabel,
    string Description,
    decimal Amount,
    string Currency,
    string IntervalUnit,
    int IntervalCount,
    int GracePeriodDays,
    int MaxCompanies,
    int MaxProducts,
    int MaxPlans,
    int MaxCustomers,
    int MaxWhatsAppRemindersPerMonth,
    bool IsActive,
    int DisplayOrder,
    IReadOnlyCollection<string> Features,
    IReadOnlyCollection<string> TrustPoints);
public sealed record AssignSubscriberPackageRequest(string PackageCode);
public sealed record CreatePlatformAdminRequest(string FullName, string Email, string Password);
public sealed record UpdatePlatformUserRequest(string Role, bool IsActive);

public sealed record SubscriberPackageBillingInvoiceDto(
    Guid Id,
    string InvoiceNumber,
    string PackageName,
    string Status,
    DateTime IssueDateUtc,
    DateTime DueDateUtc,
    decimal Total,
    decimal AmountDue,
    string Currency,
    bool HasReceipt,
    string? PaymentLinkUrl,
    bool HasPendingPaymentConfirmation);

public sealed record SubscriberPackageUpgradeOptionDto(
    string Code,
    string Name,
    string Description,
    string PriceLabel,
    decimal Amount,
    string Currency,
    string BillingIntervalLabel);

public sealed record SubscriberPackageUpgradePreviewDto(
    string CurrentPackageCode,
    string CurrentPackageName,
    string TargetPackageCode,
    string TargetPackageName,
    decimal CurrentPackageAmount,
    decimal TargetPackageAmount,
    decimal UpgradeSubtotal,
    decimal TaxAmount,
    decimal TotalAmount,
    string Currency,
    int RemainingDays,
    int TotalDays,
    DateTime CurrentCycleEndUtc);

public sealed record SubscriberPackageUpgradeRequest(string PackageCode);

public sealed record SubscriberPackageReactivationPreviewDto(
    string PackageCode,
    string PackageName,
    decimal PackageAmount,
    decimal TaxAmount,
    decimal TotalAmount,
    string Currency,
    string BillingIntervalLabel);

public sealed record SubscriberPackageBillingSummaryDto(
    string? PackageCode,
    string? PackageName,
    string? PackageStatus,
    DateTime? GracePeriodEndsAtUtc,
    decimal? PackageAmount,
    string? Currency,
    string? BillingIntervalLabel,
    string? PendingUpgradePackageCode,
    string? PendingUpgradePackageName,
    DateTime? CurrentCycleEndUtc,
    IReadOnlyCollection<SubscriberPackageUpgradeOptionDto> AvailableUpgrades,
    IReadOnlyCollection<SubscriberPackageBillingInvoiceDto> Invoices);

public interface IPlatformService
{
    Task<PlatformDashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SubscriberCompanyDto>> GetSubscribersAsync(CancellationToken cancellationToken = default);
    Task<SubscriberCompanyDto> AssignSubscriberPackageAsync(Guid companyId, AssignSubscriberPackageRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PlatformUserDto>> GetUsersAsync(CancellationToken cancellationToken = default);
    Task<PlatformUserDto> CreatePlatformAdminAsync(CreatePlatformAdminRequest request, CancellationToken cancellationToken = default);
    Task<PlatformUserDto> UpdateUserAsync(Guid userId, UpdatePlatformUserRequest request, CancellationToken cancellationToken = default);
    Task SendPasswordResetAsync(Guid userId, CancellationToken cancellationToken = default);
    Task ResendVerificationAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PlatformPackageDto>> GetPackagesAsync(bool includeInactive = false, CancellationToken cancellationToken = default);
    Task<PlatformPackageDto> UpdatePackageAsync(Guid id, UpdatePlatformPackageRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<EmailDispatchLogDto>> GetEmailLogsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<FailedWhatsAppNotificationDto>> GetFailedWhatsAppNotificationsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AuditLogEntryDto>> GetAuditLogsAsync(int take = 100, CancellationToken cancellationToken = default);
}

public interface ISubscriberPackageBillingService
{
    Task ProvisionForSubscriberCompanyAsync(Guid subscriberCompanyId, CancellationToken cancellationToken = default);
    Task<SubscriberPackageBillingSummaryDto> GetCurrentAsync(CancellationToken cancellationToken = default);
    Task<SubscriberPackageUpgradePreviewDto> PreviewUpgradeAsync(string packageCode, CancellationToken cancellationToken = default);
    Task<SubscriberPackageBillingInvoiceDto> CreateUpgradeInvoiceAsync(string packageCode, CancellationToken cancellationToken = default);
    Task<SubscriberPackageReactivationPreviewDto> PreviewReactivationAsync(string packageCode, CancellationToken cancellationToken = default);
    Task<SubscriberPackageBillingInvoiceDto> CreateReactivationInvoiceAsync(string packageCode, CancellationToken cancellationToken = default);
    Task<SubscriberPackageBillingInvoiceDto?> CreatePaymentLinkAsync(Guid invoiceId, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default);
    Task<(byte[] Content, string FileName, string ContentType)?> DownloadReceiptAsync(Guid invoiceId, CancellationToken cancellationToken = default);
}
