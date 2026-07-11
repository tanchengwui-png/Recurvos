using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class ProductCategory : CompanyOwnedEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}
