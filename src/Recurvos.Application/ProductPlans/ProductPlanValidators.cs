using System.Text.RegularExpressions;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.ProductPlans;

public static class ProductPlanValidators
{
    private static readonly Regex CodePattern = new("^[A-Z0-9]+(?:-[A-Z0-9]+)*$", RegexOptions.Compiled);

    public static IReadOnlyCollection<string> Validate(ProductPlanUpsertRequest request)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(request.PlanName))
        {
            errors.Add("Plan name is required.");
        }
        else if (request.PlanName.Length > 150)
        {
            errors.Add("Plan name must be 150 characters or fewer.");
        }

        if (string.IsNullOrWhiteSpace(request.PlanCode))
        {
            errors.Add("Plan code is required.");
        }
        else if (request.PlanCode.Length > 50)
        {
            errors.Add("Plan code must be 50 characters or fewer.");
        }
        else if (!CodePattern.IsMatch(request.PlanCode))
        {
            errors.Add("Plan code must use uppercase slug style.");
        }

        if (request.UnitAmount < 0)
        {
            errors.Add("Unit amount must be zero or more.");
        }

        if (string.IsNullOrWhiteSpace(request.Currency))
        {
            errors.Add("Currency is required.");
        }
        else if (!string.Equals(request.Currency.Trim(), "MYR", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Currency must be MYR for this release.");
        }

        if (request.BillingType == BillingType.OneTime)
        {
            if (request.IntervalUnit != IntervalUnit.None)
            {
                errors.Add("One-time plans must use interval unit None.");
            }

            if (request.IntervalCount != 0)
            {
                errors.Add("One-time plans must use interval count 0.");
            }
        }

        if (request.BillingType == BillingType.Recurring)
        {
            if (request.IntervalUnit == IntervalUnit.None)
            {
                errors.Add("Recurring plans require an interval unit.");
            }

            if (request.IntervalCount <= 0)
            {
                errors.Add("Recurring plans require interval count greater than 0.");
            }
        }

        return errors;
    }
}
