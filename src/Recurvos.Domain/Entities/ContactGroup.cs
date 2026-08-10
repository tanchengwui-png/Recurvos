using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class ContactGroup : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Guid SubscriberId { get; set; }
    public string Name { get; set; } = string.Empty;
}
