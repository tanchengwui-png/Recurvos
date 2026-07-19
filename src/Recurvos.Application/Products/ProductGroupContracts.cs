using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Products;

public sealed class ProductGroupRequest
{
    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    public IReadOnlyCollection<Guid> ProductIds { get; set; } = Array.Empty<Guid>();
}

public sealed class ProductGroupDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int ProductsCount { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public IReadOnlyCollection<Guid> ProductIds { get; set; } = Array.Empty<Guid>();
}

public sealed class ProductGroupProductLookupDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public bool IsSelling { get; set; }
    public bool IsBuying { get; set; }
    public bool TrackInventory { get; set; }
    public bool IsActive { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public IReadOnlyCollection<string> ProductGroups { get; set; } = Array.Empty<string>();
}

public interface IProductGroupService
{
    Task<IReadOnlyCollection<ProductGroupDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<ProductGroupDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ProductGroupProductLookupDto>> GetProductsAsync(CancellationToken cancellationToken = default);
    Task<ProductGroupDto> CreateAsync(ProductGroupRequest request, CancellationToken cancellationToken = default);
    Task<ProductGroupDto?> UpdateAsync(Guid id, ProductGroupRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
