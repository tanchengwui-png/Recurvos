using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Recurvos.Application.Abstractions;

namespace Recurvos.Infrastructure.Auth;

public sealed class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    public Guid? UserId => ParseClaim(ClaimTypes.NameIdentifier);
    public Guid? CompanyId => ParseClaim("companyId");
    public string? Email => httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Email);
    public string? Role => httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Role);
    public bool IsPlatformOwner => string.Equals(httpContextAccessor.HttpContext?.User.FindFirstValue("platformOwner"), bool.TrueString, StringComparison.OrdinalIgnoreCase);

    private Guid? ParseClaim(string type)
    {
        var value = httpContextAccessor.HttpContext?.User.FindFirstValue(type);
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }
}
