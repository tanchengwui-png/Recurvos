using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class DunningRule : CompanyOwnedEntity
{
    public string Name { get; set; } = string.Empty;
    public int OffsetDays { get; set; }
    public bool IsActive { get; set; } = true;
}
