using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Common;
using Recurvos.Application.Platform;
using Recurvos.Application.ProductPlans;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class ProductPlanService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IPackageLimitService packageLimitService) : IProductPlanService
{
    public async Task<PagedResult<ProductPlanDto>> GetAsync(ProductPlanListQuery query, CancellationToken cancellationToken = default)
    {
        var plans = Query();
        if (query.ProductId.HasValue)
        {
            plans = plans.Where(x => x.ProductId == query.ProductId.Value);
        }

        if (query.BillingType.HasValue)
        {
            plans = plans.Where(x => x.BillingType == query.BillingType.Value);
        }

        if (query.IsActive.HasValue)
        {
            plans = plans.Where(x => x.IsActive == query.IsActive.Value);
        }

        var totalCount = await plans.CountAsync(cancellationToken);
        var items = await plans
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.PlanName)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);
        var inUsePlanIds = await dbContext.SubscriptionItems
            .Where(x => items.Select(item => item.Id).Contains(x.ProductPlanId))
            .Select(x => x.ProductPlanId)
            .Distinct()
            .ToListAsync(cancellationToken);

        return new PagedResult<ProductPlanDto>(items.Select(x => Map(x, inUsePlanIds.Contains(x.Id))).ToList(), totalCount);
    }

    public async Task<ProductPlanDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var plan = await Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return plan is null ? null : Map(plan, await IsInUseAsync(plan.Id, plan.CompanyId, cancellationToken));
    }

    public async Task<IReadOnlyCollection<ProductPlanDto>> GetByProductAsync(Guid productId, CancellationToken cancellationToken = default)
    {
        var items = await Query()
            .Where(x => x.ProductId == productId)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.PlanName)
            .ToListAsync(cancellationToken);
        var inUsePlanIds = await dbContext.SubscriptionItems
            .Where(x => items.Select(item => item.Id).Contains(x.ProductPlanId))
            .Select(x => x.ProductPlanId)
            .Distinct()
            .ToListAsync(cancellationToken);
        return items.Select(x => Map(x, inUsePlanIds.Contains(x.Id))).ToList();
    }

    public async Task<ProductPlanDto> CreateAsync(Guid productId, ProductPlanUpsertRequest request, CancellationToken cancellationToken = default)
    {
        await packageLimitService.EnsureCanCreatePlanAsync(cancellationToken);
        request.ProductId = productId;
        await ValidateAsync(request, null, cancellationToken);
        var product = await dbContext.Products.FirstAsync(x => x.Id == productId, cancellationToken);
        var plan = new ProductPlan
        {
            CompanyId = product.CompanyId,
            ProductId = productId,
            PlanName = request.PlanName.Trim(),
            PlanCode = request.PlanCode.Trim().ToUpperInvariant(),
            BillingType = request.BillingType,
            IntervalUnit = request.BillingType == BillingType.OneTime ? IntervalUnit.None : request.IntervalUnit,
            IntervalCount = request.BillingType == BillingType.OneTime ? 0 : request.IntervalCount,
            Currency = "MYR",
            UnitAmount = request.UnitAmount,
            TrialDays = request.BillingType == BillingType.OneTime ? 0 : request.TrialDays,
            SetupFeeAmount = 0,
            TaxBehavior = request.TaxBehavior,
            IsDefault = request.IsDefault,
            IsActive = request.IsActive,
            SortOrder = request.SortOrder
        };

        dbContext.ProductPlans.Add(plan);
        await EnsureSingleDefaultAsync(plan, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-plan.created", nameof(ProductPlan), plan.Id.ToString(), plan.PlanName, cancellationToken);
        return Map(await Query().FirstAsync(x => x.Id == plan.Id, cancellationToken), false);
    }

    public async Task<ProductPlanDto?> UpdateAsync(Guid id, ProductPlanUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await dbContext.ProductPlans.FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (plan is null)
        {
            return null;
        }

        request.ProductId = plan.ProductId;
        await ValidateAsync(request, id, cancellationToken);
        var inUse = await IsInUseAsync(plan.Id, plan.CompanyId, cancellationToken);
        if (inUse && HasBillingTermChanges(plan, request))
        {
            throw new InvalidOperationException("This plan already has subscribed customers. Billing terms cannot be changed. Duplicate the plan for new subscriptions instead.");
        }

        plan.PlanName = request.PlanName.Trim();
        plan.PlanCode = request.PlanCode.Trim().ToUpperInvariant();
        plan.BillingType = request.BillingType;
        plan.IntervalUnit = request.BillingType == BillingType.OneTime ? IntervalUnit.None : request.IntervalUnit;
        plan.IntervalCount = request.BillingType == BillingType.OneTime ? 0 : request.IntervalCount;
        plan.Currency = "MYR";
        plan.UnitAmount = request.UnitAmount;
        plan.TrialDays = request.BillingType == BillingType.OneTime ? 0 : request.TrialDays;
        plan.SetupFeeAmount = 0;
        plan.TaxBehavior = request.TaxBehavior;
        plan.IsDefault = request.IsDefault;
        plan.IsActive = request.IsActive;
        plan.SortOrder = request.SortOrder;

        await EnsureSingleDefaultAsync(plan, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-plan.updated", nameof(ProductPlan), plan.Id.ToString(), plan.PlanName, cancellationToken);
        return Map(await Query().FirstAsync(x => x.Id == plan.Id, cancellationToken), inUse);
    }

    public async Task<ProductPlanDto?> SetStatusAsync(Guid id, ProductPlanStatusRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await dbContext.ProductPlans.FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (plan is null)
        {
            return null;
        }

        if (!request.IsActive && plan.IsDefault)
        {
            throw new InvalidOperationException("Default plans cannot be deactivated until another default plan is selected.");
        }

        plan.IsActive = request.IsActive;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-plan.status-updated", nameof(ProductPlan), plan.Id.ToString(), $"isActive={request.IsActive}", cancellationToken);
        return Map(await Query().FirstAsync(x => x.Id == plan.Id, cancellationToken), await IsInUseAsync(plan.Id, plan.CompanyId, cancellationToken));
    }

    public async Task<ProductPlanDto?> SetDefaultAsync(Guid id, ProductPlanDefaultRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await dbContext.ProductPlans.FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (plan is null)
        {
            return null;
        }

        plan.IsDefault = request.IsDefault;
        await EnsureSingleDefaultAsync(plan, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-plan.default-updated", nameof(ProductPlan), plan.Id.ToString(), $"isDefault={request.IsDefault}", cancellationToken);
        return Map(await Query().FirstAsync(x => x.Id == plan.Id, cancellationToken), await IsInUseAsync(plan.Id, plan.CompanyId, cancellationToken));
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var plan = await dbContext.ProductPlans.FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (plan is null)
        {
            return false;
        }

        var inUse = await dbContext.SubscriptionItems.AnyAsync(x => x.CompanyId == plan.CompanyId && x.ProductPlanId == id, cancellationToken);
        if (inUse)
        {
            throw new InvalidOperationException("Plans linked to subscriptions cannot be deleted.");
        }

        dbContext.ProductPlans.Remove(plan);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product-plan.deleted", nameof(ProductPlan), plan.Id.ToString(), plan.PlanName, cancellationToken);
        return true;
    }

    public static string FormatBillingLabel(BillingType billingType, IntervalUnit intervalUnit, int intervalCount) =>
        billingType == BillingType.OneTime
            ? "One-Time"
            : intervalUnit switch
            {
                IntervalUnit.Month when intervalCount == 1 => "Monthly",
                IntervalUnit.Quarter when intervalCount == 1 => "Quarterly",
                IntervalUnit.Year when intervalCount == 1 => "Yearly",
                _ => $"{intervalCount} {intervalUnit}"
            };

    private async Task ValidateAsync(ProductPlanUpsertRequest request, Guid? existingId, CancellationToken cancellationToken)
    {
        var errors = ProductPlanValidators.Validate(request).ToList();
        var product = await dbContext.Products.FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == request.ProductId, cancellationToken)
            ?? throw new InvalidOperationException("Product not found.");

        if (!product.IsSubscriptionProduct && request.BillingType == BillingType.Recurring)
        {
            errors.Add("Recurring plans are only allowed for subscription products.");
        }

        if (!product.IsActive && request.IsActive)
        {
            errors.Add("Active plans cannot be created under an inactive product.");
        }

        var duplicateCode = await dbContext.ProductPlans.AnyAsync(
            x => x.CompanyId == product.CompanyId && x.PlanCode == request.PlanCode.Trim().ToUpperInvariant() && x.Id != existingId,
            cancellationToken);
        if (duplicateCode)
        {
            errors.Add("Plan code already exists.");
        }

        var duplicateName = await dbContext.ProductPlans.AnyAsync(
            x => x.CompanyId == product.CompanyId && x.ProductId == request.ProductId && x.PlanName == request.PlanName.Trim() && x.Id != existingId,
            cancellationToken);
        if (duplicateName)
        {
            errors.Add("Plan name already exists for this product.");
        }

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(Environment.NewLine, errors));
        }
    }

    private async Task EnsureSingleDefaultAsync(ProductPlan plan, CancellationToken cancellationToken)
    {
        if (!plan.IsDefault)
        {
            return;
        }

        if (!plan.IsActive)
        {
            throw new InvalidOperationException("Inactive plans cannot be the default plan.");
        }

        var existingDefaults = await dbContext.ProductPlans
            .Where(x => x.CompanyId == plan.CompanyId && x.ProductId == plan.ProductId && x.Id != plan.Id && x.IsDefault)
            .ToListAsync(cancellationToken);

        foreach (var existingDefault in existingDefaults)
        {
            existingDefault.IsDefault = false;
        }
    }

    private IQueryable<ProductPlan> Query() =>
        dbContext.ProductPlans
            .Include(x => x.Product)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

    private static ProductPlanDto Map(ProductPlan plan, bool isInUse) =>
        new(
            plan.Id,
            plan.ProductId,
            plan.Product?.Name ?? string.Empty,
            plan.PlanName,
            plan.PlanCode,
            plan.BillingType,
            plan.IntervalUnit,
            plan.IntervalCount,
            FormatBillingLabel(plan.BillingType, plan.IntervalUnit, plan.IntervalCount),
            plan.Currency,
            plan.UnitAmount,
            plan.TrialDays,
            plan.TaxBehavior,
            plan.IsDefault,
            plan.IsActive,
            isInUse,
            plan.SortOrder,
            plan.CreatedAtUtc,
            plan.UpdatedAtUtc);

    private async Task<bool> IsInUseAsync(Guid planId, Guid companyId, CancellationToken cancellationToken) =>
        await dbContext.SubscriptionItems.AnyAsync(x => x.CompanyId == companyId && x.ProductPlanId == planId, cancellationToken);

    private static bool HasBillingTermChanges(ProductPlan existing, ProductPlanUpsertRequest request)
    {
        var requestIntervalUnit = request.BillingType == BillingType.OneTime ? IntervalUnit.None : request.IntervalUnit;
        var requestIntervalCount = request.BillingType == BillingType.OneTime ? 0 : request.IntervalCount;
        var requestTrialDays = request.BillingType == BillingType.OneTime ? 0 : request.TrialDays;

        return existing.BillingType != request.BillingType
            || existing.IntervalUnit != requestIntervalUnit
            || existing.IntervalCount != requestIntervalCount
            || existing.UnitAmount != request.UnitAmount
            || !string.Equals(existing.Currency, "MYR", StringComparison.Ordinal)
            || existing.TrialDays != requestTrialDays
            || existing.TaxBehavior != request.TaxBehavior;
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery() =>
        dbContext.Companies.Where(x => x.SubscriberId == GetSubscriberId()).Select(x => x.Id);
}
