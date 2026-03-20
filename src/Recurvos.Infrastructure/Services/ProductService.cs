using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Common;
using Recurvos.Application.Platform;
using Recurvos.Application.Products;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class ProductService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IPackageLimitService packageLimitService) : IProductService
{
    public async Task<PagedResult<ProductListItemDto>> GetAsync(ProductListQuery query, CancellationToken cancellationToken = default)
    {
        var products = dbContext.Products
            .Include(x => x.Company)
            .Include(x => x.Plans)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            products = products.Where(x => x.Name.Contains(term) || x.Code.Contains(term));
        }

        if (query.CompanyId.HasValue)
        {
            products = products.Where(x => x.CompanyId == query.CompanyId.Value);
        }

        if (query.IsActive.HasValue)
        {
            products = products.Where(x => x.IsActive == query.IsActive.Value);
        }

        var totalCount = await products.CountAsync(cancellationToken);
        var items = await products
            .OrderBy(x => x.Name)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<ProductListItemDto>(items.Select(MapListItem).ToList(), totalCount);
    }

    public async Task<ProductDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products
            .Include(x => x.Company)
            .Include(x => x.Plans)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        return product is null ? null : MapDetails(product);
    }

    public async Task<ProductDetailsDto> CreateAsync(ProductUpsertRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(request.CompanyId, cancellationToken);
        await packageLimitService.EnsureCanCreateProductAsync(cancellationToken);
        await ValidateRequestAsync(request, null, cancellationToken);
        var product = new Product
        {
            CompanyId = request.CompanyId,
            Name = request.Name.Trim(),
            Code = request.Code.Trim().ToUpperInvariant(),
            Description = request.Description?.Trim(),
            Category = request.Category?.Trim(),
            IsSubscriptionProduct = request.IsSubscriptionProduct,
            IsActive = request.IsActive
        };

        dbContext.Products.Add(product);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product.created", nameof(Product), product.Id.ToString(), product.Name, cancellationToken);
        return MapDetails(await dbContext.Products.Include(x => x.Company).Include(x => x.Plans).FirstAsync(x => x.Id == product.Id, cancellationToken));
    }

    public async Task<ProductDetailsDto?> UpdateAsync(Guid id, ProductUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products
            .Include(x => x.Company)
            .Include(x => x.Plans)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (product is null)
        {
            return null;
        }

        if (product.CompanyId != request.CompanyId)
        {
            throw new InvalidOperationException("Product company cannot be changed.");
        }

        await ValidateRequestAsync(request, id, cancellationToken);
        product.Name = request.Name.Trim();
        product.Code = request.Code.Trim().ToUpperInvariant();
        product.Description = request.Description?.Trim();
        product.Category = request.Category?.Trim();
        product.IsSubscriptionProduct = request.IsSubscriptionProduct;
        product.IsActive = request.IsActive;

        if (!request.IsActive)
        {
            foreach (var plan in product.Plans.Where(x => x.IsActive))
            {
                plan.IsActive = false;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product.updated", nameof(Product), product.Id.ToString(), product.Name, cancellationToken);
        return MapDetails(product);
    }

    public async Task<ProductDetailsDto?> SetStatusAsync(Guid id, ProductStatusRequest request, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products.Include(x => x.Plans)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (product is null)
        {
            return null;
        }

        product.IsActive = request.IsActive;
        if (!request.IsActive)
        {
            foreach (var plan in product.Plans.Where(x => x.IsActive))
            {
                plan.IsActive = false;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product.status-updated", nameof(Product), product.Id.ToString(), $"isActive={request.IsActive}", cancellationToken);
        return MapDetails(product);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products.Include(x => x.Plans)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (product is null)
        {
            return false;
        }

        if (product.Plans.Count > 0)
        {
            throw new InvalidOperationException("Products with plans cannot be deleted.");
        }

        dbContext.Products.Remove(product);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product.deleted", nameof(Product), product.Id.ToString(), product.Name, cancellationToken);
        return true;
    }

    private async Task ValidateRequestAsync(ProductUpsertRequest request, Guid? existingId, CancellationToken cancellationToken)
    {
        var errors = ProductValidators.Validate(request).ToList();
        var duplicateCode = await dbContext.Products.AnyAsync(
            x => x.CompanyId == request.CompanyId && x.Code == request.Code.Trim().ToUpperInvariant() && x.Id != existingId,
            cancellationToken);
        if (duplicateCode)
        {
            errors.Add("Product code already exists.");
        }

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(Environment.NewLine, errors));
        }
    }

    private static ProductListItemDto MapListItem(Product product)
    {
        var activePlans = product.Plans.Where(x => x.IsActive).ToList();
        var defaultPlan = activePlans.FirstOrDefault(x => x.IsDefault) ?? activePlans.OrderBy(x => x.UnitAmount).FirstOrDefault();
        var productType = activePlans.Count == 0
            ? (product.IsSubscriptionProduct ? "Subscription" : "One-Time")
            : activePlans.Select(x => x.BillingType).Distinct().Count() > 1
                ? "Mixed"
                : activePlans.All(x => x.BillingType == BillingType.OneTime)
                    ? "One-Time"
                    : "Subscription";

        return new ProductListItemDto(
            product.Id,
            product.CompanyId,
            product.Company?.Name ?? string.Empty,
            product.Name,
            product.Code,
            product.Category,
            productType,
            product.Plans.Count,
            product.IsActive,
            product.IsSubscriptionProduct,
            defaultPlan is null
                ? null
                : new ProductDefaultPlanSummaryDto(
                    defaultPlan.Id,
                    defaultPlan.PlanName,
                    ProductPlanService.FormatBillingLabel(defaultPlan.BillingType, defaultPlan.IntervalUnit, defaultPlan.IntervalCount),
                    defaultPlan.UnitAmount,
                    defaultPlan.Currency));
    }

    private static ProductDetailsDto MapDetails(Product product)
    {
        var activePlans = product.Plans.Where(x => x.IsActive).ToList();
        var defaultPlan = activePlans.FirstOrDefault(x => x.IsDefault) ?? activePlans.OrderBy(x => x.UnitAmount).FirstOrDefault();
        return new ProductDetailsDto(
            product.Id,
            product.CompanyId,
            product.Company?.Name ?? string.Empty,
            product.Name,
            product.Code,
            product.Description,
            product.Category,
            product.IsSubscriptionProduct,
            product.IsActive,
            product.CreatedAtUtc,
            product.UpdatedAtUtc,
            product.Plans.Count,
            activePlans.Count,
            defaultPlan is null
                ? null
                : new ProductDefaultPlanSummaryDto(
                    defaultPlan.Id,
                    defaultPlan.PlanName,
                    ProductPlanService.FormatBillingLabel(defaultPlan.BillingType, defaultPlan.IntervalUnit, defaultPlan.IntervalCount),
                    defaultPlan.UnitAmount,
                    defaultPlan.Currency),
            activePlans.Count == 0 ? null : activePlans.Min(x => x.UnitAmount));
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery() =>
        dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.SubscriberId == GetSubscriberId(), cancellationToken);
        if (!hasAccess)
        {
            throw new UnauthorizedAccessException();
        }
    }
}
