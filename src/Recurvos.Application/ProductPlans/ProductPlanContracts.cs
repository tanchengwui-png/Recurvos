using System.ComponentModel.DataAnnotations;
using Recurvos.Application.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.ProductPlans;

public sealed class ProductPlanListQuery
{
    public Guid? ProductId { get; set; }
    public BillingType? BillingType { get; set; }
    public bool? IsActive { get; set; }
    [Range(1, 10_000)]
    public int Page { get; set; } = 1;
    [Range(1, 100)]
    public int PageSize { get; set; } = 20;
}

public sealed class ProductPlanUpsertRequest
{
    [Required]
    public Guid ProductId { get; set; }

    [Required, MaxLength(150)]
    public string PlanName { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string PlanCode { get; set; } = string.Empty;

    [Required]
    public BillingType BillingType { get; set; }

    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.None;
    public int IntervalCount { get; set; }

    [Required, MaxLength(3)]
    public string Currency { get; set; } = "MYR";

    public decimal UnitAmount { get; set; }
    public int TrialDays { get; set; }
    public TaxBehavior TaxBehavior { get; set; } = TaxBehavior.Unspecified;
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

public sealed class ProductPlanStatusRequest
{
    public bool IsActive { get; set; }
}

public sealed class ProductPlanDefaultRequest
{
    public bool IsDefault { get; set; } = true;
}

public sealed record ProductPlanDto(
    Guid Id,
    Guid ProductId,
    string ProductName,
    string PlanName,
    string PlanCode,
    BillingType BillingType,
    IntervalUnit IntervalUnit,
    int IntervalCount,
    string BillingLabel,
    string Currency,
    decimal UnitAmount,
    int TrialDays,
    TaxBehavior TaxBehavior,
    bool IsDefault,
    bool IsActive,
    bool IsInUse,
    int SortOrder,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc);

public interface IProductPlanService
{
    Task<PagedResult<ProductPlanDto>> GetAsync(ProductPlanListQuery query, CancellationToken cancellationToken = default);
    Task<ProductPlanDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ProductPlanDto>> GetByProductAsync(Guid productId, CancellationToken cancellationToken = default);
    Task<ProductPlanDto> CreateAsync(Guid productId, ProductPlanUpsertRequest request, CancellationToken cancellationToken = default);
    Task<ProductPlanDto?> UpdateAsync(Guid id, ProductPlanUpsertRequest request, CancellationToken cancellationToken = default);
    Task<ProductPlanDto?> SetStatusAsync(Guid id, ProductPlanStatusRequest request, CancellationToken cancellationToken = default);
    Task<ProductPlanDto?> SetDefaultAsync(Guid id, ProductPlanDefaultRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
