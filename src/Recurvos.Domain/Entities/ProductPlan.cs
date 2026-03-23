using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class ProductPlan : CompanyOwnedEntity
{
    public Guid ProductId { get; set; }
    public string PlanName { get; set; } = string.Empty;
    public string PlanCode { get; set; } = string.Empty;
    public BillingType BillingType { get; set; }
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.None;
    public int IntervalCount { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal UnitAmount { get; set; }
    public decimal SetupFeeAmount { get; set; }
    public TaxBehavior TaxBehavior { get; set; } = TaxBehavior.Unspecified;
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    // Future-ready pricing extensions.
    // public PricingModel PricingModel { get; set; } = PricingModel.FlatRate;
    // public int? SeatCountLimit { get; set; }
    // public string? MeterName { get; set; }
    // public decimal? OverageRate { get; set; }

    public Product? Product { get; set; }
}
