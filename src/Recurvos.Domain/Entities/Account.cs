using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class Account : CompanyOwnedEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public AccountType Type { get; set; } = AccountType.Asset;
    public string CurrencyCode { get; set; } = "MYR";
    public bool IsActive { get; set; } = true;
    public bool AllowManualEntries { get; set; } = true;
    public string? Description { get; set; }
}
