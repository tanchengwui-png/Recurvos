using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Features;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class FeatureEntitlementService(AppDbContext dbContext, ICurrentUserService currentUserService) : IFeatureEntitlementService
{
    private static readonly string[] AllFeatureKeys =
    [
        PlatformFeatureKeys.CustomerManagement,
        PlatformFeatureKeys.ManualInvoices,
        PlatformFeatureKeys.RecurringInvoices,
        PlatformFeatureKeys.AutoInvoiceGeneration,
        PlatformFeatureKeys.EmailReminders,
        PlatformFeatureKeys.BasicReports,
        PlatformFeatureKeys.PaymentTracking,
        PlatformFeatureKeys.FinanceExports,
        PlatformFeatureKeys.DunningWorkflows,
        PlatformFeatureKeys.WhatsAppNotifications,
        PlatformFeatureKeys.WhatsAppCopyMessage,
        PlatformFeatureKeys.WhatsAppBrowserLink,
        PlatformFeatureKeys.ConfigurableWhatsApp,
        PlatformFeatureKeys.PaymentLinkGeneration,
        PlatformFeatureKeys.PublicPaymentConfirmation,
        PlatformFeatureKeys.PaymentGatewayConfiguration,
    ];

    private static readonly IReadOnlyDictionary<string, string> FeatureTextMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["Customer management"] = PlatformFeatureKeys.CustomerManagement,
        ["Manual invoices"] = PlatformFeatureKeys.ManualInvoices,
        ["Recurring invoices"] = PlatformFeatureKeys.RecurringInvoices,
        ["Subscriptions and plan management"] = PlatformFeatureKeys.RecurringInvoices,
        ["Email reminders"] = PlatformFeatureKeys.EmailReminders,
        ["Basic reports"] = PlatformFeatureKeys.BasicReports,
        ["Payment tracking"] = PlatformFeatureKeys.PaymentTracking,
        ["Finance exports"] = PlatformFeatureKeys.FinanceExports,
        ["Dunning workflows"] = PlatformFeatureKeys.DunningWorkflows,
        ["Payment reminders"] = PlatformFeatureKeys.DunningWorkflows,
        ["Auto invoice"] = PlatformFeatureKeys.AutoInvoiceGeneration,
        ["Auto invoice notification (email)"] = PlatformFeatureKeys.EmailReminders,
        ["Auto invoice notification (whatsapp)"] = PlatformFeatureKeys.WhatsAppNotifications,
        ["Generate whatsapp friendly reminder (copy and paste)"] = PlatformFeatureKeys.WhatsAppCopyMessage,
        ["Generate whatsapp friendly reminder (browser copy and paste, click send to send)"] = PlatformFeatureKeys.WhatsAppBrowserLink,
        ["Configurable whatsapp"] = PlatformFeatureKeys.ConfigurableWhatsApp,
        ["Generate payment link"] = PlatformFeatureKeys.PaymentLinkGeneration,
        ["Payment record screen for customer to upload their payment"] = PlatformFeatureKeys.PublicPaymentConfirmation,
        ["Payment gateway configuration"] = PlatformFeatureKeys.PaymentGatewayConfiguration,
        ["Payment reminder workflows"] = PlatformFeatureKeys.WhatsAppNotifications,
    };

    private static readonly IReadOnlyDictionary<string, string> FeatureLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [PlatformFeatureKeys.CustomerManagement] = "Customer management",
        [PlatformFeatureKeys.ManualInvoices] = "Manual invoices",
        [PlatformFeatureKeys.RecurringInvoices] = "Recurring invoices",
        [PlatformFeatureKeys.AutoInvoiceGeneration] = "automatic invoice generation",
        [PlatformFeatureKeys.EmailReminders] = "Email reminders",
        [PlatformFeatureKeys.BasicReports] = "Basic reports",
        [PlatformFeatureKeys.PaymentTracking] = "Payment tracking",
        [PlatformFeatureKeys.FinanceExports] = "Finance exports",
        [PlatformFeatureKeys.DunningWorkflows] = "Payment reminders",
        [PlatformFeatureKeys.WhatsAppNotifications] = "WhatsApp notifications",
        [PlatformFeatureKeys.WhatsAppCopyMessage] = "WhatsApp copy message",
        [PlatformFeatureKeys.WhatsAppBrowserLink] = "WhatsApp browser link",
        [PlatformFeatureKeys.ConfigurableWhatsApp] = "configurable WhatsApp",
        [PlatformFeatureKeys.PaymentLinkGeneration] = "payment link generation",
        [PlatformFeatureKeys.PublicPaymentConfirmation] = "public payment confirmation",
        [PlatformFeatureKeys.PaymentGatewayConfiguration] = "payment gateway configuration",
    };

    public async Task<FeatureAccessDto> GetCurrentAccessAsync(CancellationToken cancellationToken = default)
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        return await GetAccessForCompanyAsync(companyId, cancellationToken);
    }

    public async Task EnsureCurrentUserHasFeatureAsync(string featureKey, CancellationToken cancellationToken = default)
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        await EnsureCompanyHasFeatureAsync(companyId, featureKey, cancellationToken);
    }

    public async Task<bool> CurrentUserHasFeatureAsync(string featureKey, CancellationToken cancellationToken = default)
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        return await CompanyHasFeatureAsync(companyId, featureKey, cancellationToken);
    }

    public async Task<bool> CompanyHasFeatureAsync(Guid companyId, string featureKey, CancellationToken cancellationToken = default)
    {
        var access = await GetAccessForCompanyAsync(companyId, cancellationToken);
        return access.FeatureKeys.Contains(featureKey, StringComparer.OrdinalIgnoreCase);
    }

    public async Task EnsureCompanyHasFeatureAsync(Guid companyId, string featureKey, CancellationToken cancellationToken = default)
    {
        if (!await CompanyHasFeatureAsync(companyId, featureKey, cancellationToken))
        {
            var featureLabel = FeatureLabels.TryGetValue(featureKey, out var label) ? label : "this feature";
            throw new InvalidOperationException($"Your current package does not include {featureLabel}.");
        }
    }

    private async Task<FeatureAccessDto> GetAccessForCompanyAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => new { x.SelectedPackage, x.PackageStatus, x.PackageGracePeriodEndsAtUtc, x.TrialEndsAtUtc })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new UnauthorizedAccessException();

        var packageCode = company.SelectedPackage?.Trim().ToLowerInvariant() ?? string.Empty;
        var packageStatus = ResolvePackageStatus(company.PackageStatus, company.PackageGracePeriodEndsAtUtc);
        var allowBillingFeatures = packageStatus is "active" or "pending_payment" or "grace_period" or "upgrade_pending_payment";
        var featureKeys = allowBillingFeatures
            ? await ResolvePackageFeatureKeysAsync(packageCode, cancellationToken)
            : Array.Empty<string>();
        var featureRequirements = await ResolveFeatureRequirementsAsync(cancellationToken);
        return new FeatureAccessDto(packageCode, packageStatus, featureKeys, featureRequirements);
    }

    private static IReadOnlyCollection<string> ExpandDependencies(IEnumerable<string> featureKeys)
    {
        var expanded = new HashSet<string>(featureKeys, StringComparer.OrdinalIgnoreCase);
        if (expanded.Contains(PlatformFeatureKeys.ManualInvoices) || expanded.Contains(PlatformFeatureKeys.RecurringInvoices))
        {
            expanded.Add(PlatformFeatureKeys.CustomerManagement);
        }

        if (expanded.Contains(PlatformFeatureKeys.AutoInvoiceGeneration))
        {
            expanded.Add(PlatformFeatureKeys.RecurringInvoices);
        }

        if (expanded.Contains(PlatformFeatureKeys.DunningWorkflows))
        {
            expanded.Add(PlatformFeatureKeys.EmailReminders);
        }

        if (expanded.Contains(PlatformFeatureKeys.WhatsAppNotifications))
        {
            expanded.Add(PlatformFeatureKeys.EmailReminders);
            expanded.Add(PlatformFeatureKeys.PublicPaymentConfirmation);
        }

        if (expanded.Contains(PlatformFeatureKeys.PaymentLinkGeneration))
        {
            expanded.Add(PlatformFeatureKeys.PaymentTracking);
        }

        return expanded.ToList();
    }

    private async Task<IReadOnlyCollection<string>> ResolvePackageFeatureKeysAsync(string packageCode, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(packageCode))
        {
            return Array.Empty<string>();
        }

        var package = await dbContext.PlatformPackages
            .Include(x => x.Features)
            .FirstOrDefaultAsync(x => x.Code == packageCode, cancellationToken);

        var featureTexts = package?.Features.Select(x => x.Text).ToList();
        if (featureTexts is null || featureTexts.Count == 0)
        {
            featureTexts = GetDefaultFeatureTexts(packageCode).ToList();
        }

        var mappedFeatureKeys = featureTexts
            .Select(text => FeatureTextMap.TryGetValue(text.Trim(), out var featureKey) ? featureKey : null)
            .Where(featureKey => !string.IsNullOrWhiteSpace(featureKey))
            .Cast<string>();

        return ExpandDependencies(mappedFeatureKeys).Where(AllFeatureKeys.Contains).ToList();
    }

    private async Task<IReadOnlyCollection<FeatureRequirementDto>> ResolveFeatureRequirementsAsync(CancellationToken cancellationToken)
    {
        var packages = await dbContext.PlatformPackages
            .Include(x => x.Features)
            .Where(x => x.IsActive)
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.Amount)
            .ToListAsync(cancellationToken);

        var requirements = new Dictionary<string, FeatureRequirementDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var package in packages)
        {
            var featureTexts = package.Features.Count > 0
                ? package.Features.Select(x => x.Text)
                : GetDefaultFeatureTexts(package.Code);
            var featureKeys = ExpandDependencies(
                featureTexts
                    .Select(text => FeatureTextMap.TryGetValue(text.Trim(), out var featureKey) ? featureKey : null)
                    .Where(featureKey => !string.IsNullOrWhiteSpace(featureKey))
                    .Cast<string>());

            foreach (var featureKey in featureKeys)
            {
                if (!requirements.ContainsKey(featureKey))
                {
                    requirements[featureKey] = new FeatureRequirementDto(featureKey, package.Code, package.Name);
                }
            }
        }

        return requirements.Values.ToList();
    }

    private static IReadOnlyCollection<string> GetDefaultFeatureTexts(string packageCode) =>
        packageCode.Trim().ToLowerInvariant() switch
        {
            "starter" =>
            [
                "Customer management",
                "Manual invoices",
                "Auto invoice",
                "Auto invoice notification (email)",
                "Generate WhatsApp friendly reminder (Copy and Paste)",
                "Basic reports",
            ],
            "growth" =>
            [
                "Customer management",
                "Manual invoices",
                "Auto invoice",
                "Auto invoice notification (email)",
                "Auto invoice notification (WhatsApp)",
                "Generate WhatsApp friendly reminder (Copy and Paste)",
                "Generate WhatsApp friendly reminder (Browser copy and paste, click send to send)",
                "Configurable WhatsApp",
                "Payment tracking",
                "Payment record screen for customer to upload their payment",
                "Finance exports",
            ],
            "premium" =>
            [
                "Customer management",
                "Manual invoices",
                "Auto invoice",
                "Auto invoice notification (email)",
                "Auto invoice notification (WhatsApp)",
                "Generate WhatsApp friendly reminder (Copy and Paste)",
                "Generate WhatsApp friendly reminder (Browser copy and paste, click send to send)",
                "Configurable WhatsApp",
                "Payment tracking",
                "Generate payment link",
                "Payment record screen for customer to upload their payment",
                "Finance exports",
                "Payment gateway configuration",
            ],
            _ => []
        };

    private static string ResolvePackageStatus(string? rawStatus, DateTime? gracePeriodEndsAtUtc)
    {
        var normalized = rawStatus?.Trim().ToLowerInvariant() ?? string.Empty;

        if (normalized is "pending_payment" or "grace_period")
        {
            if (!gracePeriodEndsAtUtc.HasValue)
            {
                return normalized == "grace_period" ? "past_due" : "pending_payment";
            }

            return gracePeriodEndsAtUtc.Value >= DateTime.UtcNow
                ? "grace_period"
                : "past_due";
        }

        if (normalized == "upgrade_pending_payment")
        {
            return "upgrade_pending_payment";
        }

        if (normalized == "reactivation_pending_payment")
        {
            if (!gracePeriodEndsAtUtc.HasValue)
            {
                return "past_due";
            }

            return gracePeriodEndsAtUtc.Value >= DateTime.UtcNow
                ? "reactivation_pending_payment"
                : "past_due";
        }

        return normalized;
    }
}
