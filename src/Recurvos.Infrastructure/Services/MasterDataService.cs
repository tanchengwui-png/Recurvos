using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.MasterData;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;
using System.Text.Json;

namespace Recurvos.Infrastructure.Services;

public sealed class MasterDataService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : IMasterDataService
{
    public Task InitializeDefaultsAsync(Guid companyId, CancellationToken cancellationToken = default) =>
        EnsureDefaultsAsync(companyId, cancellationToken);

    public async Task<MasterDataSnapshotDto> GetSnapshotAsync(CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);

        var warehouses = await ListWarehousesAsync(new MasterDataQueryRequest(), cancellationToken);
        var accounts = await ListAccountsAsync(new AccountQueryRequest(), cancellationToken);
        var taxCodes = await ListTaxCodesAsync(new TaxCodeQueryRequest(), cancellationToken);
        var paymentTerms = await ListPaymentTermsAsync(new MasterDataQueryRequest(), cancellationToken);
        var currencies = await ListCurrenciesAsync(new MasterDataQueryRequest(), cancellationToken);
        var productCategories = await ListProductCategoriesAsync(new MasterDataQueryRequest(), cancellationToken);
        var priceLevels = await ListPriceLevelsAsync(new MasterDataQueryRequest(), cancellationToken);

        return new MasterDataSnapshotDto(warehouses, accounts, taxCodes, paymentTerms, currencies, productCategories, priceLevels);
    }

    public async Task<IReadOnlyCollection<WarehouseDto>> ListWarehousesAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = await ResolveCompanyIdAsync(request.CompanyId, cancellationToken);
        await EnsureDefaultsAsync(companyId, cancellationToken);
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.Warehouses
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => search == null || EF.Functions.ILike(x.Code, search) || EF.Functions.ILike(x.Name, search))
            .OrderBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<WarehouseDto?> GetWarehouseAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<WarehouseDto> CreateWarehouseAsync(WarehouseUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new Warehouse { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureUniqueWarehouseCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.Warehouses.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.warehouse.created", nameof(Warehouse), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<WarehouseDto?> UpdateWarehouseAsync(Guid id, WarehouseUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.Warehouses.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureUniqueWarehouseCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.warehouse.updated", nameof(Warehouse), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeleteWarehouseAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.Warehouses.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.Warehouses.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.warehouse.deleted", nameof(Warehouse), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<AccountDto>> ListAccountsAsync(AccountQueryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var companyId = GetCompanyId();
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.Accounts
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => request.Type == null || x.Type == request.Type.Value)
            .Where(x => search == null
                || EF.Functions.ILike(x.Code, search)
                || EF.Functions.ILike(x.Name, search)
                || (x.Description != null && EF.Functions.ILike(x.Description, search)))
            .OrderBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<AccountDto?> GetAccountAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<AccountDto> CreateAccountAsync(AccountUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new Account { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureCurrencyExistsAsync(entity.CompanyId, entity.CurrencyCode, cancellationToken);
        await EnsureUniqueAccountCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.Accounts.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.account.created", nameof(Account), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<AccountDto?> UpdateAccountAsync(Guid id, AccountUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.Accounts.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureCurrencyExistsAsync(entity.CompanyId, entity.CurrencyCode, cancellationToken);
        await EnsureUniqueAccountCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.account.updated", nameof(Account), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeleteAccountAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.Accounts.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.Accounts.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.account.deleted", nameof(Account), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<TaxCodeDto>> ListTaxCodesAsync(TaxCodeQueryRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = await ResolveCompanyIdAsync(request.CompanyId, cancellationToken);
        await EnsureDefaultsAsync(companyId, cancellationToken);
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.TaxCodes
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => request.Scope == null || x.Scope == request.Scope.Value)
            .Where(x => search == null
                || EF.Functions.ILike(x.Code, search)
                || EF.Functions.ILike(x.Name, search)
                || (x.MyInvoisTaxTypeCode != null && EF.Functions.ILike(x.MyInvoisTaxTypeCode, search)))
            .OrderBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<TaxCodeDto?> GetTaxCodeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.TaxCodes
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<TaxCodeDto> CreateTaxCodeAsync(TaxCodeUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new TaxCode { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureUniqueTaxCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.TaxCodes.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.tax-code.created", nameof(TaxCode), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<TaxCodeDto?> UpdateTaxCodeAsync(Guid id, TaxCodeUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.TaxCodes.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureUniqueTaxCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.tax-code.updated", nameof(TaxCode), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeleteTaxCodeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.TaxCodes.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.TaxCodes.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.tax-code.deleted", nameof(TaxCode), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<PaymentTermDto>> ListPaymentTermsAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var companyId = GetCompanyId();
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.PaymentTerms
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => search == null || EF.Functions.ILike(x.Code, search) || EF.Functions.ILike(x.Name, search))
            .OrderBy(x => x.Days)
            .ThenBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<PaymentTermDto?> GetPaymentTermAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.PaymentTerms
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<PaymentTermDto> CreatePaymentTermAsync(PaymentTermUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new PaymentTerm { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureUniquePaymentTermCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.PaymentTerms.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.payment-term.created", nameof(PaymentTerm), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<PaymentTermDto?> UpdatePaymentTermAsync(Guid id, PaymentTermUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PaymentTerms.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureUniquePaymentTermCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.payment-term.updated", nameof(PaymentTerm), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeletePaymentTermAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PaymentTerms.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.PaymentTerms.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.payment-term.deleted", nameof(PaymentTerm), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<CurrencyDefinitionDto>> ListCurrenciesAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = await ResolveCompanyIdAsync(request.CompanyId, cancellationToken);
        await EnsureDefaultsAsync(companyId, cancellationToken);
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.CurrencyDefinitions
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => search == null
                || EF.Functions.ILike(x.Code, search)
                || EF.Functions.ILike(x.Name, search)
                || EF.Functions.ILike(x.Symbol, search))
            .OrderBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<CurrencyDefinitionDto?> GetCurrencyAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.CurrencyDefinitions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<CurrencyDefinitionDto> CreateCurrencyAsync(CurrencyDefinitionUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new CurrencyDefinition { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureUniqueCurrencyCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.CurrencyDefinitions.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.currency.created", nameof(CurrencyDefinition), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<CurrencyDefinitionDto?> UpdateCurrencyAsync(Guid id, CurrencyDefinitionUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.CurrencyDefinitions.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureUniqueCurrencyCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.currency.updated", nameof(CurrencyDefinition), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeleteCurrencyAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.CurrencyDefinitions.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.CurrencyDefinitions.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.currency.deleted", nameof(CurrencyDefinition), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<ProductCategoryDto>> ListProductCategoriesAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var companyId = GetCompanyId();
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.ProductCategories
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => search == null
                || EF.Functions.ILike(x.Code, search)
                || EF.Functions.ILike(x.Name, search)
                || (x.Description != null && EF.Functions.ILike(x.Description, search)))
            .OrderBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<ProductCategoryDto?> GetProductCategoryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.ProductCategories
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<ProductCategoryDto> CreateProductCategoryAsync(ProductCategoryUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new ProductCategory { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureUniqueProductCategoryCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.ProductCategories.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.product-category.created", nameof(ProductCategory), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<ProductCategoryDto?> UpdateProductCategoryAsync(Guid id, ProductCategoryUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.ProductCategories.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureUniqueProductCategoryCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.product-category.updated", nameof(ProductCategory), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeleteProductCategoryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.ProductCategories.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.ProductCategories.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.product-category.deleted", nameof(ProductCategory), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<PriceLevelDto>> ListPriceLevelsAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var companyId = GetCompanyId();
        var search = BuildSearchPattern(request.Search);

        var items = await dbContext.PriceLevels
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Where(x => request.IsActive == null || x.IsActive == request.IsActive.Value)
            .Where(x => search == null
                || EF.Functions.ILike(x.Code, search)
                || EF.Functions.ILike(x.Name, search)
                || (x.Description != null && EF.Functions.ILike(x.Description, search)))
            .OrderBy(x => x.Code)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<PriceLevelDto?> GetPriceLevelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var entity = await dbContext.PriceLevels
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);

        return entity is null ? null : ToDto(entity);
    }

    public async Task<PriceLevelDto> CreatePriceLevelAsync(PriceLevelUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new PriceLevel { CompanyId = GetCompanyId() };
        Apply(entity, request);
        await EnsureUniquePriceLevelCodeAsync(entity.CompanyId, entity.Code, null, cancellationToken);
        dbContext.PriceLevels.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.price-level.created", nameof(PriceLevel), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<PriceLevelDto?> UpdatePriceLevelAsync(Guid id, PriceLevelUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PriceLevels.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return null;
        Apply(entity, request);
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await EnsureUniquePriceLevelCodeAsync(entity.CompanyId, entity.Code, entity.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.price-level.updated", nameof(PriceLevel), entity.Id.ToString(), entity.Code, cancellationToken);
        return ToDto(entity);
    }

    public async Task<bool> DeletePriceLevelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PriceLevels.FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (entity is null) return false;
        dbContext.PriceLevels.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("master-data.price-level.deleted", nameof(PriceLevel), entity.Id.ToString(), entity.Code, cancellationToken);
        return true;
    }

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

    private async Task<Guid> ResolveCompanyIdAsync(Guid? requestedCompanyId, CancellationToken cancellationToken)
    {
        var currentCompanyId = GetCompanyId();
        if (!requestedCompanyId.HasValue || requestedCompanyId.Value == currentCompanyId)
        {
            return currentCompanyId;
        }

        var userId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var isAccessible = await dbContext.CompanyMemberships.AnyAsync(membership => membership.CompanyId == requestedCompanyId.Value
            && membership.UserId == userId && membership.IsActive, cancellationToken);
        if (!isAccessible)
        {
            throw new UnauthorizedAccessException();
        }

        return requestedCompanyId.Value;
    }

    private Task EnsureDefaultsAsync(CancellationToken cancellationToken) =>
        EnsureDefaultsAsync(GetCompanyId(), cancellationToken);

    private async Task EnsureDefaultsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        if (!await dbContext.Warehouses.AnyAsync(x => x.CompanyId == companyId, cancellationToken))
        {
            dbContext.Warehouses.Add(new Warehouse
            {
                CompanyId = companyId,
                Code = "MAIN",
                Name = "Main Warehouse",
                AddressJson = "{}",
                IsActive = true,
            });
        }

        if (!await dbContext.CurrencyDefinitions.AnyAsync(x => x.CompanyId == companyId, cancellationToken))
        {
            dbContext.CurrencyDefinitions.AddRange(
                new CurrencyDefinition { CompanyId = companyId, Code = "MYR", Name = "Malaysian Ringgit", Symbol = "RM", DecimalPlaces = 2, IsActive = true },
                new CurrencyDefinition { CompanyId = companyId, Code = "USD", Name = "US Dollar", Symbol = "$", DecimalPlaces = 2, IsActive = true },
                new CurrencyDefinition { CompanyId = companyId, Code = "SGD", Name = "Singapore Dollar", Symbol = "S$", DecimalPlaces = 2, IsActive = true });
        }

        if (!await dbContext.PaymentTerms.AnyAsync(x => x.CompanyId == companyId, cancellationToken))
        {
            dbContext.PaymentTerms.AddRange(
                new PaymentTerm { CompanyId = companyId, Code = "CASH", Name = "Cash", Days = 0, IsActive = true },
                new PaymentTerm { CompanyId = companyId, Code = "NET30", Name = "Net 30", Days = 30, IsActive = true });
        }

        if (!await dbContext.TaxCodes.AnyAsync(x => x.CompanyId == companyId, cancellationToken))
        {
            dbContext.TaxCodes.AddRange(
                new TaxCode { CompanyId = companyId, Code = "SST-6", Name = "SST 6%", Rate = 6m, Scope = Domain.Enums.TaxScope.Both, IsSst = true, MyInvoisTaxTypeCode = "01", IsActive = true },
                new TaxCode { CompanyId = companyId, Code = "ZERO", Name = "Zero Rated", Rate = 0m, Scope = Domain.Enums.TaxScope.Both, IsSst = false, MyInvoisTaxTypeCode = "E", IsActive = true });
        }

        if (!await dbContext.Accounts.AnyAsync(x => x.CompanyId == companyId, cancellationToken))
        {
            dbContext.Accounts.AddRange(
                new Account { CompanyId = companyId, Code = "1100", Name = "Accounts Receivable", Type = Domain.Enums.AccountType.Asset, CurrencyCode = "MYR", IsActive = true, AllowManualEntries = true },
                new Account { CompanyId = companyId, Code = "1300", Name = "Inventory", Type = Domain.Enums.AccountType.Asset, CurrencyCode = "MYR", IsActive = true, AllowManualEntries = true },
                new Account { CompanyId = companyId, Code = "2100", Name = "Accounts Payable", Type = Domain.Enums.AccountType.Liability, CurrencyCode = "MYR", IsActive = true, AllowManualEntries = true },
                new Account { CompanyId = companyId, Code = "4000", Name = "Sales Revenue", Type = Domain.Enums.AccountType.Revenue, CurrencyCode = "MYR", IsActive = true, AllowManualEntries = true },
                new Account { CompanyId = companyId, Code = "5000", Name = "Cost of Goods Sold", Type = Domain.Enums.AccountType.Expense, CurrencyCode = "MYR", IsActive = true, AllowManualEntries = true });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string? BuildSearchPattern(string? value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        return normalized is null ? null : $"%{normalized}%";
    }

    private static WarehouseDto ToDto(Warehouse entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.AddressJson, entity.IsActive, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static AccountDto ToDto(Account entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.Type, entity.CurrencyCode, entity.IsActive, entity.AllowManualEntries, entity.Description, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static TaxCodeDto ToDto(TaxCode entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.Rate, entity.Scope, entity.IsSst, entity.MyInvoisTaxTypeCode, entity.IsActive, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static PaymentTermDto ToDto(PaymentTerm entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.Days, entity.IsActive, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static CurrencyDefinitionDto ToDto(CurrencyDefinition entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.Symbol, entity.DecimalPlaces, entity.IsActive, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static ProductCategoryDto ToDto(ProductCategory entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.Description, entity.IsActive, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static PriceLevelDto ToDto(PriceLevel entity) =>
        new(entity.Id, entity.Code, entity.Name, entity.AdjustmentPercent, entity.Description, entity.IsActive, entity.CreatedAtUtc, entity.UpdatedAtUtc);

    private static void Apply(Warehouse entity, WarehouseUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Warehouse code");
        entity.Name = NormalizeRequiredText(request.Name, "Warehouse name");
        entity.AddressJson = NormalizeJsonPayload(request.AddressJson, "Warehouse address");
        entity.IsActive = request.IsActive;
    }

    private static void Apply(Account entity, AccountUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Account code");
        entity.Name = NormalizeRequiredText(request.Name, "Account name");
        entity.Type = request.Type;
        entity.CurrencyCode = NormalizeRequiredCode(request.CurrencyCode, "Account currency code");
        entity.IsActive = request.IsActive;
        entity.AllowManualEntries = request.AllowManualEntries;
        entity.Description = NormalizeOptionalText(request.Description);
    }

    private static void Apply(TaxCode entity, TaxCodeUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Tax code");
        entity.Name = NormalizeRequiredText(request.Name, "Tax code name");
        entity.Rate = request.Rate;
        entity.Scope = request.Scope;
        entity.IsSst = request.IsSst;
        var myInvoisTaxTypeCode = NormalizeOptionalCode(request.MyInvoisTaxTypeCode);
        var keepsLegacyValue = string.Equals(myInvoisTaxTypeCode, entity.MyInvoisTaxTypeCode, StringComparison.OrdinalIgnoreCase);
        if (!MyInvoisTaxTypeCatalog.IsSupported(myInvoisTaxTypeCode) && !keepsLegacyValue)
            throw new InvalidOperationException("Select a valid MyInvois tax type.");
        entity.MyInvoisTaxTypeCode = myInvoisTaxTypeCode;
        entity.IsActive = request.IsActive;
    }

    private static void Apply(PaymentTerm entity, PaymentTermUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Payment term code");
        entity.Name = NormalizeRequiredText(request.Name, "Payment term name");
        entity.Days = request.Days;
        entity.IsActive = request.IsActive;
    }

    private static void Apply(CurrencyDefinition entity, CurrencyDefinitionUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Currency code");
        entity.Name = NormalizeRequiredText(request.Name, "Currency name");
        entity.Symbol = NormalizeRequiredText(request.Symbol, "Currency symbol");
        entity.DecimalPlaces = request.DecimalPlaces;
        entity.IsActive = request.IsActive;
    }

    private static void Apply(ProductCategory entity, ProductCategoryUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Product category code");
        entity.Name = NormalizeRequiredText(request.Name, "Product category name");
        entity.Description = NormalizeOptionalText(request.Description);
        entity.IsActive = request.IsActive;
    }

    private static void Apply(PriceLevel entity, PriceLevelUpsertRequest request)
    {
        entity.Code = NormalizeRequiredCode(request.Code, "Price level code");
        entity.Name = NormalizeRequiredText(request.Name, "Price level name");
        entity.AdjustmentPercent = request.AdjustmentPercent;
        entity.Description = NormalizeOptionalText(request.Description);
        entity.IsActive = request.IsActive;
    }

    private static string NormalizeRequiredCode(string? value, string fieldName)
    {
        var normalized = value?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
            throw new InvalidOperationException($"{fieldName} is required.");
        return normalized;
    }

    private static string? NormalizeOptionalCode(string? value)
    {
        var normalized = value?.Trim().ToUpperInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string NormalizeRequiredText(string? value, string fieldName)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            throw new InvalidOperationException($"{fieldName} is required.");
        return normalized;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string NormalizeJsonPayload(string? value, string fieldName)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? "{}" : value.Trim();

        try
        {
            JsonDocument.Parse(normalized);
        }
        catch (JsonException)
        {
            throw new InvalidOperationException($"{fieldName} must be valid JSON.");
        }

        return normalized;
    }

    private async Task EnsureUniqueWarehouseCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.Warehouses.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Warehouse code already exists.");
    }

    private async Task EnsureUniqueAccountCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.Accounts.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Account code already exists.");
    }

    private async Task EnsureUniqueTaxCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.TaxCodes.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Tax code already exists.");
    }

    private async Task EnsureCurrencyExistsAsync(Guid companyId, string code, CancellationToken cancellationToken)
    {
        if (!await dbContext.CurrencyDefinitions.AnyAsync(x => x.CompanyId == companyId && x.Code == code, cancellationToken))
            throw new InvalidOperationException("Select a valid currency.");
    }

    private async Task EnsureUniquePaymentTermCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.PaymentTerms.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Payment term code already exists.");
    }

    private async Task EnsureUniqueCurrencyCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.CurrencyDefinitions.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Currency code already exists.");
    }

    private async Task EnsureUniqueProductCategoryCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.ProductCategories.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Product category code already exists.");
    }

    private async Task EnsureUniquePriceLevelCodeAsync(Guid companyId, string code, Guid? currentId, CancellationToken cancellationToken)
    {
        if (await dbContext.PriceLevels.AnyAsync(x => x.CompanyId == companyId && x.Code == code && x.Id != currentId, cancellationToken))
            throw new InvalidOperationException("Price level code already exists.");
    }
}
