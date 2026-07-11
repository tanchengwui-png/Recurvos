using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class CurrencyDefinition : CompanyOwnedEntity
{
    public string Code { get; set; } = "MYR";
    public string Name { get; set; } = string.Empty;
    public string Symbol { get; set; } = string.Empty;
    public int DecimalPlaces { get; set; } = 2;
    public bool IsActive { get; set; } = true;
}
