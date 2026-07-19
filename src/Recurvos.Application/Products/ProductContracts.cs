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
    public Guid? CompanyId { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? Barcode { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; }

    public IReadOnlyCollection<string> ProductGroups { get; set; } = Array.Empty<string>();

    [MaxLength(100)]
    public string? BinLocation { get; set; }

    public bool TrackInventory { get; set; }
    public Guid? InventoryAccountId { get; set; }
    [MaxLength(100)]
    public string InventoryAccount { get; set; } = string.Empty;
    public decimal? ReorderLevel { get; set; }
    public decimal? OpeningQuantity { get; set; }
    public decimal? OpeningCost { get; set; }

    public bool IsSelling { get; set; } = true;
    public decimal? SalesPrice { get; set; }
    public Guid? SalesTaxCodeId { get; set; }
    [MaxLength(100)]
    public string SalesTaxCode { get; set; } = string.Empty;
    public Guid? IncomeAccountId { get; set; }
    [MaxLength(100)]
    public string IncomeAccount { get; set; } = string.Empty;
    [MaxLength(2000)]
    public string? SalesDescription { get; set; }

    public bool IsBuying { get; set; }
    public decimal? PurchasePrice { get; set; }
    public Guid? PurchaseTaxCodeId { get; set; }
    [MaxLength(100)]
    public string PurchaseTaxCode { get; set; } = string.Empty;
    public Guid? ExpenseAccountId { get; set; }
    [MaxLength(100)]
    public string ExpenseAccount { get; set; } = string.Empty;
    public Guid? PreferredSupplierId { get; set; }
    [MaxLength(200)]
    public string PreferredSupplierName { get; set; } = string.Empty;
    [MaxLength(2000)]
    public string? PurchaseDescription { get; set; }

    [Required, MaxLength(50)]
    public string BaseUnitLabel { get; set; } = "Unit";
    public bool HasMultipleUoms { get; set; }
    public IReadOnlyCollection<ProductUomConversionDto> UomConversions { get; set; } = Array.Empty<ProductUomConversionDto>();
    public bool HasCustomSalesPrices { get; set; }
    public IReadOnlyCollection<ProductCustomPriceDto> CustomSalesPrices { get; set; } = Array.Empty<ProductCustomPriceDto>();
    public bool HasCustomPurchasePrices { get; set; }
    public IReadOnlyCollection<ProductCustomPriceDto> CustomPurchasePrices { get; set; } = Array.Empty<ProductCustomPriceDto>();

    public bool IsSubscriptionProduct { get; set; } = true;
    public bool IsActive { get; set; } = true;
}

public sealed class ProductStatusRequest
{
    public bool IsActive { get; set; }
}

public sealed class ProductBatchUpdateRequest
{
    public IReadOnlyCollection<Guid> ProductIds { get; set; } = Array.Empty<Guid>();
    public IReadOnlyCollection<string> Fields { get; set; } = Array.Empty<string>();
    public ProductBatchUpdateValues Values { get; set; } = new();
    public string ProductGroupsMode { get; set; } = "Replace";
}

public sealed class ProductBatchUpdateValues
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Barcode { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public IReadOnlyCollection<string> ProductGroups { get; set; } = Array.Empty<string>();
    public string BinLocation { get; set; } = string.Empty;
    public bool TrackInventory { get; set; }
    public decimal? ReorderLevel { get; set; }
    public decimal? OpeningQuantity { get; set; }
    public decimal? OpeningCost { get; set; }
    public bool IsSelling { get; set; }
    public decimal? SalesPrice { get; set; }
    public string SalesDescription { get; set; } = string.Empty;
    public bool IsBuying { get; set; }
    public decimal? PurchasePrice { get; set; }
    public string PurchaseDescription { get; set; } = string.Empty;
    public string BaseUnitLabel { get; set; } = "Unit";
    public bool IsSubscriptionProduct { get; set; }
    public bool IsActive { get; set; }
}

public sealed record ProductBatchUpdateResult(int RequestedCount, int SuccessCount, int FailureCount, IReadOnlyCollection<Guid> FailedProductIds, IReadOnlyCollection<string> UpdatedFields);

public sealed record ProductDefaultPlanSummaryDto(Guid Id, string PlanName, string BillingLabel, decimal UnitAmount, string Currency);

public sealed record ProductUomConversionDto(
    string Label,
    decimal Factor,
    decimal? SalePrice = null,
    decimal? PurchasePrice = null,
    bool IsDefaultSalesUom = false,
    bool IsDefaultPurchaseUom = false);

public sealed record ProductCustomPriceDto(
    string TargetType,
    Guid? ContactId = null,
    string ContactCode = "",
    string ContactName = "",
    string ContactGroup = "",
    string PriceLevel = "",
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    decimal? MinQuantity = null,
    string Uom = "",
    decimal UnitPrice = 0m);

public sealed record ProductListItemDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    string Name,
    string Code,
    string? Barcode,
    string? Category,
    IReadOnlyCollection<string> ProductGroups,
    decimal? SalesPrice,
    decimal? PurchasePrice,
    string BaseUnitLabel,
    bool HasMultipleUoms,
    IReadOnlyCollection<ProductUomConversionDto> UomConversions,
    bool HasCustomSalesPrices,
    IReadOnlyCollection<ProductCustomPriceDto> CustomSalesPrices,
    bool HasCustomPurchasePrices,
    IReadOnlyCollection<ProductCustomPriceDto> CustomPurchasePrices,
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
    string? Barcode,
    string? Category,
    IReadOnlyCollection<string> ProductGroups,
    string? BinLocation,
    bool HasImage,
    bool TrackInventory,
    Guid? InventoryAccountId,
    string InventoryAccount,
    decimal? ReorderLevel,
    decimal? OpeningQuantity,
    decimal? OpeningCost,
    bool IsSelling,
    decimal? SalesPrice,
    Guid? SalesTaxCodeId,
    string SalesTaxCode,
    Guid? IncomeAccountId,
    string IncomeAccount,
    string? SalesDescription,
    bool IsBuying,
    decimal? PurchasePrice,
    Guid? PurchaseTaxCodeId,
    string PurchaseTaxCode,
    Guid? ExpenseAccountId,
    string ExpenseAccount,
    Guid? PreferredSupplierId,
    string PreferredSupplierName,
    string? PurchaseDescription,
    string BaseUnitLabel,
    bool HasMultipleUoms,
    IReadOnlyCollection<ProductUomConversionDto> UomConversions,
    bool HasCustomSalesPrices,
    IReadOnlyCollection<ProductCustomPriceDto> CustomSalesPrices,
    bool HasCustomPurchasePrices,
    IReadOnlyCollection<ProductCustomPriceDto> CustomPurchasePrices,
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
    Task<ProductBatchUpdateResult> BatchUpdateAsync(ProductBatchUpdateRequest request, CancellationToken cancellationToken = default);
    Task<ProductImageFile?> GetImageAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ProductDetailsDto?> UploadImageAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default);
    Task<ProductDetailsDto?> RemoveImageAsync(Guid id, CancellationToken cancellationToken = default);
}

public sealed record ProductImageFile(string FileName, byte[] Content, string ContentType);
