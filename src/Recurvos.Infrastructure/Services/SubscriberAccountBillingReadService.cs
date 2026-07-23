using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.SubscriberAccounts;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

/// <summary>Account-scoped subscription read boundary. Company data is legacy
/// migration data only and must not decide entitlements or limits.</summary>
public sealed class SubscriberAccountBillingReadService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IOptions<SubscriberAccountBillingOptions> subscriberAccountBillingOptions) : ISubscriberAccountBillingReadService
{
    public async Task<EffectiveBillingState> GetCurrentUserStateAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.AsNoTracking()
            .Include(x => x.SubscriberAccount)
            .Where(x => x.SubscriberId == userId && !x.IsPlatformAccount)
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        // A legacy subscriber may not have been backfilled yet. Its Company state
        // remains the source of truth until it is explicitly admitted to the canary.
        return company is null ? Empty() : MapEffective(company);
    }

    public async Task<EffectiveBillingState> GetEffectiveStateAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        var company = await dbContext.Companies
            .AsNoTracking()
            .Include(x => x.SubscriberAccount)
            .FirstOrDefaultAsync(x => x.Id == companyId, cancellationToken)
            ?? throw new UnauthorizedAccessException();

        return MapEffective(company);
    }

    private EffectiveBillingState MapEffective(Company company)
    {
        var account = company.SubscriberAccount;
        return IsAccountCanaryEnabled(account) ? MapAccount(account!) : MapLegacy(company);
    }

    private bool IsAccountCanaryEnabled(SubscriberAccount? account) =>
        subscriberAccountBillingOptions.Value.Enabled && account?.AccountBillingEnabled == true;

    private static EffectiveBillingState MapAccount(SubscriberAccount account) => new(
        account.BillingPackageCode, account.BillingPendingPackageCode, account.BillingStatus,
        account.BillingGracePeriodEndsAtUtc, account.BillingCycleStartUtc, account.BillingTrialEndsAtUtc, true);

    private static EffectiveBillingState MapLegacy(Company company) => new(
        company.SelectedPackage, company.PendingPackageCode, company.PackageStatus,
        company.PackageGracePeriodEndsAtUtc, company.PackageBillingCycleStartUtc, company.TrialEndsAtUtc, false);

    private static EffectiveBillingState Empty() => new(null, null, null, null, null, null, false);
}
