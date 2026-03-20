using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class Product : CompanyOwnedEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public bool IsSubscriptionProduct { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public Company? Company { get; set; }
    public ICollection<ProductPlan> Plans { get; set; } = new List<ProductPlan>();
}
