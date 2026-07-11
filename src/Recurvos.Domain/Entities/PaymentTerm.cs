using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PaymentTerm : CompanyOwnedEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Days { get; set; }
    public bool IsActive { get; set; } = true;
}
