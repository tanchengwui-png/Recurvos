using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Features;
using Recurvos.Application.SubscriberAccounts;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class FeatureEntitlementService(
    AppDbContext dbContext,
    ISubscriberAccountBillingReadService subscriberAccountBillingReadService) : IFeatureEntitlementService
{
    private static readonly string[] AllFeatureKeys =
    [
        PlatformFeatureKeys.CustomerManagement,
        PlatformFeatureKeys.ManualInvoices,
        PlatformFeatureKeys.RecurringInvoices,
        PlatformFeatureKeys.AutoInvoiceGeneration,
        PlatformFeatureKeys.EmailReminders,
        PlatformFeatureKeys.BasicReports,
        PlatformFeatureKeys.GrowthReports,
        PlatformFeatureKeys.PremiumReports,
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
        PlatformFeatureKeys.AutoReceiptEmails,
    ];

    private static readonly IReadOnlyDictionary<string, string> FeatureTextMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["Customer management"] = PlatformFeatureKeys.CustomerManagement,
        ["Manual invoices"] = PlatformFeatureKeys.ManualInvoices,
        ["Recurring invoices"] = PlatformFeatureKeys.RecurringInvoices,
        ["Subscriptions and plan management"] = PlatformFeatureKeys.RecurringInvoices,
        ["Email reminders"] = PlatformFeatureKeys.EmailReminders,
        ["Basic reports"] = PlatformFeatureKeys.BasicReports,
        ["Growth reports"] = PlatformFeatureKeys.GrowthReports,
        ["Premium reports"] = PlatformFeatureKeys.PremiumReports,
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
        ["Auto receipt emails"] = PlatformFeatureKeys.AutoReceiptEmails,
    };

    private static readonly IReadOnlyDictionary<string, string> FeatureLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [PlatformFeatureKeys.CustomerManagement] = "Customer management",
        [PlatformFeatureKeys.ManualInvoices] = "Manual invoices",
        [PlatformFeatureKeys.RecurringInvoices] = "Recurring invoices",
        [PlatformFeatureKeys.AutoInvoiceGeneration] = "automatic invoice generation",
        [PlatformFeatureKeys.EmailReminders] = "Email reminders",
        [PlatformFeatureKeys.BasicReports] = "Basic reports",
        [PlatformFeatureKeys.GrowthReports] = "Growth reports",
        [PlatformFeatureKeys.PremiumReports] = "Premium reports",
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
        [PlatformFeatureKeys.AutoReceiptEmails] = "automatic receipt emails",
    };

    public async Task<FeatureAccessDto> GetCurrentAccessAsync(CancellationToken cancellationToken = default)
    {
        return await GetCurrentUserAccessAsync(cancellationToken);
    }

    public async Task EnsureCurrentUserHasFeatureAsync(string featureKey, CancellationToken cancellationToken = default)
    {
        if (!await CurrentUserHasFeatureAsync(featureKey, cancellationToken))
        {
            var featureLabel = FeatureLabels.TryGetValue(featureKey, out var label) ? label : "this feature";
            throw new InvalidOperationException($"Your current package does not include {featureLabel}.");
        }
    }

    public async Task<bool> CurrentUserHasFeatureAsync(string featureKey, CancellationToken cancellationToken = default)
    {
        var access = await GetCurrentUserAccessAsync(cancellationToken);
        return access.FeatureKeys.Contains(featureKey, StringComparer.OrdinalIgnoreCase);
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
        var billing = await subscriberAccountBillingReadService.GetEffectiveStateAsync(companyId, cancellationToken);
        return await BuildAccessAsync(billing, cancellationToken);
    }

    private async Task<FeatureAccessDto> GetCurrentUserAccessAsync(CancellationToken cancellationToken)
    {
        var billing = await subscriberAccountBillingReadService.GetCurrentUserStateAsync(cancellationToken);
        return await BuildAccessAsync(billing, cancellationToken);
    }

    private async Task<FeatureAccessDto> BuildAccessAsync(EffectiveBillingState billing, CancellationToken cancellationToken)
    {
        var packageCode = billing.PackageCode?.Trim().ToLowerInvariant() ?? string.Empty;
        var packageStatus = ResolvePackageStatus(billing.Status, billing.GracePeriodEndsAtUtc);
        var allowBillingFeatures = packageStatus is "active" or "pending_payment" or "grace_period" or "upgrade_pending_payment";
        var featureKeys = allowBillingFeatures
            ? await ResolvePackageFeatureKeysAsync(packageCode, cancellationToken)
            : Array.Empty<string>();
        // Contacts are foundational account data and must remain available even when
        // the subscriber has no active package (for example, while payment is due).
        featureKeys = featureKeys
            .Append(PlatformFeatureKeys.CustomerManagement)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
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

    internal static IReadOnlyCollection<string> ResolvePackageFeatureKeysForConfiguration(string packageCode, IReadOnlyCollection<string>? featureTexts = null)
    {
        var normalizedPackageCode = NormalizePackageCode(packageCode);
        if (string.IsNullOrWhiteSpace(normalizedPackageCode))
        {
            return Array.Empty<string>();
        }

        var resolvedFeatureTexts = featureTexts is { Count: > 0 }
            ? featureTexts
            : GetDefaultFeatureTexts(normalizedPackageCode);

        var inheritedFeatureTexts = GetPackageHierarchy(normalizedPackageCode)
            .Where(code => !string.Equals(code, normalizedPackageCode, StringComparison.OrdinalIgnoreCase))
            .SelectMany(GetDefaultFeatureTexts);

        return ResolveFeatureKeys(normalizedPackageCode, inheritedFeatureTexts.Concat(resolvedFeatureTexts));
    }

    private async Task<IReadOnlyCollection<string>> ResolvePackageFeatureKeysAsync(string packageCode, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(packageCode))
        {
            return Array.Empty<string>();
        }

        var normalizedPackageCode = NormalizePackageCode(packageCode);
        if (string.IsNullOrWhiteSpace(normalizedPackageCode))
        {
            return Array.Empty<string>();
        }

        var hierarchy = GetPackageHierarchy(normalizedPackageCode);
        var packages = await dbContext.PlatformPackages
            .AsNoTracking()
            .Include(x => x.Features)
            .Where(x => hierarchy.Contains(x.Code))
            .ToListAsync(cancellationToken);

        var featureTexts = hierarchy.SelectMany(code =>
        {
            var package = packages.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase));
            return package?.Features.Count > 0
                ? package.Features.Select(x => x.Text)
                : GetDefaultFeatureTexts(code);
        });

        return ResolveFeatureKeys(normalizedPackageCode, featureTexts);
    }

    private async Task<IReadOnlyCollection<FeatureRequirementDto>> ResolveFeatureRequirementsAsync(CancellationToken cancellationToken)
    {
        var packages = await dbContext.PlatformPackages
            .AsNoTracking()
            .Include(x => x.Features)
            .Where(x => x.IsActive)
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.Amount)
            .ToListAsync(cancellationToken);

        var requirements = new Dictionary<string, FeatureRequirementDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var package in packages)
        {
            var featureKeys = ResolvePackageFeatureKeysForConfiguration(
                package.Code,
                package.Features.Count > 0 ? package.Features.Select(x => x.Text).ToList() : null);

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
        NormalizePackageCode(packageCode) switch
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
                "Auto receipt emails",
                "Finance exports",
                "Growth reports",
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
                "Auto receipt emails",
                "Premium reports",
            ],
            _ => []
        };

    private static IReadOnlyCollection<string> ResolveFeatureKeys(string packageCode, IEnumerable<string> featureTexts)
    {
        var mappedFeatureKeys = featureTexts
            .Select(text => FeatureTextMap.TryGetValue(text.Trim(), out var featureKey) ? featureKey : null)
            .Where(featureKey => !string.IsNullOrWhiteSpace(featureKey))
            .Cast<string>()
            .ToList();

        // Report tiers are package entitlements, not marketing text. This keeps the
        // API and UI correct for existing package records that predate these labels.
        if (GetPackageHierarchy(packageCode).Count > 0)
        {
            mappedFeatureKeys.Add(PlatformFeatureKeys.BasicReports);
        }

        if (GetPackageHierarchy(packageCode).Contains("growth", StringComparer.OrdinalIgnoreCase))
        {
            mappedFeatureKeys.Add(PlatformFeatureKeys.GrowthReports);
        }

        if (GetPackageHierarchy(packageCode).Contains("premium", StringComparer.OrdinalIgnoreCase))
        {
            mappedFeatureKeys.Add(PlatformFeatureKeys.PremiumReports);
        }

        return ExpandDependencies(mappedFeatureKeys).Where(AllFeatureKeys.Contains).ToList();
    }

    private static IReadOnlyList<string> GetPackageHierarchy(string packageCode) => NormalizePackageCode(packageCode) switch
    {
        "starter" => ["starter"],
        "growth" => ["starter", "growth"],
        "premium" => ["starter", "growth", "premium"],
        _ => []
    };

    private static string NormalizePackageCode(string? packageCode) => packageCode?.Trim().ToLowerInvariant() switch
    {
        "basic" => "starter",
        var code => code ?? string.Empty
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
