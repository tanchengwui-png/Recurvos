using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

/// <summary>Idempotent Release 1 reconciliation. It observes legacy state only.</summary>
public sealed class SubscriberAccountBillingMigrationService(
    AppDbContext dbContext,
    IOptions<SubscriberAccountBillingOptions> options)
{
    public async Task<int> ReconcileAsync(CancellationToken cancellationToken = default)
    {
        var accounts = await dbContext.SubscriberAccounts.Include(x => x.Companies).ToListAsync(cancellationToken);
        var changed = 0;
        foreach (var account in accounts)
        {
            var result = ReconcileAccount(account, options.Value);
            if (!result.Changed)
            {
                continue;
            }

            if (result.EmitEvent)
            {
                dbContext.SubscriberAccountBillingEvents.Add(new Domain.Entities.SubscriberAccountBillingEvent
                {
                    SubscriberAccountId = account.Id,
                    EventType = result.EventType,
                    Severity = result.Warning is null ? "Information" : "Warning",
                    Details = result.Warning ?? "Legacy billing state and the account shadow projection are consistent."
                });
            }
            changed++;
        }

        if (changed > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        return changed;
    }

    /// <summary>Compares only; callers must continue to use Company for all billing reads.</summary>
    public AccountBillingHealth GetHealth(SubscriberAccount account) => Evaluate(account);

    private static ReconciliationResult ReconcileAccount(SubscriberAccount account, SubscriberAccountBillingOptions options)
    {
        var before = (account.ReconciliationWarning, account.BillingHealthStatus, account.BillingHealthWarning,
            account.BillingPackageCode, account.BillingPendingPackageCode, account.BillingStatus,
            account.BillingGracePeriodEndsAtUtc, account.BillingCycleStartUtc, account.BillingTrialEndsAtUtc);
        var health = Evaluate(account);
        var nowUtc = DateTime.UtcNow;

        if (options.DualWriteEnabled && health.LegacyState is not null)
        {
            ApplyProjection(account, health.LegacyState, nowUtc);
            health = Evaluate(account);
        }

        var warning = health.Warning;
        account.ReconciliationWarning = warning;
        account.ReconciledAtUtc = nowUtc;
        account.BillingValidatedAtUtc = options.DualReadValidationEnabled ? nowUtc : account.BillingValidatedAtUtc;
        account.BillingHealthStatus = options.DualReadValidationEnabled ? health.Status : "NotValidated";
        account.BillingHealthWarning = options.DualReadValidationEnabled ? warning : null;
        account.UpdatedAtUtc = nowUtc;

        var after = (account.ReconciliationWarning, account.BillingHealthStatus, account.BillingHealthWarning,
            account.BillingPackageCode, account.BillingPendingPackageCode, account.BillingStatus,
            account.BillingGracePeriodEndsAtUtc, account.BillingCycleStartUtc, account.BillingTrialEndsAtUtc);
        var emitEvent = !before.Equals(after);
        return new ReconciliationResult(true, emitEvent, warning is null ? "billing.health.healthy" : "billing.health.warning", warning);
    }

    private static AccountBillingHealth Evaluate(SubscriberAccount account)
    {
        var states = account.Companies.Where(x => !x.IsPlatformAccount)
            .Select(CompanyBillingState.FromCompany).Distinct().ToList();
        if (states.Count == 0)
            return new AccountBillingHealth("Warning", "No legacy company billing state is available for this subscriber account.", null);
        if (states.Count != 1)
            return new AccountBillingHealth("Warning", "Legacy companies have conflicting billing states. Manual resolution is required before account-billing opt-in.", null);

        var legacy = states[0];
        var projection = CompanyBillingState.FromAccount(account);
        if (!legacy.Equals(projection))
            return new AccountBillingHealth("Warning", "The account shadow projection does not match the authoritative legacy Company billing state.", legacy);

        return new AccountBillingHealth("Healthy", null, legacy);
    }

    private static void ApplyProjection(SubscriberAccount account, CompanyBillingState state, DateTime nowUtc)
    {
        account.BillingPackageCode = state.PackageCode;
        account.BillingPendingPackageCode = state.PendingPackageCode;
        account.BillingStatus = state.Status;
        account.BillingGracePeriodEndsAtUtc = state.GracePeriodEndsAtUtc;
        account.BillingCycleStartUtc = state.CycleStartUtc;
        account.BillingTrialEndsAtUtc = state.TrialEndsAtUtc;
        account.BillingProjectionUpdatedAtUtc = nowUtc;
    }

    public sealed record AccountBillingHealth(string Status, string? Warning, CompanyBillingState? LegacyState);
    public sealed record CompanyBillingState(string? PackageCode, string? PendingPackageCode, string? Status, DateTime? GracePeriodEndsAtUtc, DateTime? CycleStartUtc, DateTime? TrialEndsAtUtc)
    {
        public static CompanyBillingState FromCompany(Company company) => new(Normalize(company.SelectedPackage), Normalize(company.PendingPackageCode), Normalize(company.PackageStatus), company.PackageGracePeriodEndsAtUtc, company.PackageBillingCycleStartUtc, company.TrialEndsAtUtc);
        public static CompanyBillingState FromAccount(SubscriberAccount account) => new(Normalize(account.BillingPackageCode), Normalize(account.BillingPendingPackageCode), Normalize(account.BillingStatus), account.BillingGracePeriodEndsAtUtc, account.BillingCycleStartUtc, account.BillingTrialEndsAtUtc);
        private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
    }

    private sealed record ReconciliationResult(bool Changed, bool EmitEvent, string EventType, string? Warning);
}
