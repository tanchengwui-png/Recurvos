namespace Recurvos.Application.SubscriberAccounts;

/// <summary>
/// Effective billing state for a company. The account source is permitted only
/// for an explicitly enabled, healthy Release 3 canary account.
/// </summary>
public sealed record EffectiveBillingState(
    string? PackageCode,
    string? PendingPackageCode,
    string? Status,
    DateTime? GracePeriodEndsAtUtc,
    DateTime? CycleStartUtc,
    DateTime? TrialEndsAtUtc,
    bool UsesAccountBilling);

public interface ISubscriberAccountBillingReadService
{
    Task<EffectiveBillingState> GetCurrentUserStateAsync(CancellationToken cancellationToken = default);
    Task<EffectiveBillingState> GetEffectiveStateAsync(Guid companyId, CancellationToken cancellationToken = default);
}
