using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

/// <summary>
/// Release 2 shadow synchronizer. Company remains the authoritative billing
/// record; this service only mirrors and validates account-owned shadow state.
/// </summary>
public sealed class SubscriberAccountBillingMigrationService(
    AppDbContext dbContext,
    IOptions<SubscriberAccountBillingOptions> options,
    ILogger<SubscriberAccountBillingMigrationService> logger)
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
                AddDiagnosticEvent(account.Id, result);
            }
            changed++;
        }

        if (changed > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        return changed;
    }

    /// <summary>
    /// Performs the Release 2 dual-write immediately after a legacy Company
    /// billing mutation. This must be called only after the Company save has
    /// completed, so a failed shadow update can never replace the legacy state.
    /// </summary>
    public async Task<int> ReconcileForCompaniesAsync(IEnumerable<Guid> companyIds, CancellationToken cancellationToken = default)
    {
        var ids = companyIds.Where(x => x != Guid.Empty).Distinct().ToArray();
        if (ids.Length == 0)
        {
            return 0;
        }

        var accounts = await dbContext.SubscriberAccounts
            .Include(x => x.Companies)
            .Where(x => x.Companies.Any(company => ids.Contains(company.Id)))
            .ToListAsync(cancellationToken);
        var changed = 0;
        foreach (var account in accounts)
        {
            var result = ReconcileAccount(account, options.Value);
            if (result.Changed)
            {
                if (result.EmitEvent)
                {
                    AddDiagnosticEvent(account.Id, result);
                }
                changed++;
            }
        }

        if (changed > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return changed;
    }

    private void AddDiagnosticEvent(Guid accountId, ReconciliationResult result)
    {
        var isWarning = result.EventType is "billing.health.warning" or "billing.legacy.repaired-from-account-active";
        dbContext.SubscriberAccountBillingEvents.Add(new Domain.Entities.SubscriberAccountBillingEvent
        {
            SubscriberAccountId = accountId,
            EventType = result.EventType,
            Severity = isWarning ? "Warning" : "Information",
            Details = result.Details
        });

        if (isWarning)
        {
            logger.LogWarning("Subscriber account billing diagnostic {EventType} for account {AccountId}: {Details}", result.EventType, accountId, result.Details);
        }
        else
        {
            logger.LogInformation("Subscriber account billing diagnostic {EventType} for account {AccountId}: {Details}", result.EventType, accountId, result.Details);
        }
    }

    /// <summary>Compares only; callers must continue to use Company for all billing reads.</summary>
    public AccountBillingHealth GetHealth(SubscriberAccount account) => Evaluate(account);

    private static ReconciliationResult ReconcileAccount(SubscriberAccount account, SubscriberAccountBillingOptions options)
    {
        var repairedLegacyState = TryRepairLegacyActiveState(account);
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
        var emitEvent = repairedLegacyState || !before.Equals(after);
        var eventType = repairedLegacyState
            ? "billing.legacy.repaired-from-account-active"
            : warning is null ? "billing.health.healthy" : "billing.health.warning";
        var details = repairedLegacyState
            ? "Legacy Company billing was reconciled from the newer active account billing state."
            : warning ?? "Legacy billing state and the account shadow projection are consistent.";
        return new ReconciliationResult(true, emitEvent, eventType, details);
    }

    /// <summary>
    /// Repairs the specific split-brain state produced when a successful account-level
    /// activation was persisted but its legacy Company projection was not. Legacy reads
    /// remain authoritative during rollout, so leaving this state unresolved incorrectly
    /// removes paid-package entitlements.
    /// </summary>
    private static bool TryRepairLegacyActiveState(SubscriberAccount account)
    {
        var companies = account.Companies.Where(x => !x.IsPlatformAccount).ToList();
        var accountState = CompanyBillingState.FromAccount(account);
        if (companies.Count == 0
            || !string.Equals(accountState.Status, "active", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(accountState.PackageCode)
            || !account.BillingProjectionUpdatedAtUtc.HasValue)
        {
            return false;
        }

        // Only promote an account state that is demonstrably newer and differs solely
        // from legacy past-due status. This avoids reviving legitimately expired plans.
        var isEligible = companies.All(company =>
            string.Equals(company.SelectedPackage?.Trim(), accountState.PackageCode, StringComparison.OrdinalIgnoreCase)
            && string.Equals(company.PackageStatus?.Trim(), "past_due", StringComparison.OrdinalIgnoreCase)
            && account.BillingProjectionUpdatedAtUtc.Value >= company.UpdatedAtUtc);
        if (!isEligible)
        {
            return false;
        }

        foreach (var company in companies)
        {
            company.SelectedPackage = accountState.PackageCode;
            company.PendingPackageCode = accountState.PendingPackageCode;
            company.PackageStatus = "active";
            company.PackageGracePeriodEndsAtUtc = accountState.GracePeriodEndsAtUtc;
            company.PackageBillingCycleStartUtc = accountState.CycleStartUtc;
            company.TrialEndsAtUtc = accountState.TrialEndsAtUtc;
            company.UpdatedAtUtc = DateTime.UtcNow;
        }

        return true;
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

    private sealed record ReconciliationResult(bool Changed, bool EmitEvent, string EventType, string Details);
}
