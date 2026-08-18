using System.Text.RegularExpressions;

namespace Recurvos.Application.Products;

public static class ProductValidators
{
    private static readonly Regex CodePattern = new("^[A-Z0-9]+(?:-[A-Z0-9]+)*$", RegexOptions.Compiled);
    private static readonly string[] AllowedCustomPriceTargetTypes = ["Contact", "ContactGroup", "PriceLevel"];

    public static IReadOnlyCollection<string> Validate(ProductUpsertRequest request)
    {
        var errors = new List<string>();
        if (!request.CompanyId.HasValue || request.CompanyId == Guid.Empty)
        {
            errors.Add("Company is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors.Add("Product name is required.");
        }
        else if (request.Name.Length > 150)
        {
            errors.Add("Product name must be 150 characters or fewer.");
        }

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            errors.Add("Product code is required.");
        }
        else if (request.Code.Length > 50)
        {
            errors.Add("Product code must be 50 characters or fewer.");
        }
        else if (!CodePattern.IsMatch(request.Code))
        {
            errors.Add("Product code must use uppercase slug style, for example STARTER or GROWTH-YEARLY.");
        }

        if (request.Description?.Length > 1000)
        {
            errors.Add("Description must be 1000 characters or fewer.");
        }

        if (request.Barcode?.Length > 100)
        {
            errors.Add("Barcode must be 100 characters or fewer.");
        }

        if (request.Category?.Length > 100)
        {
            errors.Add("Category must be 100 characters or fewer.");
        }

        if (request.ProductGroups.Any(group => group.Length > 150))
        {
            errors.Add("Each product group must be 150 characters or fewer.");
        }

        if (request.BinLocation?.Length > 100)
        {
            errors.Add("Bin location must be 100 characters or fewer.");
        }

        if (request.TrackInventory && string.IsNullOrWhiteSpace(request.InventoryAccount))
        {
            errors.Add("Inventory account is required when Track Inventory is enabled.");
        }

        if (request.TrackInventory && request.ReorderLevel is < 0)
        {
            errors.Add("Reorder level must be zero or more.");
        }

        if (request.TrackInventory && request.OpeningQuantity is < 0)
        {
            errors.Add("Opening quantity must be zero or more.");
        }

        if (request.TrackInventory && request.OpeningCost is < 0)
        {
            errors.Add("Opening cost must be zero or more.");
        }

        if (request.IsSelling && request.SalesPrice is < 0)
        {
            errors.Add("Sales price must be zero or more.");
        }

        if (request.IsSelling && string.IsNullOrWhiteSpace(request.IncomeAccount))
        {
            errors.Add("Income account is required when selling is enabled.");
        }

        if (!string.IsNullOrWhiteSpace(request.SalesDescription) && request.SalesDescription.Length > 2000)
        {
            errors.Add("Sales description must be 2000 characters or fewer.");
        }

        if (request.IsBuying && request.PurchasePrice is < 0)
        {
            errors.Add("Purchase price must be zero or more.");
        }

        if (request.IsBuying && string.IsNullOrWhiteSpace(request.ExpenseAccount))
        {
            errors.Add("Expense account is required when buying is enabled.");
        }

        if (!string.IsNullOrWhiteSpace(request.PurchaseDescription) && request.PurchaseDescription.Length > 2000)
        {
            errors.Add("Purchase description must be 2000 characters or fewer.");
        }

        if (string.IsNullOrWhiteSpace(request.BaseUnitLabel))
        {
            errors.Add("Base unit label is required.");
        }
        else if (request.BaseUnitLabel.Length > 50)
        {
            errors.Add("Base unit label must be 50 characters or fewer.");
        }

        if (request.HasMultipleUoms)
        {
            var normalizedLabels = request.UomConversions
                .Select(conversion => conversion.Label.Trim())
                .Where(label => !string.IsNullOrWhiteSpace(label))
                .ToList();

            if (request.UomConversions.Any(conversion => string.IsNullOrWhiteSpace(conversion.Label)))
            {
                errors.Add("Each unit of measurement needs a label.");
            }

            if (request.UomConversions.Any(conversion => conversion.Label.Trim().Length > 50))
            {
                errors.Add("Each unit label must be 50 characters or fewer.");
            }

            if (request.UomConversions.Any(conversion => conversion.Factor <= 0))
            {
                errors.Add("Each unit conversion rate must be greater than zero.");
            }

            if (request.UomConversions.Any(conversion => conversion.SalePrice is < 0))
            {
                errors.Add("Each unit sale price must be zero or more.");
            }

            if (request.UomConversions.Any(conversion => conversion.PurchasePrice is < 0))
            {
                errors.Add("Each unit purchase price must be zero or more.");
            }

            if (normalizedLabels.Count != normalizedLabels.Distinct(StringComparer.OrdinalIgnoreCase).Count())
            {
                errors.Add("Each unit label must be unique within the product.");
            }

            if (request.UomConversions.Count(conversion => conversion.IsDefaultSalesUom) > 1)
            {
                errors.Add("Only one default sales UOM can be selected.");
            }

            if (request.UomConversions.Count(conversion => conversion.IsDefaultPurchaseUom) > 1)
            {
                errors.Add("Only one default purchase UOM can be selected.");
            }
        }

        ValidateCustomPrices(
            true,
            request.CustomSalesPrices,
            "sales",
            errors);

        ValidateCustomPrices(
            true,
            request.CustomPurchasePrices,
            "purchase",
            errors);

        return errors;
    }

