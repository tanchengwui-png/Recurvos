using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Platform;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PackageLimitService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService) : IPackageLimitService
{
    public Task EnsureCanCreateCompanyAsync(CancellationToken cancellationToken = default) =>
        EnsureWithinLimitAsync(
            package => package.MaxCompanies,
            "billing profiles",
            subscriberId => dbContext.Companies.CountAsync(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount, cancellationToken),
            cancellationToken);

    public Task EnsureCanCreateProductAsync(CancellationToken cancellationToken = default) =>
        EnsureWithinLimitAsync(
            package => package.MaxProducts,
            "products",
            subscriberId => dbContext.Products.CountAsync(x => dbContext.Companies.Any(c => c.Id == x.CompanyId && c.SubscriberId == subscriberId), cancellationToken),
            cancellationToken);

    public Task EnsureCanCreatePlanAsync(CancellationToken cancellationToken = default) =>
        EnsureWithinLimitAsync(
            package => package.MaxPlans,
            "plans",
            subscriberId => dbContext.ProductPlans.CountAsync(x => dbContext.Companies.Any(c => c.Id == x.CompanyId && c.SubscriberId == subscriberId), cancellationToken),
            cancellationToken);

    public Task EnsureCanCreateCustomerAsync(CancellationToken cancellationToken = default) =>
        EnsureWithinLimitAsync(
            package => package.MaxCustomers,
            "customers",
            subscriberId => dbContext.Customers.CountAsync(x => x.SubscriberId == subscriberId, cancellationToken),
            cancellationToken);

    public async Task<int> GetWhatsAppReminderMonthlyLimitAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        var packageCode = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => x.SelectedPackage)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(packageCode))
        {
            return 0;
        }

        var package = await dbContext.PlatformPackages
            .Include(x => x.Features)
            .FirstOrDefaultAsync(x => x.Code == packageCode.Trim().ToLowerInvariant(), cancellationToken);

        return ResolveEffectiveWhatsAppReminderLimit(packageCode, package);
    }

    private static int ResolveEffectiveWhatsAppReminderLimit(string packageCode, Domain.Entities.PlatformPackage? package)
    {
        if (package is null)
        {
            return 0;
        }

        if (package.MaxWhatsAppRemindersPerMonth > 0)
        {
            return package.MaxWhatsAppRemindersPerMonth;
        }

        var hasAutoWhatsAppNotifications = package.Features.Any(feature =>
            string.Equals(feature.Text?.Trim(), "Auto invoice notification (WhatsApp)", StringComparison.OrdinalIgnoreCase));

        if (!hasAutoWhatsAppNotifications)
        {
            return 0;
        }

        return packageCode.Trim().ToLowerInvariant() switch
        {
            "premium" => 5000,
            _ => 0,
        };
    }

    private async Task EnsureWithinLimitAsync(
        Func<Domain.Entities.PlatformPackage, int> limitSelector,
        string label,
        Func<Guid, Task<int>> countFactory,
        CancellationToken cancellationToken)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var currentCompanyId = currentUserService.CompanyId ?? Guid.Empty;

        var packageCode = await dbContext.Companies
            .Where(x => x.Id == currentCompanyId)
            .Select(x => x.SelectedPackage)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(packageCode))
        {
            return;
        }

        var package = await dbContext.PlatformPackages
            .FirstOrDefaultAsync(x => x.Code == packageCode.Trim().ToLowerInvariant(), cancellationToken);
        if (package is null)
        {
            return;
        }

        var limit = limitSelector(package);
        if (limit <= 0)
        {
            return;
        }

        var currentCount = await countFactory(subscriberId);
        if (currentCount >= limit)
        {
            throw new InvalidOperationException($"Your {package.Name} package allows up to {limit} {label}. Upgrade the package or remove an existing {label[..^1]} first.");
        }
    }
}
