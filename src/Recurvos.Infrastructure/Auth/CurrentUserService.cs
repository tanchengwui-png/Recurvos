using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Recurvos.Application.Abstractions;

namespace Recurvos.Infrastructure.Auth;

public sealed class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    public Guid? UserId => ParseClaim(ClaimTypes.NameIdentifier);
    // The middleware places a membership-validated value here. The token claim is
    // only the safe default workspace used when no explicit selection is sent.
    public Guid? CompanyId => httpContextAccessor.HttpContext?.Items.TryGetValue(CompanyContextConstants.ItemKey, out var companyId) == true
        && companyId is Guid parsedCompanyId
            ? parsedCompanyId
            : ParseClaim("companyId");
    public string? Email => httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Email);
    public string? Role => httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Role);
    public bool IsPlatformOwner => string.Equals(httpContextAccessor.HttpContext?.User.FindFirstValue("platformOwner"), bool.TrueString, StringComparison.OrdinalIgnoreCase);

    private Guid? ParseClaim(string type)
    {
        var value = httpContextAccessor.HttpContext?.User.FindFirstValue(type);
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }
}
