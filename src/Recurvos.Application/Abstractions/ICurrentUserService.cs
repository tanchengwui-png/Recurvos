namespace Recurvos.Application.Abstractions;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    Guid? CompanyId { get; }
    string? Email { get; }
    string? Role { get; }
    bool IsPlatformOwner { get; }
}
