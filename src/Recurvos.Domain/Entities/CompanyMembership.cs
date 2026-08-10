using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class CompanyMembership : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid CompanyId { get; set; }
    public CompanyMembershipRole Role { get; set; } = CompanyMembershipRole.Viewer;
    public bool IsActive { get; set; } = true;
    public User? User { get; set; }
    public Company? Company { get; set; }
}
