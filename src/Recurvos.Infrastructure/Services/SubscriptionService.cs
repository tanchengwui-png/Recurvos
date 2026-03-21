using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Common;
using Recurvos.Application.Features;
using Recurvos.Application.Settings;
using Recurvos.Application.Subscriptions;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class SubscriptionService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IBillingReadinessService billingReadinessService,
    IFeatureEntitlementService featureEntitlementService) : ISubscriptionService
{
    public async Task<IReadOnlyCollection<SubscriptionDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        var subscriptions = await Query().OrderByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        return subscriptions.Select(Map).ToList();
    }

    public async Task<SubscriptionDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        var subscription = await Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return subscription is null ? null : Map(subscription);
    }

    public async Task<SubscriptionDto> CreateAsync(SubscriptionRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        ThrowIfInvalid(SubscriptionValidators.ValidateRequest(request));

        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == request.CustomerId, cancellationToken)
            ?? throw new InvalidOperationException("Customer not found.");

        var productPlanIds = request.Items.Select(x => x.ProductPlanId).Distinct().ToList();
        var plans = await dbContext.ProductPlans.Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && productPlanIds.Contains(x.Id)).ToListAsync(cancellationToken);
        if (plans.Count != productPlanIds.Count)
        {
            throw new InvalidOperationException("One or more product plans were not found.");
        }

        var companyIds = plans.Select(x => x.CompanyId).Distinct().ToList();
        if (companyIds.Count != 1)
        {
            throw new InvalidOperationException("All subscription items must belong to the same company.");
        }

        var companyId = companyIds[0];
        await billingReadinessService.EnsureReadyAsync(companyId, "subscription creation", cancellationToken);
        var startUtc = request.StartDateUtc.Kind == DateTimeKind.Utc ? request.StartDateUtc : request.StartDateUtc.ToUniversalTime();

        var items = request.Items.Select(itemRequest =>
        {
            var plan = plans.Single(x => x.Id == itemRequest.ProductPlanId);
            DateTime? trialStartUtc = plan.TrialDays > 0 ? startUtc : null;
            DateTime? trialEndUtc = plan.TrialDays > 0 ? startUtc.AddDays(plan.TrialDays) : null;
            ValidateTrialWindow(trialStartUtc, trialEndUtc);
            var cycle = ComputeBillingCycle(startUtc, trialEndUtc, plan.BillingType, plan.IntervalUnit, plan.IntervalCount);

            return new SubscriptionItem
            {
                CompanyId = companyId,
                ProductPlanId = plan.Id,
                Quantity = itemRequest.Quantity,
                UnitAmount = plan.UnitAmount,
                Currency = plan.Currency.Trim().ToUpperInvariant(),
                BillingType = plan.BillingType,
                IntervalUnit = plan.IntervalUnit,
                IntervalCount = plan.IntervalCount,
                AutoRenew = plan.BillingType == BillingType.Recurring,
                TrialStartUtc = trialStartUtc,
                TrialEndUtc = trialEndUtc,
                CurrentPeriodStartUtc = cycle.CurrentPeriodStartUtc,
                CurrentPeriodEndUtc = cycle.CurrentPeriodEndUtc,
                NextBillingUtc = cycle.NextBillingUtc,
                ProductPlan = plan
            };
        }).ToList();

        var subscription = new Subscription
        {
            CompanyId = companyId,
            CustomerId = customer.Id,
            Status = SubscriptionStatus.Active,
            StartDateUtc = startUtc,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
            Items = items
        };

        SyncAggregateSnapshot(subscription);
        ThrowIfInvalid(SubscriptionValidators.ValidateSnapshot(subscription));

        dbContext.Subscriptions.Add(subscription);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("subscription.created", nameof(Subscription), subscription.Id.ToString(), customer.Name, cancellationToken);

        subscription.Company = await dbContext.Companies.FirstAsync(x => x.Id == companyId, cancellationToken);
        subscription.Customer = customer;
        return Map(subscription);
    }

    public async Task<SubscriptionDto?> UpdateAsync(Guid id, SubscriptionUpdateRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        ThrowIfInvalid(SubscriptionValidators.ValidateUpdate(request));

        var subscription = await Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (subscription is null)
        {
            return null;
        }

        if (request.AutoRenew.HasValue)
        {
            foreach (var item in subscription.Items.Where(x => x.BillingType == BillingType.Recurring && !x.EndedAtUtc.HasValue))
            {
                item.AutoRenew = request.AutoRenew.Value;
                if (!request.AutoRenew.Value)
                {
                    item.NextBillingUtc = null;
                }
                else if (!item.NextBillingUtc.HasValue && item.CurrentPeriodEndUtc.HasValue && item.CurrentPeriodEndUtc.Value >= DateTime.UtcNow)
                {
                    item.NextBillingUtc = BillingCalculator.ComputeNextBillingUtc(item.CurrentPeriodEndUtc.Value);
                }
            }
        }

        if (request.Notes is not null)
        {
            subscription.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        }

        SyncAggregateSnapshot(subscription);
        ThrowIfInvalid(SubscriptionValidators.ValidateSnapshot(subscription));
        subscription.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("subscription.updated", nameof(Subscription), subscription.Id.ToString(), null, cancellationToken);
        return Map(subscription);
    }

    public async Task<SubscriptionDto?> UpdatePricingAsync(Guid id, UpdateSubscriptionPricingRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        ThrowIfInvalid(SubscriptionValidators.ValidatePricingUpdate(request));

        var subscription = await Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (subscription is null)
        {
            return null;
        }

        if (subscription.Items.Count != 1)
        {
            throw new InvalidOperationException("Future billing updates currently support subscriptions with a single item only.");
        }

        var item = subscription.Items.Single();
        item.UnitAmount = request.UnitPrice;
        item.Currency = request.Currency.Trim().ToUpperInvariant();
        item.IntervalUnit = request.IntervalUnit;
        item.IntervalCount = request.IntervalCount;
        item.Quantity = request.Quantity;
        item.AutoRenew = request.IntervalUnit != IntervalUnit.None;

        SyncAggregateSnapshot(subscription);
        ThrowIfInvalid(SubscriptionValidators.ValidateSnapshot(subscription));
        subscription.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync(
            "subscription.pricing-updated",
            nameof(Subscription),
            subscription.Id.ToString(),
            string.IsNullOrWhiteSpace(request.Reason) ? $"unitPrice={item.UnitAmount:0.00}" : request.Reason.Trim(),
            cancellationToken);
        return Map(subscription);
    }

    public Task<SubscriptionDto?> PauseAsync(Guid id, CancellationToken cancellationToken = default) =>
        UpdateStatusAsync(id, subscription =>
        {
            if (subscription.EndedAtUtc.HasValue)
            {
                throw new InvalidOperationException("Ended subscriptions cannot be paused.");
            }

            subscription.Status = SubscriptionStatus.Paused;
            return "subscription.paused";
        }, cancellationToken);

    public Task<SubscriptionDto?> ResumeAsync(Guid id, CancellationToken cancellationToken = default) =>
        UpdateStatusAsync(id, subscription =>
        {
            if (subscription.EndedAtUtc.HasValue)
            {
                throw new InvalidOperationException("Ended subscriptions cannot be resumed.");
            }

            if (subscription.Status != SubscriptionStatus.Paused && !subscription.CancelAtPeriodEnd)
            {
                throw new InvalidOperationException("Only paused subscriptions or subscriptions pending period-end cancellation can be resumed.");
            }

            subscription.Status = SubscriptionStatus.Active;
            subscription.CancelAtPeriodEnd = false;
            subscription.CanceledAtUtc = null;

            foreach (var item in subscription.Items.Where(x => x.BillingType == BillingType.Recurring && !x.EndedAtUtc.HasValue))
            {
                item.AutoRenew = true;
                if (!item.NextBillingUtc.HasValue && item.CurrentPeriodEndUtc.HasValue && item.CurrentPeriodEndUtc.Value >= DateTime.UtcNow)
                {
                    item.NextBillingUtc = BillingCalculator.ComputeNextBillingUtc(item.CurrentPeriodEndUtc.Value);
                }
            }

            SyncAggregateSnapshot(subscription);
            return "subscription.resumed";
        }, cancellationToken);

    public async Task<SubscriptionDto?> CancelAsync(Guid id, CancelSubscriptionRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        var subscription = await Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (subscription is null)
        {
            return null;
        }

        var activeRecurringItems = subscription.Items.Where(x => x.BillingType == BillingType.Recurring && !x.EndedAtUtc.HasValue).ToList();
        if (request.EndOfPeriod)
        {
            if (activeRecurringItems.Count == 0)
            {
                throw new InvalidOperationException("Subscription does not have an active billing period.");
            }

            if (request.EffectiveDateUtc.HasValue && HasMixedIntervals(subscription))
            {
                throw new InvalidOperationException("Custom cancellation dates are not supported for subscriptions with mixed billing intervals.");
            }

            var effectiveDateUtc = request.EffectiveDateUtc.HasValue
                ? (request.EffectiveDateUtc.Value.Kind == DateTimeKind.Utc ? request.EffectiveDateUtc.Value : request.EffectiveDateUtc.Value.ToUniversalTime())
                : (DateTime?)null;

            foreach (var item in activeRecurringItems)
            {
                if (effectiveDateUtc.HasValue)
                {
                    if (!item.CurrentPeriodStartUtc.HasValue || !item.CurrentPeriodEndUtc.HasValue)
                    {
                        throw new InvalidOperationException("Subscription item does not have an active billing period.");
                    }

                    if (effectiveDateUtc <= DateTime.UtcNow)
                    {
                        throw new InvalidOperationException("Cancellation date must be in the future.");
                    }

                    if (effectiveDateUtc < item.CurrentPeriodStartUtc.Value || effectiveDateUtc > item.CurrentPeriodEndUtc.Value)
                    {
                        throw new InvalidOperationException("Cancellation date must be within the current billing period.");
                    }

                    item.CurrentPeriodEndUtc = effectiveDateUtc.Value;
                }

                item.AutoRenew = false;
                item.NextBillingUtc = null;
            }

            subscription.CancelAtPeriodEnd = true;
            subscription.CanceledAtUtc = DateTime.UtcNow;
            subscription.EndedAtUtc = null;
        }
        else
        {
            var nowUtc = DateTime.UtcNow;
            subscription.Status = SubscriptionStatus.Cancelled;
            subscription.CancelAtPeriodEnd = false;
            subscription.CanceledAtUtc = nowUtc;
            subscription.EndedAtUtc = nowUtc;

            foreach (var item in subscription.Items.Where(x => !x.EndedAtUtc.HasValue))
            {
                item.AutoRenew = false;
                item.NextBillingUtc = null;
                item.EndedAtUtc = nowUtc;
            }
        }

        SyncAggregateSnapshot(subscription);
        ThrowIfInvalid(SubscriptionValidators.ValidateSnapshot(subscription));
        subscription.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("subscription.cancelled", nameof(Subscription), subscription.Id.ToString(), $"endOfPeriod={request.EndOfPeriod}", cancellationToken);
        return Map(subscription);
    }

    private async Task<SubscriptionDto?> UpdateStatusAsync(Guid id, Func<Subscription, string> updater, CancellationToken cancellationToken)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        var subscription = await Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (subscription is null)
        {
            return null;
        }

        var action = updater(subscription);
        subscription.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync(action, nameof(Subscription), subscription.Id.ToString(), null, cancellationToken);
        return Map(subscription);
    }

    private IQueryable<Subscription> Query() =>
        dbContext.Subscriptions
            .Include(x => x.Company)
            .Include(x => x.Customer)
            .Include(x => x.Items).ThenInclude(x => x.ProductPlan)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

    private static SubscriptionDto Map(Subscription subscription)
    {
        SyncAggregateSnapshot(subscription);
        var nowUtc = DateTime.UtcNow;

        return new SubscriptionDto(
            subscription.Id,
            subscription.CompanyId,
            subscription.Company?.Name ?? string.Empty,
            subscription.CustomerId,
            subscription.Customer?.Name ?? string.Empty,
            subscription.Status,
            subscription.StartDateUtc,
            subscription.TrialStartUtc,
            subscription.TrialEndUtc,
            subscription.Items.Any(x => x.TrialEndUtc.HasValue && x.TrialEndUtc.Value > nowUtc && !x.EndedAtUtc.HasValue),
            subscription.CurrentPeriodStartUtc,
            subscription.CurrentPeriodEndUtc,
            subscription.NextBillingUtc,
            subscription.Items.Any(x => x.NextBillingUtc.HasValue && x.NextBillingUtc.Value <= nowUtc && !x.EndedAtUtc.HasValue),
            subscription.Items.Any(x =>
                x.CurrentPeriodStartUtc.HasValue
                && x.CurrentPeriodEndUtc.HasValue
                && x.CurrentPeriodStartUtc.Value <= nowUtc
                && nowUtc <= x.CurrentPeriodEndUtc.Value
                && !x.EndedAtUtc.HasValue),
            subscription.CancelAtPeriodEnd,
            subscription.CanceledAtUtc,
            subscription.EndedAtUtc,
            subscription.AutoRenew,
            subscription.UnitPrice,
            subscription.Currency,
            subscription.IntervalUnit,
            subscription.IntervalCount,
            subscription.Quantity,
            subscription.UnitPrice * subscription.Quantity,
            HasMixedIntervals(subscription),
            subscription.Notes,
            subscription.CreatedAtUtc,
            subscription.UpdatedAtUtc,
            subscription.Items.Select(x => new SubscriptionItemDto(
                x.Id,
                x.ProductPlanId,
                x.ProductPlan?.PlanName ?? string.Empty,
                x.Quantity,
                x.UnitAmount,
                x.Currency,
                x.IntervalUnit,
                x.IntervalCount,
                x.TrialStartUtc,
                x.TrialEndUtc,
                x.CurrentPeriodStartUtc,
                x.CurrentPeriodEndUtc,
                x.NextBillingUtc,
                x.AutoRenew,
                x.NextBillingUtc.HasValue && x.NextBillingUtc.Value <= nowUtc && !x.EndedAtUtc.HasValue,
                x.UnitAmount * x.Quantity)).ToList());
    }

    internal static void SyncAggregateSnapshot(Subscription subscription)
    {
        var activeItems = subscription.Items.Where(x => !x.EndedAtUtc.HasValue).ToList();
        var recurringActiveItems = activeItems.Where(x => x.BillingType == BillingType.Recurring).ToList();
        var distinctIntervals = recurringActiveItems.Select(x => new { x.IntervalUnit, x.IntervalCount }).Distinct().ToList();

        subscription.Currency = activeItems.FirstOrDefault()?.Currency ?? "MYR";
        subscription.AutoRenew = recurringActiveItems.Any(x => x.AutoRenew);
        subscription.TrialStartUtc = activeItems.Where(x => x.TrialStartUtc.HasValue).Min(x => x.TrialStartUtc);
        subscription.TrialEndUtc = activeItems.Where(x => x.TrialEndUtc.HasValue && x.TrialEndUtc.Value > DateTime.UtcNow).Max(x => x.TrialEndUtc);
        subscription.Quantity = activeItems.Count == 1 ? activeItems[0].Quantity : 1;

        if (activeItems.Count == 1)
        {
            subscription.UnitPrice = activeItems[0].UnitAmount;
        }
        else
        {
            subscription.UnitPrice = activeItems.Sum(x => x.UnitAmount * x.Quantity);
        }

        if (distinctIntervals.Count == 1)
        {
            subscription.IntervalUnit = distinctIntervals[0].IntervalUnit;
            subscription.IntervalCount = distinctIntervals[0].IntervalCount;
        }
        else
        {
            subscription.IntervalUnit = IntervalUnit.None;
            subscription.IntervalCount = 0;
        }

        var nextItem = recurringActiveItems
            .Where(x => x.NextBillingUtc.HasValue)
            .OrderBy(x => x.NextBillingUtc)
            .ThenBy(x => x.CreatedAtUtc)
            .FirstOrDefault();

        subscription.NextBillingUtc = nextItem?.NextBillingUtc;
        subscription.CurrentPeriodStartUtc = nextItem?.CurrentPeriodStartUtc;
        subscription.CurrentPeriodEndUtc = nextItem?.CurrentPeriodEndUtc
            ?? recurringActiveItems.Where(x => x.CurrentPeriodEndUtc.HasValue).Max(x => x.CurrentPeriodEndUtc);

        if (activeItems.Count == 0)
        {
            subscription.AutoRenew = false;
            subscription.UnitPrice = 0;
            subscription.Quantity = 1;
            subscription.Currency = "MYR";
            subscription.IntervalUnit = IntervalUnit.None;
            subscription.IntervalCount = 0;
            subscription.TrialStartUtc = null;
            subscription.TrialEndUtc = null;
            subscription.CurrentPeriodStartUtc = null;
            subscription.CurrentPeriodEndUtc = null;
            subscription.NextBillingUtc = null;
            subscription.Status = SubscriptionStatus.Cancelled;
            subscription.EndedAtUtc ??= subscription.CanceledAtUtc ?? DateTime.UtcNow;
            return;
        }

        if (subscription.Status != SubscriptionStatus.Paused && subscription.Status != SubscriptionStatus.Cancelled)
        {
            subscription.Status = SubscriptionStatus.Active;
        }

        if (!subscription.CancelAtPeriodEnd && !subscription.AutoRenew)
        {
            subscription.CanceledAtUtc = null;
        }
    }

    internal static bool HasMixedIntervals(Subscription subscription) =>
        subscription.Items
            .Where(x => !x.EndedAtUtc.HasValue && x.BillingType == BillingType.Recurring)
            .Select(x => new { x.IntervalUnit, x.IntervalCount })
            .Distinct()
            .Skip(1)
            .Any();

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery() =>
        dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private static void ValidateTrialWindow(DateTime? trialStartUtc, DateTime? trialEndUtc)
    {
        if (trialStartUtc.HasValue != trialEndUtc.HasValue)
        {
            throw new InvalidOperationException("Trial start and end must both be set or both be null.");
        }

        if (trialStartUtc.HasValue && trialEndUtc <= trialStartUtc)
        {
            throw new InvalidOperationException("Trial end must be greater than trial start.");
        }
    }

    internal static (DateTime? CurrentPeriodStartUtc, DateTime? CurrentPeriodEndUtc, DateTime? NextBillingUtc) ComputeBillingCycle(
        DateTime startDateUtc,
        DateTime? trialEndUtc,
        BillingType billingType,
        IntervalUnit intervalUnit,
        int intervalCount)
    {
        if (billingType == BillingType.OneTime)
        {
            return (startDateUtc, startDateUtc, null);
        }

        var currentPeriodStartUtc = trialEndUtc ?? startDateUtc;
        var currentPeriodEndUtc = BillingCalculator.ComputePeriodEnd(currentPeriodStartUtc, intervalUnit, intervalCount);
        var nextBillingUtc = BillingCalculator.ComputeNextBillingUtc(currentPeriodEndUtc);
        return (currentPeriodStartUtc, currentPeriodEndUtc, nextBillingUtc);
    }

    internal static bool IsItemDue(SubscriptionItem item, DateTime nowUtc) =>
        !item.EndedAtUtc.HasValue && item.NextBillingUtc.HasValue && item.NextBillingUtc.Value <= nowUtc;

    internal static bool IsOneTimeItemReadyForBilling(SubscriptionItem item, DateTime nowUtc) =>
        item.BillingType == BillingType.OneTime
        && !item.EndedAtUtc.HasValue
        && item.CurrentPeriodStartUtc.HasValue
        && item.CurrentPeriodStartUtc.Value <= nowUtc;

    internal static bool ShouldEndWithoutRenewal(SubscriptionItem item, DateTime nowUtc) =>
        item.BillingType != BillingType.OneTime
        &&
        !item.EndedAtUtc.HasValue
        && item.CurrentPeriodEndUtc.HasValue
        && item.CurrentPeriodEndUtc.Value <= nowUtc
        && !item.AutoRenew
        && !item.NextBillingUtc.HasValue;

    internal static void ApplySuccessfulRenewal(Subscription subscription, IEnumerable<Guid> billedItemIds)
    {
        var billedSet = billedItemIds.ToHashSet();

        foreach (var item in subscription.Items.Where(x => billedSet.Contains(x.Id) && !x.EndedAtUtc.HasValue))
        {
            if (!item.AutoRenew || !item.NextBillingUtc.HasValue)
            {
                item.EndedAtUtc = item.CurrentPeriodEndUtc ?? DateTime.UtcNow;
                item.NextBillingUtc = null;
                continue;
            }

            item.CurrentPeriodStartUtc = item.NextBillingUtc.Value;
            item.CurrentPeriodEndUtc = BillingCalculator.ComputePeriodEnd(item.CurrentPeriodStartUtc.Value, item.IntervalUnit, item.IntervalCount);
            item.NextBillingUtc = BillingCalculator.ComputeNextBillingUtc(item.CurrentPeriodEndUtc.Value);
        }

        SyncAggregateSnapshot(subscription);
    }

    private static void ThrowIfInvalid(IReadOnlyCollection<string> errors)
    {
        if (errors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(" ", errors));
        }
    }
}
