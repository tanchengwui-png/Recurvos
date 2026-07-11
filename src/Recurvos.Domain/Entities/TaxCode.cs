using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class TaxCode : CompanyOwnedEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Rate { get; set; }
    public TaxScope Scope { get; set; } = TaxScope.Both;
    public bool IsSst { get; set; }
    public string? MyInvoisTaxTypeCode { get; set; }
    public bool IsActive { get; set; } = true;
}
