using System.ComponentModel.DataAnnotations;
using Recurvos.Application.Common;

namespace Recurvos.Application.Products;

public sealed class ProductListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public bool? IsActive { get; set; }
    [Range(1, 10_000)]
    public int Page { get; set; } = 1;
    [Range(1, 100)]
    public int PageSize { get; set; } = 20;
}

public sealed class ProductUpsertRequest
{
    [Required]
    public Guid CompanyId { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; }

    public bool IsSubscriptionProduct { get; set; } = true;
    public bool IsActive { get; set; } = true;
}

public sealed class ProductStatusRequest
{
    public bool IsActive { get; set; }
}

public sealed record ProductDefaultPlanSummaryDto(Guid Id, string PlanName, string BillingLabel, decimal UnitAmount, string Currency);

public sealed record ProductListItemDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    string Name,
    string Code,
    string? Category,
    string ProductType,
    int PlansCount,
    bool IsActive,
    bool IsSubscriptionProduct,
    ProductDefaultPlanSummaryDto? DefaultPlan);

public sealed record ProductDetailsDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    string Name,
    string Code,
    string? Description,
    string? Category,
    bool IsSubscriptionProduct,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    int PlansCount,
    int ActivePlansCount,
    ProductDefaultPlanSummaryDto? DefaultPlan,
    decimal? StartingPrice);

public interface IProductService
{
    Task<PagedResult<ProductListItemDto>> GetAsync(ProductListQuery query, CancellationToken cancellationToken = default);
    Task<ProductDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ProductDetailsDto> CreateAsync(ProductUpsertRequest request, CancellationToken cancellationToken = default);
    Task<ProductDetailsDto?> UpdateAsync(Guid id, ProductUpsertRequest request, CancellationToken cancellationToken = default);
    Task<ProductDetailsDto?> SetStatusAsync(Guid id, ProductStatusRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
