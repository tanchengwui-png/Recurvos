namespace Recurvos.Domain.Common;

public abstract class CompanyOwnedEntity : BaseEntity
{
    public Guid CompanyId { get; set; }
}
