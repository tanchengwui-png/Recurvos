using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class ProductGroup : BaseEntity
{
    public Guid SubscriberId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
