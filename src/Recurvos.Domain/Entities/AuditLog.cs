using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class AuditLog : CompanyOwnedEntity
{
    public Guid? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string? Metadata { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
}
