using System.Text.RegularExpressions;

namespace Recurvos.Application.Products;

public static class ProductValidators
{
    private static readonly Regex CodePattern = new("^[A-Z0-9]+(?:-[A-Z0-9]+)*$", RegexOptions.Compiled);

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

        if (request.Category?.Length > 100)
        {
            errors.Add("Category must be 100 characters or fewer.");
        }

        return errors;
    }
}
