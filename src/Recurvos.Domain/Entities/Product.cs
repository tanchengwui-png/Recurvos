using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class Product : CompanyOwnedEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Barcode { get; set; }
    public string? Category { get; set; }
    public string ProductGroupsJson { get; set; } = "[]";
    public string? BinLocation { get; set; }
    public string? ImagePath { get; set; }
    public bool TrackInventory { get; set; }
    public Guid? InventoryAccountId { get; set; }
    public string InventoryAccount { get; set; } = string.Empty;
    public decimal? ReorderLevel { get; set; }
    public decimal? OpeningQuantity { get; set; }
    public decimal? OpeningCost { get; set; }
    public bool IsSelling { get; set; } = true;
    public decimal? SalesPrice { get; set; }
    public Guid? SalesTaxCodeId { get; set; }
    public string SalesTaxCode { get; set; } = string.Empty;
    public Guid? IncomeAccountId { get; set; }
    public string IncomeAccount { get; set; } = string.Empty;
    public string? SalesDescription { get; set; }
    public bool IsBuying { get; set; }
    public decimal? PurchasePrice { get; set; }
    public Guid? PurchaseTaxCodeId { get; set; }
    public string PurchaseTaxCode { get; set; } = string.Empty;
    public Guid? ExpenseAccountId { get; set; }
    public string ExpenseAccount { get; set; } = string.Empty;
    public Guid? PreferredSupplierId { get; set; }
    public string PreferredSupplierName { get; set; } = string.Empty;
    public string? PurchaseDescription { get; set; }
    public string BaseUnitLabel { get; set; } = "Unit";
    public bool HasMultipleUoms { get; set; }
    public string UomConversionsJson { get; set; } = "[]";
    public bool HasCustomSalesPrices { get; set; }
    public string CustomSalesPricesJson { get; set; } = "[]";
    public bool HasCustomPurchasePrices { get; set; }
    public string CustomPurchasePricesJson { get; set; } = "[]";
    public bool IsSubscriptionProduct { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public Company? Company { get; set; }
    public ICollection<ProductPlan> Plans { get; set; } = new List<ProductPlan>();
}
