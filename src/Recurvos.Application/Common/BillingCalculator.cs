namespace Recurvos.Application.Common;

public static class BillingCalculator
{
    public static DateTime ComputeNextBillingDate(DateTime fromUtc, Recurvos.Domain.Enums.IntervalUnit intervalUnit, int intervalCount) =>
        intervalUnit switch
        {
            Recurvos.Domain.Enums.IntervalUnit.Month => fromUtc.AddMonths(intervalCount),
            Recurvos.Domain.Enums.IntervalUnit.Quarter => fromUtc.AddMonths(intervalCount * 3),
            Recurvos.Domain.Enums.IntervalUnit.Year => fromUtc.AddYears(intervalCount),
            _ => throw new ArgumentOutOfRangeException(nameof(intervalUnit), intervalUnit, "Unsupported billing interval.")
        };

    public static DateTime ComputePeriodEnd(DateTime periodStartUtc, Recurvos.Domain.Enums.IntervalUnit intervalUnit, int intervalCount) =>
        intervalUnit switch
        {
            Recurvos.Domain.Enums.IntervalUnit.Month => periodStartUtc.AddMonths(intervalCount).AddDays(-1),
            Recurvos.Domain.Enums.IntervalUnit.Quarter => periodStartUtc.AddMonths(intervalCount * 3).AddDays(-1),
            Recurvos.Domain.Enums.IntervalUnit.Year => periodStartUtc.AddYears(intervalCount).AddDays(-1),
            _ => throw new ArgumentOutOfRangeException(nameof(intervalUnit), intervalUnit, "Unsupported billing interval.")
        };

    public static DateTime ComputeNextBillingUtc(DateTime periodEndUtc) => periodEndUtc.AddDays(1);
}
