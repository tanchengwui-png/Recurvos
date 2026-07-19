using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Products;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class ProductGroupService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IProductGroupService
{
    public async Task<IReadOnlyCollection<ProductGroupDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var subscriberId = GetSubscriberId();
        var groups = await dbContext.ProductGroups
            .Where(x => x.SubscriberId == subscriberId)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);
        var products = await GetOwnedProductsQuery()
            .ToListAsync(cancellationToken);

        return groups.Select(group => BuildDto(group, products)).ToList();
    }

    public async Task<ProductGroupDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var subscriberId = GetSubscriberId();
        var group = await dbContext.ProductGroups
            .FirstOrDefaultAsync(x => x.SubscriberId == subscriberId && x.Id == id, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var products = await GetOwnedProductsQuery()
            .ToListAsync(cancellationToken);
        return BuildDto(group, products);
    }

    public async Task<IReadOnlyCollection<ProductGroupProductLookupDto>> GetProductsAsync(CancellationToken cancellationToken = default)
    {
        var products = await GetOwnedProductsQuery()
            .OrderBy(x => x.Name)
            .ThenBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return products.Select(product => new ProductGroupProductLookupDto
        {
            Id = product.Id,
            Name = product.Name,
            Code = product.Code,
            Barcode = product.Barcode,
            IsSelling = product.IsSelling,
            IsBuying = product.IsBuying,
            TrackInventory = product.TrackInventory,
            IsActive = product.IsActive,
            CompanyName = product.Company?.Name ?? string.Empty,
            ProductGroups = DeserializeList(product.ProductGroupsJson),
        }).ToList();
    }

    public async Task<ProductGroupDto> CreateAsync(ProductGroupRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = GetSubscriberId();
        var normalizedName = NormalizeName(request.Name);
        var normalizedDescription = NormalizeDescription(request.Description);
        await EnsureUniqueNameAsync(subscriberId, normalizedName, null, cancellationToken);

        var selectedProductIds = request.ProductIds.Distinct().ToHashSet();
        var products = await GetOwnedProductsQuery().ToListAsync(cancellationToken);
        EnsureAllProductsExist(selectedProductIds, products);

        var group = new ProductGroup
        {
            SubscriberId = subscriberId,
            Name = normalizedName,
            Description = normalizedDescription,
        };

        dbContext.ProductGroups.Add(group);
        ApplyMembership(normalizedName, null, selectedProductIds, products);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-group.created", nameof(ProductGroup), group.Id.ToString(), group.Name, cancellationToken);
        return BuildDto(group, products);
    }

    public async Task<ProductGroupDto?> UpdateAsync(Guid id, ProductGroupRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = GetSubscriberId();
        var group = await dbContext.ProductGroups
            .FirstOrDefaultAsync(x => x.SubscriberId == subscriberId && x.Id == id, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var normalizedName = NormalizeName(request.Name);
        var normalizedDescription = NormalizeDescription(request.Description);
        await EnsureUniqueNameAsync(subscriberId, normalizedName, id, cancellationToken);

        var selectedProductIds = request.ProductIds.Distinct().ToHashSet();
        var products = await GetOwnedProductsQuery().ToListAsync(cancellationToken);
        EnsureAllProductsExist(selectedProductIds, products);

        var previousName = group.Name;
        group.Name = normalizedName;
        group.Description = normalizedDescription;
        group.UpdatedAtUtc = DateTime.UtcNow;
        ApplyMembership(normalizedName, previousName, selectedProductIds, products);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-group.updated", nameof(ProductGroup), group.Id.ToString(), group.Name, cancellationToken);
        return BuildDto(group, products);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var subscriberId = GetSubscriberId();
        var group = await dbContext.ProductGroups
            .FirstOrDefaultAsync(x => x.SubscriberId == subscriberId && x.Id == id, cancellationToken);
        if (group is null)
        {
            return false;
        }

        var products = await GetOwnedProductsQuery().ToListAsync(cancellationToken);
        ApplyMembership(string.Empty, group.Name, new HashSet<Guid>(), products);
        dbContext.ProductGroups.Remove(group);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-group.deleted", nameof(ProductGroup), group.Id.ToString(), group.Name, cancellationToken);
        return true;
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Product> GetOwnedProductsQuery() =>
        dbContext.Products
            .Include(x => x.Company)
            .Where(x => dbContext.Companies.Any(company => company.Id == x.CompanyId && company.SubscriberId == GetSubscriberId()));

    private static string NormalizeName(string? value)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Product group name is required.");
        }

        return normalized;
    }

    private static string NormalizeDescription(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();

    private async Task EnsureUniqueNameAsync(Guid subscriberId, string name, Guid? excludeId, CancellationToken cancellationToken)
    {
        var normalizedName = name.ToLowerInvariant();
        var exists = await dbContext.ProductGroups.AnyAsync(
            x => x.SubscriberId == subscriberId
                && x.Id != excludeId
                && x.Name.ToLower() == normalizedName,
            cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("A product group with this name already exists.");
        }
    }

    private static void EnsureAllProductsExist(IReadOnlyCollection<Guid> selectedProductIds, IReadOnlyCollection<Product> products)
    {
        var availableProductIds = products.Select(x => x.Id).ToHashSet();
        if (selectedProductIds.Any(id => !availableProductIds.Contains(id)))
        {
            throw new InvalidOperationException("One or more selected products could not be found.");
        }
    }

    private static void ApplyMembership(string newName, string? oldName, IReadOnlySet<Guid> selectedProductIds, IReadOnlyCollection<Product> products)
    {
        foreach (var product in products)
        {
            var groups = DeserializeList(product.ProductGroupsJson);
            if (!string.IsNullOrWhiteSpace(oldName))
            {
                groups.RemoveAll(item => item.Equals(oldName, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.IsNullOrWhiteSpace(newName) && selectedProductIds.Contains(product.Id) && !groups.Contains(newName, StringComparer.OrdinalIgnoreCase))
            {
                groups.Add(newName);
            }

            product.ProductGroupsJson = JsonSerializer.Serialize(groups
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
                .ToList());
            product.UpdatedAtUtc = DateTime.UtcNow;
        }
    }

    private static List<string> DeserializeList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<string>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static ProductGroupDto BuildDto(ProductGroup group, IReadOnlyCollection<Product> products)
    {
        var productIds = products
            .Where(product => DeserializeList(product.ProductGroupsJson).Contains(group.Name, StringComparer.OrdinalIgnoreCase))
            .Select(product => product.Id)
            .OrderBy(id => id)
            .ToArray();

        return new ProductGroupDto
        {
            Id = group.Id,
            Name = group.Name,
            Description = group.Description,
            ProductsCount = productIds.Length,
            CreatedAtUtc = group.CreatedAtUtc,
            UpdatedAtUtc = group.UpdatedAtUtc,
            ProductIds = productIds,
        };
    }
}
