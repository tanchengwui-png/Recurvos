namespace Recurvos.Application.Features;

public static class PlatformFeatureKeys
{
    public const string CustomerManagement = "customer_management";
    public const string ManualInvoices = "manual_invoices";
    public const string RecurringInvoices = "recurring_invoices";
    public const string AutoInvoiceGeneration = "auto_invoice_generation";
    public const string EmailReminders = "email_reminders";
    public const string BasicReports = "basic_reports";
    public const string PaymentTracking = "payment_tracking";
    public const string FinanceExports = "finance_exports";
    public const string DunningWorkflows = "dunning_workflows";
    public const string WhatsAppNotifications = "whatsapp_notifications";
    public const string WhatsAppCopyMessage = "whatsapp_copy_message";
    public const string WhatsAppBrowserLink = "whatsapp_browser_link";
    public const string ConfigurableWhatsApp = "configurable_whatsapp";
    public const string PaymentLinkGeneration = "payment_link_generation";
    public const string PublicPaymentConfirmation = "public_payment_confirmation";
    public const string PaymentGatewayConfiguration = "payment_gateway_configuration";
}

public sealed record FeatureRequirementDto(string FeatureKey, string PackageCode, string PackageName);
public sealed record FeatureAccessDto(string PackageCode, string PackageStatus, IReadOnlyCollection<string> FeatureKeys, IReadOnlyCollection<FeatureRequirementDto> FeatureRequirements);

public interface IFeatureEntitlementService
{
    Task<FeatureAccessDto> GetCurrentAccessAsync(CancellationToken cancellationToken = default);
    Task<bool> CurrentUserHasFeatureAsync(string featureKey, CancellationToken cancellationToken = default);
    Task<bool> CompanyHasFeatureAsync(Guid companyId, string featureKey, CancellationToken cancellationToken = default);
    Task EnsureCurrentUserHasFeatureAsync(string featureKey, CancellationToken cancellationToken = default);
    Task EnsureCompanyHasFeatureAsync(Guid companyId, string featureKey, CancellationToken cancellationToken = default);
}
