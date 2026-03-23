using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Subscriptions;

public static class SubscriptionValidators
{
    public const int MaxBackdatedStartMonths = 3;

    public static IReadOnlyCollection<string> ValidateRequest(SubscriptionRequest request)
    {
        var errors = new List<string>();

        if (request.Items.Count == 0)
        {
            errors.Add("At least one subscription item is required.");
        }

        if (request.Notes?.Length > 1000)
        {
            errors.Add("Notes must be 1000 characters or fewer.");
        }

        if (request.TrialDays < 0)
        {
            errors.Add("Trial days must be zero or more.");
        }

        return errors;
    }

    public static IReadOnlyCollection<string> ValidateStartDate(DateTime startUtc, DateTime nowUtc)
    {
        var errors = new List<string>();
        var earliestAllowedStartUtc = nowUtc.Date.AddMonths(-MaxBackdatedStartMonths);

        if (startUtc.Date < earliestAllowedStartUtc)
        {
            errors.Add($"Start date cannot be more than {MaxBackdatedStartMonths} months in the past.");
        }

        return errors;
    }

    public static IReadOnlyCollection<string> ValidateUpdate(SubscriptionUpdateRequest request)
    {
        var errors = new List<string>();

        if (request.Notes?.Length > 1000)
        {
            errors.Add("Notes must be 1000 characters or fewer.");
        }

        return errors;
    }

    public static IReadOnlyCollection<string> ValidateSnapshot(Subscription subscription)
    {
        var errors = new List<string>();

        if (subscription.UnitPrice < 0)
        {
            errors.Add("Unit price must be zero or more.");
        }

        if (string.IsNullOrWhiteSpace(subscription.Currency) || subscription.Currency.Trim().Length != 3)
        {
            errors.Add("Currency must be exactly 3 characters.");
        }

        if (subscription.IntervalCount < 0)
        {
            errors.Add("Interval count must be zero or more.");
        }

        if (subscription.IntervalUnit == IntervalUnit.None && subscription.IntervalCount != 0)
        {
            errors.Add("Interval count must be 0 when interval unit is None.");
        }

        if (subscription.IntervalUnit != IntervalUnit.None && subscription.IntervalCount <= 0)
        {
            errors.Add("Interval count must be greater than 0 when interval unit is set.");
        }

        if (subscription.Quantity <= 0)
        {
            errors.Add("Quantity must be at least 1.");
        }

        if (subscription.EndedAtUtc.HasValue && subscription.CanceledAtUtc.HasValue && subscription.EndedAtUtc < subscription.CanceledAtUtc)
        {
            errors.Add("Ended at must be on or after canceled at.");
        }

        if (subscription.EndedAtUtc.HasValue && subscription.NextBillingUtc.HasValue)
        {
            errors.Add("Ended subscriptions must not have a next billing date.");
        }

        if (subscription.Notes?.Length > 1000)
        {
            errors.Add("Notes must be 1000 characters or fewer.");
        }

        foreach (var item in subscription.Items)
        {
            if (item.Quantity <= 0)
            {
                errors.Add("Subscription item quantity must be at least 1.");
            }

            if (item.UnitAmount < 0)
            {
                errors.Add("Subscription item unit amount must be zero or more.");
            }

            if (string.IsNullOrWhiteSpace(item.Currency) || item.Currency.Trim().Length != 3)
            {
                errors.Add("Subscription item currency must be exactly 3 characters.");
            }

            if (item.IntervalUnit == IntervalUnit.None && item.IntervalCount != 0)
            {
                errors.Add("Subscription item interval count must be 0 when interval unit is None.");
            }

            if (item.IntervalUnit != IntervalUnit.None && item.IntervalCount <= 0)
            {
                errors.Add("Subscription item interval count must be greater than 0 when interval unit is set.");
            }
        }

        return errors;
    }

    public static IReadOnlyCollection<string> ValidatePricingUpdate(UpdateSubscriptionPricingRequest request)
    {
        var errors = new List<string>();

        if (request.UnitPrice < 0)
        {
            errors.Add("Unit price must be zero or more.");
        }

        if (string.IsNullOrWhiteSpace(request.Currency) || request.Currency.Trim().Length != 3)
        {
            errors.Add("Currency must be exactly 3 characters.");
        }

        if (request.IntervalCount < 0)
        {
            errors.Add("Interval count must be zero or more.");
        }

        if (request.IntervalUnit == IntervalUnit.None && request.IntervalCount != 0)
        {
            errors.Add("Interval count must be 0 when interval unit is None.");
        }

        if (request.IntervalUnit != IntervalUnit.None && request.IntervalCount <= 0)
        {
            errors.Add("Interval count must be greater than 0 when interval unit is set.");
        }

        if (request.Quantity <= 0)
        {
            errors.Add("Quantity must be at least 1.");
        }

        if (request.Reason?.Length > 1000)
        {
            errors.Add("Reason must be 1000 characters or fewer.");
        }

        return errors;
    }
}
