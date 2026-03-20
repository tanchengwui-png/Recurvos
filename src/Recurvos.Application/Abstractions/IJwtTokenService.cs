namespace Recurvos.Application.Abstractions;

public interface IJwtTokenService
{
    string GenerateAccessToken(Guid userId, Guid companyId, string email, string role, bool isPlatformOwner);
    string GenerateRefreshToken();
}
