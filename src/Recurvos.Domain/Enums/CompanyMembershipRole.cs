namespace Recurvos.Domain.Enums;

/// <summary>
/// Role granted to a user within one accounting workspace. This is deliberately
/// separate from the legacy user role, which remains available for platform and
/// backwards-compatible authorization.
/// </summary>
public enum CompanyMembershipRole
{
    Owner = 1,
    Admin = 2,
    Accountant = 3,
    Sales = 4,
    Purchasing = 5,
    Viewer = 6
}
