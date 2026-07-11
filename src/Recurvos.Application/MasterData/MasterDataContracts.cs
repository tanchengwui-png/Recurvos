using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.MasterData;

public sealed record MasterDataSnapshotDto(
    IReadOnlyCollection<WarehouseDto> Warehouses,
    IReadOnlyCollection<AccountDto> Accounts,
    IReadOnlyCollection<TaxCodeDto> TaxCodes,
    IReadOnlyCollection<PaymentTermDto> PaymentTerms,
    IReadOnlyCollection<CurrencyDefinitionDto> Currencies,
    IReadOnlyCollection<ProductCategoryDto> ProductCategories,
    IReadOnlyCollection<PriceLevelDto> PriceLevels);

public class MasterDataQueryRequest
{
    [MaxLength(200)]
    public string? Search { get; set; }

    public bool? IsActive { get; set; }
}

public sealed class AccountQueryRequest : MasterDataQueryRequest
{
    public AccountType? Type { get; set; }
}

public sealed class TaxCodeQueryRequest : MasterDataQueryRequest
{
    public TaxScope? Scope { get; set; }
}

public sealed class WarehouseUpsertRequest
{
    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string AddressJson { get; set; } = "{}";

    public bool IsActive { get; set; } = true;
}

public sealed record WarehouseDto(Guid Id, string Code, string Name, string AddressJson, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public sealed class AccountUpsertRequest
{
    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    public AccountType Type { get; set; } = AccountType.Asset;

    [Required, MaxLength(20)]
    public string CurrencyCode { get; set; } = "MYR";

    public bool IsActive { get; set; } = true;
    public bool AllowManualEntries { get; set; } = true;

    [MaxLength(500)]
    public string? Description { get; set; }
}

public sealed record AccountDto(Guid Id, string Code, string Name, AccountType Type, string CurrencyCode, bool IsActive, bool AllowManualEntries, string? Description, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public sealed class TaxCodeUpsertRequest
{
    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Range(typeof(decimal), "0.00", "100.00")]
    public decimal Rate { get; set; }

    [Required]
    public TaxScope Scope { get; set; } = TaxScope.Both;

    public bool IsSst { get; set; }

    [MaxLength(50)]
    public string? MyInvoisTaxTypeCode { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed record TaxCodeDto(Guid Id, string Code, string Name, decimal Rate, TaxScope Scope, bool IsSst, string? MyInvoisTaxTypeCode, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public sealed class PaymentTermUpsertRequest
{
    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 3650)]
    public int Days { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed record PaymentTermDto(Guid Id, string Code, string Name, int Days, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public sealed class CurrencyDefinitionUpsertRequest
{
    [Required, MaxLength(20)]
    public string Code { get; set; } = "MYR";

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(10)]
    public string Symbol { get; set; } = string.Empty;

    [Range(0, 6)]
    public int DecimalPlaces { get; set; } = 2;

    public bool IsActive { get; set; } = true;
}

public sealed record CurrencyDefinitionDto(Guid Id, string Code, string Name, string Symbol, int DecimalPlaces, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public sealed class ProductCategoryUpsertRequest
{
    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed record ProductCategoryDto(Guid Id, string Code, string Name, string? Description, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public sealed class PriceLevelUpsertRequest
{
    [Required, MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Range(typeof(decimal), "-100.00", "1000.00")]
    public decimal AdjustmentPercent { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed record PriceLevelDto(Guid Id, string Code, string Name, decimal AdjustmentPercent, string? Description, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public interface IMasterDataService
{
    Task<MasterDataSnapshotDto> GetSnapshotAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<WarehouseDto>> ListWarehousesAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default);
    Task<WarehouseDto?> GetWarehouseAsync(Guid id, CancellationToken cancellationToken = default);

    Task<WarehouseDto> CreateWarehouseAsync(WarehouseUpsertRequest request, CancellationToken cancellationToken = default);
    Task<WarehouseDto?> UpdateWarehouseAsync(Guid id, WarehouseUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteWarehouseAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<AccountDto>> ListAccountsAsync(AccountQueryRequest request, CancellationToken cancellationToken = default);
    Task<AccountDto?> GetAccountAsync(Guid id, CancellationToken cancellationToken = default);
    Task<AccountDto> CreateAccountAsync(AccountUpsertRequest request, CancellationToken cancellationToken = default);
    Task<AccountDto?> UpdateAccountAsync(Guid id, AccountUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAccountAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<TaxCodeDto>> ListTaxCodesAsync(TaxCodeQueryRequest request, CancellationToken cancellationToken = default);
    Task<TaxCodeDto?> GetTaxCodeAsync(Guid id, CancellationToken cancellationToken = default);
    Task<TaxCodeDto> CreateTaxCodeAsync(TaxCodeUpsertRequest request, CancellationToken cancellationToken = default);
    Task<TaxCodeDto?> UpdateTaxCodeAsync(Guid id, TaxCodeUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteTaxCodeAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<PaymentTermDto>> ListPaymentTermsAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default);
    Task<PaymentTermDto?> GetPaymentTermAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PaymentTermDto> CreatePaymentTermAsync(PaymentTermUpsertRequest request, CancellationToken cancellationToken = default);
    Task<PaymentTermDto?> UpdatePaymentTermAsync(Guid id, PaymentTermUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeletePaymentTermAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<CurrencyDefinitionDto>> ListCurrenciesAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default);
    Task<CurrencyDefinitionDto?> GetCurrencyAsync(Guid id, CancellationToken cancellationToken = default);
    Task<CurrencyDefinitionDto> CreateCurrencyAsync(CurrencyDefinitionUpsertRequest request, CancellationToken cancellationToken = default);
    Task<CurrencyDefinitionDto?> UpdateCurrencyAsync(Guid id, CurrencyDefinitionUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteCurrencyAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<ProductCategoryDto>> ListProductCategoriesAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default);
    Task<ProductCategoryDto?> GetProductCategoryAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ProductCategoryDto> CreateProductCategoryAsync(ProductCategoryUpsertRequest request, CancellationToken cancellationToken = default);
    Task<ProductCategoryDto?> UpdateProductCategoryAsync(Guid id, ProductCategoryUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteProductCategoryAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<PriceLevelDto>> ListPriceLevelsAsync(MasterDataQueryRequest request, CancellationToken cancellationToken = default);
    Task<PriceLevelDto?> GetPriceLevelAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PriceLevelDto> CreatePriceLevelAsync(PriceLevelUpsertRequest request, CancellationToken cancellationToken = default);
    Task<PriceLevelDto?> UpdatePriceLevelAsync(Guid id, PriceLevelUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeletePriceLevelAsync(Guid id, CancellationToken cancellationToken = default);
}
