using FluentAssertions;
using Recurvos.Application.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Tests.Billing;

public sealed class BillingCalculatorTests
{
    [Theory]
    [InlineData(IntervalUnit.Month, 1, "2026-02-15")]
    [InlineData(IntervalUnit.Quarter, 1, "2026-04-15")]
    [InlineData(IntervalUnit.Year, 1, "2027-01-15")]
    public void ComputeNextBillingDate_ReturnsExpectedDate(IntervalUnit intervalUnit, int intervalCount, string expected)
    {
        var start = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc);

        var result = BillingCalculator.ComputeNextBillingDate(start, intervalUnit, intervalCount);

        result.Should().Be(DateTime.SpecifyKind(DateTime.Parse(expected), DateTimeKind.Utc));
    }
}
