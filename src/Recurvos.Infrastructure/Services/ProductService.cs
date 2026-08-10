using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Common;
using Recurvos.Application.Platform;
using Recurvos.Application.Products;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class ProductService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IPackageLimitService packageLimitService,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : IProductService
{
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<PagedResult<ProductListItemDto>> GetAsync(ProductListQuery query, CancellationToken cancellationToken = default)
    {
        var products = dbContext.Products
            .Include(x => x.Company)
            .Include(x => x.Plans)
            .Where(x => OwnedCompanyIdsQuery().Contains(x.CompanyId));

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            products = products.Where(x => x.Name.Contains(term) || x.Code.Contains(term) || (x.Barcode != null && x.Barcode.Contains(term)));
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
        await ValidateRequestAsync(request, null, cancellationToken);
        var companyId = request.CompanyId!.Value;
        await EnsureCompanyAccessAsync(companyId, cancellationToken);
        await packageLimitService.EnsureCanCreateProductAsync(cancellationToken);

        var normalizedProductGroups = NormalizeStringList(request.ProductGroups);
        await EnsureProductGroupsExistAsync(normalizedProductGroups, cancellationToken);
        var normalizedUomConversions = NormalizeUomConversions(
            request.UomConversions,
            request.BaseUnitLabel,
            request.IsSelling,
            request.SalesPrice,
            request.IsBuying,
            request.PurchasePrice);
        var normalizedCustomSalesPrices = NormalizeCustomPrices(request.CustomSalesPrices);
        var normalizedCustomPurchasePrices = NormalizeCustomPrices(request.CustomPurchasePrices);
        await ValidateCustomPriceReferencesAsync(companyId, request.BaseUnitLabel, normalizedUomConversions, normalizedCustomSalesPrices, cancellationToken);
        await ValidateCustomPriceReferencesAsync(companyId, request.BaseUnitLabel, normalizedUomConversions, normalizedCustomPurchasePrices, cancellationToken);
        var inventoryAccount = await ResolveAccountSelectionAsync(request.TrackInventory ? request.InventoryAccountId : null, request.TrackInventory ? request.InventoryAccount : string.Empty, AccountType.Asset, "Inventory account", cancellationToken);
        var incomeAccount = await ResolveAccountSelectionAsync(request.IsSelling ? request.IncomeAccountId : null, request.IsSelling ? request.IncomeAccount : string.Empty, AccountType.Revenue, "Income account", cancellationToken);
        var expenseAccount = await ResolveAccountSelectionAsync(request.IsBuying ? request.ExpenseAccountId : null, request.IsBuying ? request.ExpenseAccount : string.Empty, AccountType.Expense, "Expense account", cancellationToken);
        var salesTaxCode = await ResolveTaxCodeAsync(request.IsSelling ? request.SalesTaxCodeId : null, request.IsSelling ? request.SalesTaxCode : string.Empty, TaxScope.Sales, "Sales tax", cancellationToken);
        var purchaseTaxCode = await ResolveTaxCodeAsync(request.IsBuying ? request.PurchaseTaxCodeId : null, request.IsBuying ? request.PurchaseTaxCode : string.Empty, TaxScope.Purchase, "Purchase tax", cancellationToken);
        var preferredSupplier = await ResolvePreferredSupplierAsync(request.IsBuying ? request.PreferredSupplierId : null, cancellationToken);

        var product = new Product
        {
            CompanyId = companyId,
            Name = request.Name.Trim(),
            Code = request.Code.Trim().ToUpperInvariant(),
            Description = NormalizeOptional(request.Description),
            Barcode = NormalizeOptional(request.Barcode),
            Category = NormalizeOptional(request.Category),
            ProductGroupsJson = SerializeList(normalizedProductGroups),
            BinLocation = NormalizeOptional(request.BinLocation),
            TrackInventory = request.TrackInventory,
            InventoryAccountId = inventoryAccount.AccountId,
            InventoryAccount = inventoryAccount.AccountCode,
            ReorderLevel = request.TrackInventory ? request.ReorderLevel : null,
            OpeningQuantity = request.TrackInventory ? request.OpeningQuantity : null,
            OpeningCost = request.TrackInventory ? request.OpeningCost : null,
            IsSelling = request.IsSelling,
            SalesPrice = request.IsSelling ? request.SalesPrice : null,
            SalesTaxCodeId = salesTaxCode.TaxCodeId,
            SalesTaxCode = salesTaxCode.TaxCodeCode,
            IncomeAccountId = incomeAccount.AccountId,
            IncomeAccount = incomeAccount.AccountCode,
            SalesDescription = request.IsSelling ? NormalizeOptional(request.SalesDescription) : null,
            IsBuying = request.IsBuying,
            PurchasePrice = request.IsBuying ? request.PurchasePrice : null,
            PurchaseTaxCodeId = purchaseTaxCode.TaxCodeId,
            PurchaseTaxCode = purchaseTaxCode.TaxCodeCode,
            ExpenseAccountId = expenseAccount.AccountId,
            ExpenseAccount = expenseAccount.AccountCode,
            PreferredSupplierId = preferredSupplier.SupplierId,
            PreferredSupplierName = preferredSupplier.SupplierName,
            PurchaseDescription = request.IsBuying ? NormalizeOptional(request.PurchaseDescription) : null,
            BaseUnitLabel = request.BaseUnitLabel.Trim(),
            HasMultipleUoms = request.HasMultipleUoms,
            UomConversionsJson = SerializeList(request.HasMultipleUoms ? normalizedUomConversions : Array.Empty<ProductUomConversionDto>()),
            HasCustomSalesPrices = request.HasCustomSalesPrices,
            CustomSalesPricesJson = SerializeList(request.HasCustomSalesPrices ? normalizedCustomSalesPrices : Array.Empty<ProductCustomPriceDto>()),
            HasCustomPurchasePrices = request.HasCustomPurchasePrices,
            CustomPurchasePricesJson = SerializeList(request.HasCustomPurchasePrices ? normalizedCustomPurchasePrices : Array.Empty<ProductCustomPriceDto>()),
            IsSubscriptionProduct = request.IsSubscriptionProduct,
            IsActive = request.IsActive,
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

        await ValidateRequestAsync(request, id, cancellationToken);
        if (product.CompanyId != request.CompanyId)
        {
            throw new InvalidOperationException("Product company cannot be changed.");
        }

        var normalizedProductGroups = NormalizeStringList(request.ProductGroups);
        await EnsureProductGroupsExistAsync(normalizedProductGroups, cancellationToken);
        var normalizedUomConversions = NormalizeUomConversions(
            request.UomConversions,
            request.BaseUnitLabel,
            request.IsSelling,
            request.SalesPrice,
            request.IsBuying,
            request.PurchasePrice);
        var normalizedCustomSalesPrices = NormalizeCustomPrices(request.CustomSalesPrices);
        var normalizedCustomPurchasePrices = NormalizeCustomPrices(request.CustomPurchasePrices);
        await ValidateCustomPriceReferencesAsync(product.CompanyId, request.BaseUnitLabel, normalizedUomConversions, normalizedCustomSalesPrices, cancellationToken);
        await ValidateCustomPriceReferencesAsync(product.CompanyId, request.BaseUnitLabel, normalizedUomConversions, normalizedCustomPurchasePrices, cancellationToken);
        var inventoryAccount = await ResolveAccountSelectionAsync(request.TrackInventory ? request.InventoryAccountId : null, request.TrackInventory ? request.InventoryAccount : string.Empty, AccountType.Asset, "Inventory account", cancellationToken);
        var incomeAccount = await ResolveAccountSelectionAsync(request.IsSelling ? request.IncomeAccountId : null, request.IsSelling ? request.IncomeAccount : string.Empty, AccountType.Revenue, "Income account", cancellationToken);
        var expenseAccount = await ResolveAccountSelectionAsync(request.IsBuying ? request.ExpenseAccountId : null, request.IsBuying ? request.ExpenseAccount : string.Empty, AccountType.Expense, "Expense account", cancellationToken);
        var salesTaxCode = await ResolveTaxCodeAsync(request.IsSelling ? request.SalesTaxCodeId : null, request.IsSelling ? request.SalesTaxCode : string.Empty, TaxScope.Sales, "Sales tax", cancellationToken);
        var purchaseTaxCode = await ResolveTaxCodeAsync(request.IsBuying ? request.PurchaseTaxCodeId : null, request.IsBuying ? request.PurchaseTaxCode : string.Empty, TaxScope.Purchase, "Purchase tax", cancellationToken);
        var preferredSupplier = await ResolvePreferredSupplierAsync(request.IsBuying ? request.PreferredSupplierId : null, cancellationToken);

        product.Name = request.Name.Trim();
        product.Code = request.Code.Trim().ToUpperInvariant();
        product.Description = NormalizeOptional(request.Description);
        product.Barcode = NormalizeOptional(request.Barcode);
        product.Category = NormalizeOptional(request.Category);
        product.ProductGroupsJson = SerializeList(normalizedProductGroups);
        product.BinLocation = NormalizeOptional(request.BinLocation);
        product.TrackInventory = request.TrackInventory;
        product.InventoryAccountId = inventoryAccount.AccountId;
        product.InventoryAccount = inventoryAccount.AccountCode;
        product.ReorderLevel = request.TrackInventory ? request.ReorderLevel : null;
        product.OpeningQuantity = request.TrackInventory ? request.OpeningQuantity : null;
        product.OpeningCost = request.TrackInventory ? request.OpeningCost : null;
        product.IsSelling = request.IsSelling;
        product.SalesPrice = request.IsSelling ? request.SalesPrice : null;
        product.SalesTaxCodeId = salesTaxCode.TaxCodeId;
        product.SalesTaxCode = salesTaxCode.TaxCodeCode;
        product.IncomeAccountId = incomeAccount.AccountId;
        product.IncomeAccount = incomeAccount.AccountCode;
        product.SalesDescription = request.IsSelling ? NormalizeOptional(request.SalesDescription) : null;
        product.IsBuying = request.IsBuying;
        product.PurchasePrice = request.IsBuying ? request.PurchasePrice : null;
        product.PurchaseTaxCodeId = purchaseTaxCode.TaxCodeId;
        product.PurchaseTaxCode = purchaseTaxCode.TaxCodeCode;
        product.ExpenseAccountId = expenseAccount.AccountId;
        product.ExpenseAccount = expenseAccount.AccountCode;
        product.PreferredSupplierId = preferredSupplier.SupplierId;
        product.PreferredSupplierName = preferredSupplier.SupplierName;
        product.PurchaseDescription = request.IsBuying ? NormalizeOptional(request.PurchaseDescription) : null;
        product.BaseUnitLabel = request.BaseUnitLabel.Trim();
        product.HasMultipleUoms = request.HasMultipleUoms;
        product.UomConversionsJson = SerializeList(request.HasMultipleUoms ? normalizedUomConversions : Array.Empty<ProductUomConversionDto>());
        product.HasCustomSalesPrices = request.HasCustomSalesPrices;
        product.CustomSalesPricesJson = SerializeList(request.HasCustomSalesPrices ? normalizedCustomSalesPrices : Array.Empty<ProductCustomPriceDto>());
        product.HasCustomPurchasePrices = request.HasCustomPurchasePrices;
        product.CustomPurchasePricesJson = SerializeList(request.HasCustomPurchasePrices ? normalizedCustomPurchasePrices : Array.Empty<ProductCustomPriceDto>());
        product.IsSubscriptionProduct = request.IsSubscriptionProduct;
        product.IsActive = request.IsActive;
        product.UpdatedAtUtc = DateTime.UtcNow;

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
        product.UpdatedAtUtc = DateTime.UtcNow;
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

    public async Task<ProductBatchUpdateResult> BatchUpdateAsync(ProductBatchUpdateRequest request, CancellationToken cancellationToken = default)
    {
        var fields = request.Fields.Where(field => !string.IsNullOrWhiteSpace(field)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var ids = request.ProductIds.Distinct().ToArray();
        if (ids.Length == 0 || fields.Count == 0) throw new InvalidOperationException("Select at least one product and one field to update.");
        var products = await dbContext.Products.Include(x => x.Plans).Where(x => ids.Contains(x.Id) && OwnedCompanyIdsQuery().Contains(x.CompanyId)).ToListAsync(cancellationToken);
        var groups = NormalizeStringList(request.Values.ProductGroups);
        if (fields.Contains("ProductGroups")) await EnsureProductGroupsExistAsync(groups, cancellationToken);
        foreach (var product in products)
        {
            if (fields.Contains("Name")) product.Name = request.Values.Name.Trim();
            if (fields.Contains("Code")) product.Code = request.Values.Code.Trim().ToUpperInvariant();
            if (fields.Contains("Description")) product.Description = NormalizeOptional(request.Values.Description);
            if (fields.Contains("Barcode")) product.Barcode = NormalizeOptional(request.Values.Barcode);
            if (fields.Contains("Category")) product.Category = NormalizeOptional(request.Values.Category);
            if (fields.Contains("BinLocation")) product.BinLocation = NormalizeOptional(request.Values.BinLocation);
            if (fields.Contains("TrackInventory")) product.TrackInventory = request.Values.TrackInventory;
            if (fields.Contains("ReorderLevel")) product.ReorderLevel = request.Values.ReorderLevel;
            if (fields.Contains("OpeningQuantity")) product.OpeningQuantity = request.Values.OpeningQuantity;
            if (fields.Contains("OpeningCost")) product.OpeningCost = request.Values.OpeningCost;
            if (fields.Contains("IsSelling")) product.IsSelling = request.Values.IsSelling;
            if (fields.Contains("SalesPrice")) product.SalesPrice = request.Values.SalesPrice;
            if (fields.Contains("SalesDescription")) product.SalesDescription = NormalizeOptional(request.Values.SalesDescription);
            if (fields.Contains("IsBuying")) product.IsBuying = request.Values.IsBuying;
            if (fields.Contains("PurchasePrice")) product.PurchasePrice = request.Values.PurchasePrice;
            if (fields.Contains("PurchaseDescription")) product.PurchaseDescription = NormalizeOptional(request.Values.PurchaseDescription);
            if (fields.Contains("BaseUnitLabel")) product.BaseUnitLabel = request.Values.BaseUnitLabel.Trim();
            if (fields.Contains("IsSubscriptionProduct")) product.IsSubscriptionProduct = request.Values.IsSubscriptionProduct;
            if (fields.Contains("IsActive")) { product.IsActive = request.Values.IsActive; if (!product.IsActive) foreach (var plan in product.Plans) plan.IsActive = false; }
            if (fields.Contains("ProductGroups"))
            {
                var current = DeserializeList<string>(product.ProductGroupsJson);
                var next = request.ProductGroupsMode.Equals("Append", StringComparison.OrdinalIgnoreCase) ? current.Concat(groups) : request.ProductGroupsMode.Equals("Remove", StringComparison.OrdinalIgnoreCase) ? current.Where(value => !groups.Contains(value, StringComparer.OrdinalIgnoreCase)) : groups;
                product.ProductGroupsJson = SerializeList(NormalizeStringList(next));
            }
            product.UpdatedAtUtc = DateTime.UtcNow;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        foreach (var product in products) await auditService.WriteAsync("product.batch-updated", nameof(Product), product.Id.ToString(), string.Join(", ", fields), cancellationToken);
        var failed = ids.Except(products.Select(product => product.Id)).ToArray();
        return new ProductBatchUpdateResult(ids.Length, products.Count, failed.Length, failed, fields.OrderBy(x => x).ToArray());
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

        if (!string.IsNullOrWhiteSpace(product.ImagePath) && File.Exists(product.ImagePath))
        {
            File.Delete(product.ImagePath);
        }

        dbContext.Products.Remove(product);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("product.deleted", nameof(Product), product.Id.ToString(), product.Name, cancellationToken);
        return true;
    }

    public async Task<ProductImageFile?> GetImageAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (product is null || string.IsNullOrWhiteSpace(product.ImagePath) || !File.Exists(product.ImagePath))
        {
            return null;
        }

        var content = await File.ReadAllBytesAsync(product.ImagePath, cancellationToken);
        var extension = Path.GetExtension(product.ImagePath).ToLowerInvariant();
        var contentType = extension switch
        {
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "application/octet-stream",
        };

        return new ProductImageFile(Path.GetFileName(product.ImagePath), content, contentType);
    }

    public async Task<ProductDetailsDto?> UploadImageAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products
            .Include(x => x.Company)
            .Include(x => x.Plans)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (product is null)
        {
            return null;
        }

        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension) || !new[] { ".png", ".jpg", ".jpeg", ".webp" }.Contains(extension, StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Product image must be a PNG, JPG, JPEG, or WEBP image.");
        }

        var policy = await ResolveUploadPolicyAsync(cancellationToken);
        if (content.CanSeek && content.Length > policy.UploadMaxBytes)
        {
            throw new InvalidOperationException($"Product image must be {(policy.UploadMaxBytes / 1_000_000d):0.#} MB or smaller.");
        }

        var imageRoot = StoragePathResolver.Resolve(_environment, _storageOptions.ProductImageDirectory);
        Directory.CreateDirectory(imageRoot);
        var productDirectory = Path.Combine(imageRoot, product.Id.ToString("N"));
        Directory.CreateDirectory(productDirectory);

        foreach (var existing in Directory.GetFiles(productDirectory))
        {
            File.Delete(existing);
        }

        var filePath = Path.Combine(productDirectory, $"image{extension.ToLowerInvariant()}");
        await using var fileStream = File.Create(filePath);
        await content.CopyToAsync(fileStream, cancellationToken);

        product.ImagePath = filePath.Replace("\\", "/");
        product.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapDetails(product);
    }

    public async Task<ProductDetailsDto?> RemoveImageAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await dbContext.Products
            .Include(x => x.Company)
            .Include(x => x.Plans)
            .FirstOrDefaultAsync(x => OwnedCompanyIdsQuery().Contains(x.CompanyId) && x.Id == id, cancellationToken);
        if (product is null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(product.ImagePath) && File.Exists(product.ImagePath))
        {
            File.Delete(product.ImagePath);
            var productDirectory = Path.GetDirectoryName(product.ImagePath);
            if (!string.IsNullOrWhiteSpace(productDirectory) && Directory.Exists(productDirectory) && !Directory.EnumerateFileSystemEntries(productDirectory).Any())
            {
                Directory.Delete(productDirectory);
            }
        }

        product.ImagePath = null;
        product.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapDetails(product);
    }

    private async Task ValidateRequestAsync(ProductUpsertRequest request, Guid? existingId, CancellationToken cancellationToken)
    {
        var errors = ProductValidators.Validate(request).ToList();
        if (!request.CompanyId.HasValue || request.CompanyId == Guid.Empty)
        {
            if (errors.Count > 0)
            {
                throw new InvalidOperationException(string.Join(Environment.NewLine, errors));
            }

            throw new InvalidOperationException("Company is required.");
        }

        var companyId = request.CompanyId.Value;
        var duplicateCode = await dbContext.Products.AnyAsync(
            x => x.CompanyId == companyId && x.Code == request.Code.Trim().ToUpperInvariant() && x.Id != existingId,
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
            product.Barcode,
            product.Category,
            DeserializeList<string>(product.ProductGroupsJson),
            product.SalesPrice,
            product.PurchasePrice,
            product.IsSelling,
            product.IsBuying,
            product.BaseUnitLabel,
            product.HasMultipleUoms,
            DeserializeList<ProductUomConversionDto>(product.UomConversionsJson),
            product.HasCustomSalesPrices,
            DeserializeList<ProductCustomPriceDto>(product.CustomSalesPricesJson),
            product.HasCustomPurchasePrices,
            DeserializeList<ProductCustomPriceDto>(product.CustomPurchasePricesJson),
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
            product.Barcode,
            product.Category,
            DeserializeList<string>(product.ProductGroupsJson),
            product.BinLocation,
            !string.IsNullOrWhiteSpace(product.ImagePath),
            product.TrackInventory,
            product.InventoryAccountId,
            product.InventoryAccount,
            product.ReorderLevel,
            product.OpeningQuantity,
            product.OpeningCost,
            product.IsSelling,
            product.SalesPrice,
            product.SalesTaxCodeId,
            product.SalesTaxCode,
            product.IncomeAccountId,
            product.IncomeAccount,
            product.SalesDescription,
            product.IsBuying,
            product.PurchasePrice,
            product.PurchaseTaxCodeId,
            product.PurchaseTaxCode,
            product.ExpenseAccountId,
            product.ExpenseAccount,
            product.PreferredSupplierId,
            product.PreferredSupplierName,
            product.PurchaseDescription,
            product.BaseUnitLabel,
            product.HasMultipleUoms,
            DeserializeList<ProductUomConversionDto>(product.UomConversionsJson),
            product.HasCustomSalesPrices,
            DeserializeList<ProductCustomPriceDto>(product.CustomSalesPricesJson),
            product.HasCustomPurchasePrices,
            DeserializeList<ProductCustomPriceDto>(product.CustomPurchasePricesJson),
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

    private IQueryable<Guid> OwnedCompanyIdsQuery()
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        return dbContext.Companies.Where(x => x.Id == companyId).Select(x => x.Id);
    }

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var hasAccess = companyId == (currentUserService.CompanyId ?? throw new UnauthorizedAccessException());
        if (!hasAccess)
        {
            throw new UnauthorizedAccessException();
        }
    }

    private async Task EnsureProductGroupsExistAsync(IReadOnlyCollection<string> groupNames, CancellationToken cancellationToken)
    {
        if (groupNames.Count == 0)
        {
            return;
        }

        var activeCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var availableGroupNames = await dbContext.ProductGroups
            .Where(x => x.CompanyId == activeCompanyId)
            .Select(x => x.Name)
            .ToListAsync(cancellationToken);

        var availableGroupSet = availableGroupNames.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missingGroups = groupNames
            .Where(group => !availableGroupSet.Contains(group))
            .OrderBy(group => group, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (missingGroups.Length > 0)
        {
            throw new InvalidOperationException($"Create the selected product group{(missingGroups.Length == 1 ? string.Empty : "s")} first: {string.Join(", ", missingGroups)}.");
        }
    }

    private async Task ValidateCustomPriceReferencesAsync(
        Guid companyId,
        string baseUnitLabel,
        IReadOnlyCollection<ProductUomConversionDto> uomConversions,
        IReadOnlyCollection<ProductCustomPriceDto> values,
        CancellationToken cancellationToken)
    {
        if (values.Count == 0)
        {
            return;
        }

        var activeCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var validUoms = uomConversions
            .Select(value => value.Label)
            .Append(baseUnitLabel.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var contactIds = values
            .Where(value => value.TargetType.Equals("Contact", StringComparison.OrdinalIgnoreCase) && value.ContactId.HasValue && value.ContactId.Value != Guid.Empty)
            .Select(value => value.ContactId!.Value)
            .Distinct()
            .ToArray();
        var knownContactIds = contactIds.Length == 0
            ? new HashSet<Guid>()
            : (await dbContext.Customers
                .Where(x => x.CompanyIdsJson.Contains(activeCompanyId.ToString()) && contactIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToListAsync(cancellationToken))
                .ToHashSet();

        var validGroups = values.Any(value => value.TargetType.Equals("ContactGroup", StringComparison.OrdinalIgnoreCase))
            ? (await dbContext.ContactGroups
                .Where(x => x.CompanyId == activeCompanyId)
                .Select(x => x.Name)
                .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var validPriceLevels = values.Any(value => value.TargetType.Equals("PriceLevel", StringComparison.OrdinalIgnoreCase))
            ? (await dbContext.PriceLevels
                .Where(x => x.CompanyId == companyId && x.IsActive)
                .Select(x => x.Code)
                .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var value in values)
        {
            if (!validUoms.Contains(value.Uom))
            {
                throw new InvalidOperationException($"Custom price UOM must reference an existing UOM. Invalid value: {value.Uom}.");
            }

            if (value.TargetType.Equals("Contact", StringComparison.OrdinalIgnoreCase) && value.ContactId.HasValue && value.ContactId.Value != Guid.Empty && !knownContactIds.Contains(value.ContactId.Value))
            {
                throw new InvalidOperationException($"Custom price contact must reference an existing contact. Invalid value: {value.ContactName}.");
            }

            if (value.TargetType.Equals("ContactGroup", StringComparison.OrdinalIgnoreCase) && !validGroups.Contains(value.ContactGroup))
            {
                throw new InvalidOperationException($"Custom price contact group must reference an existing contact group. Invalid value: {value.ContactGroup}.");
            }

            if (value.TargetType.Equals("PriceLevel", StringComparison.OrdinalIgnoreCase) && !validPriceLevels.Contains(value.PriceLevel))
            {
                throw new InvalidOperationException($"Custom price price level must reference an active price level. Invalid value: {value.PriceLevel}.");
            }
        }
    }

    private async Task<(Guid? AccountId, string AccountCode)> ResolveAccountSelectionAsync(Guid? accountId, string accountCode, AccountType requiredType, string fieldName, CancellationToken cancellationToken)
    {
        if (!accountId.HasValue && string.IsNullOrWhiteSpace(accountCode))
        {
            return (null, string.Empty);
        }

        var sharedAccountCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var query = dbContext.Accounts.Where(x => x.CompanyId == sharedAccountCompanyId && x.Type == requiredType);
        Account? account;
        if (accountId.HasValue && accountId.Value != Guid.Empty)
        {
            account = await query.FirstOrDefaultAsync(x => x.Id == accountId.Value, cancellationToken);
        }
        else
        {
            account = null;
        }

        // Account codes are shared across the subscriber's companies. Prefer an ID,
        // then resolve the submitted code in the shared chart and required account type.
        if (account is null && !string.IsNullOrWhiteSpace(accountCode))
        {
            var normalizedCode = accountCode.Trim().ToUpperInvariant();
            account = await query.FirstOrDefaultAsync(x => x.Code.ToUpper() == normalizedCode, cancellationToken);
        }

        if (account is null)
        {
            throw new InvalidOperationException($"Select a valid {fieldName.ToLowerInvariant()}.");
        }

        return (account.Id, account.Code);
    }

    private async Task<(Guid? TaxCodeId, string TaxCodeCode)> ResolveTaxCodeAsync(Guid? taxCodeId, string taxCodeCode, TaxScope requiredScope, string fieldName, CancellationToken cancellationToken)
    {
        if (!taxCodeId.HasValue && string.IsNullOrWhiteSpace(taxCodeCode))
        {
            return (null, string.Empty);
        }

        var sharedMasterDataCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var query = dbContext.TaxCodes.Where(x => x.CompanyId == sharedMasterDataCompanyId && (x.Scope == requiredScope || x.Scope == TaxScope.Both));
        TaxCode? taxCode;
        if (taxCodeId.HasValue && taxCodeId.Value != Guid.Empty)
        {
            taxCode = await query.FirstOrDefaultAsync(x => x.Id == taxCodeId.Value, cancellationToken);
        }
        else
        {
            taxCode = null;
        }

        // Tax codes are shared across the subscriber's companies. Resolve a submitted
        // code in the shared master-data list if its ID is unavailable or stale.
        if (taxCode is null && !string.IsNullOrWhiteSpace(taxCodeCode))
        {
            var normalizedCode = taxCodeCode.Trim().ToUpperInvariant();
            taxCode = await query.FirstOrDefaultAsync(x => x.Code.ToUpper() == normalizedCode, cancellationToken);
        }

        if (taxCode is null)
        {
            throw new InvalidOperationException($"Select a valid {fieldName.ToLowerInvariant()}.");
        }

        return (taxCode.Id, taxCode.Code);
    }

    private async Task<(Guid? SupplierId, string SupplierName)> ResolvePreferredSupplierAsync(Guid? supplierId, CancellationToken cancellationToken)
    {
        if (!supplierId.HasValue || supplierId.Value == Guid.Empty)
        {
            return (null, string.Empty);
        }

        var activeCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var supplier = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(activeCompanyId.ToString()) && x.Id == supplierId.Value)
            .Select(x => new { x.Id, x.Name, x.ContactType })
            .FirstOrDefaultAsync(cancellationToken);

        if (supplier is null || !supplier.ContactType.Contains("Supplier", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Select a valid preferred supplier.");
        }

        return (supplier.Id, supplier.Name);
    }

    private async Task<(int UploadMaxBytes, bool AutoCompressUploads, int UploadImageMaxDimension, int UploadImageQuality)> ResolveUploadPolicyAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        return (
            Math.Min(AbsoluteUploadMaxBytes, Math.Max(200_000, settings?.UploadMaxBytes ?? 2_000_000)),
            settings?.AutoCompressUploads ?? true,
            Math.Max(600, settings?.UploadImageMaxDimension ?? 1600),
            Math.Max(50, Math.Min(95, settings?.UploadImageQuality ?? 80)));
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static IReadOnlyCollection<string> NormalizeStringList(IEnumerable<string> values) =>
        values
            .Select(value => value.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static IReadOnlyCollection<ProductUomConversionDto> NormalizeUomConversions(
        IEnumerable<ProductUomConversionDto> values,
        string baseUnitLabel,
        bool isSelling,
        decimal? salesPrice,
        bool isBuying,
        decimal? purchasePrice)
    {
        var normalizedBaseLabel = baseUnitLabel.Trim();
        var normalizedValues = values
            .Select(value => new ProductUomConversionDto(
                value.Label.Trim(),
                value.Factor,
                isSelling ? value.SalePrice : null,
                isBuying ? value.PurchasePrice : null,
                isSelling && value.IsDefaultSalesUom,
                isBuying && value.IsDefaultPurchaseUom))
            .Where(value => !string.IsNullOrWhiteSpace(value.Label))
            .ToList();

        var baseIndex = normalizedValues.FindIndex(value => value.Label.Equals(normalizedBaseLabel, StringComparison.OrdinalIgnoreCase));
        var baseConversion = new ProductUomConversionDto(
            normalizedBaseLabel,
            1m,
            isSelling ? salesPrice : null,
            isBuying ? purchasePrice : null,
            baseIndex >= 0 && normalizedValues[baseIndex].IsDefaultSalesUom,
            baseIndex >= 0 && normalizedValues[baseIndex].IsDefaultPurchaseUom);

        if (baseIndex >= 0)
        {
            normalizedValues[baseIndex] = baseConversion;
        }
        else
        {
            normalizedValues.Insert(0, baseConversion);
        }

        return normalizedValues;
    }

    private static IReadOnlyCollection<ProductCustomPriceDto> NormalizeCustomPrices(IEnumerable<ProductCustomPriceDto> values) =>
        values
            .Select(value => new ProductCustomPriceDto(
                value.TargetType.Trim(),
                value.ContactId,
                value.ContactCode.Trim(),
                value.ContactName.Trim(),
                value.ContactGroup.Trim(),
                value.PriceLevel.Trim(),
                value.DateFromUtc?.Date,
                value.DateToUtc?.Date,
                value.MinQuantity,
                value.Uom.Trim(),
                value.UnitPrice))
            .Where(value => !string.IsNullOrWhiteSpace(value.TargetType))
            .ToArray();

    private static string SerializeList<T>(IEnumerable<T> values) =>
        JsonSerializer.Serialize(values);

    private static IReadOnlyCollection<T> DeserializeList<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<T>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json) ?? new List<T>();
        }
        catch
        {
            return Array.Empty<T>();
        }
    }
}