    private static void ValidateCustomPrices(
        bool enabled,
        IReadOnlyCollection<ProductCustomPriceDto> values,
        string label,
        ICollection<string> errors)
    {
        if (!enabled)
        {
            return;
        }

        var normalizedRows = values.Select(value => new
        {
            TargetType = value.TargetType.Trim(),
            ContactCode = value.ContactCode.Trim(),
            ContactName = value.ContactName.Trim(),
            ContactGroup = value.ContactGroup.Trim(),
            PriceLevel = value.PriceLevel.Trim(),
            Uom = value.Uom.Trim(),
            value.DateFromUtc,
            value.DateToUtc,
            value.MinQuantity,
            value.UnitPrice,
        }).ToList();

        if (normalizedRows.Any(row => !AllowedCustomPriceTargetTypes.Contains(row.TargetType, StringComparer.OrdinalIgnoreCase)))
        {
            errors.Add($"Each custom {label} price must use Contact, ContactGroup, or PriceLevel as the target type.");
        }

        if (normalizedRows.Any(row => row.TargetType.Equals("Contact", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(row.ContactName)))
        {
            errors.Add($"Each contact-based {label} price must include a contact or supplier.");
        }

        if (normalizedRows.Any(row => row.TargetType.Equals("ContactGroup", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(row.ContactGroup)))
        {
            errors.Add($"Each contact-group {label} price must include a contact group.");
        }

        if (normalizedRows.Any(row => row.TargetType.Equals("PriceLevel", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(row.PriceLevel)))
        {
            errors.Add($"Each price-level {label} price must include a price level.");
        }

        if (normalizedRows.Any(row => row.ContactCode.Length > 100 || row.ContactName.Length > 200 || row.ContactGroup.Length > 150 || row.PriceLevel.Length > 100 || row.Uom.Length > 50))
        {
            errors.Add($"Each custom {label} price contains a value that exceeds the supported length.");
        }

        if (normalizedRows.Any(row => string.IsNullOrWhiteSpace(row.Uom)))
        {
            errors.Add($"Each custom {label} price must include a UOM.");
        }

        if (normalizedRows.Any(row => row.MinQuantity is <= 0))
        {
            errors.Add($"Each custom {label} price minimum quantity must be greater than zero when provided.");
        }

        if (normalizedRows.Any(row => row.UnitPrice <= 0))
        {
            errors.Add($"Each custom {label} price unit price must be greater than zero.");
        }

        if (normalizedRows.Any(row => row.DateFromUtc.HasValue && row.DateToUtc.HasValue && row.DateFromUtc.Value.Date > row.DateToUtc.Value.Date))
        {
            errors.Add($"Each custom {label} price date range must have Date From on or before Date To.");
        }

        var duplicateCount = normalizedRows
            .GroupBy(row => string.Join("|",
                row.TargetType.ToUpperInvariant(),
                row.ContactCode.ToUpperInvariant(),
                row.ContactName.ToUpperInvariant(),
                row.ContactGroup.ToUpperInvariant(),
                row.PriceLevel.ToUpperInvariant(),
                row.DateFromUtc?.Date.ToString("yyyy-MM-dd") ?? string.Empty,
                row.DateToUtc?.Date.ToString("yyyy-MM-dd") ?? string.Empty,
                row.MinQuantity?.ToString("0.####") ?? string.Empty,
                row.Uom.ToUpperInvariant()))
            .Any(group => group.Count() > 1);

        if (duplicateCount)
        {
            errors.Add($"Duplicate custom {label} price rows are not allowed.");
        }
    }
}
