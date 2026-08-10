using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Api.Middleware;

/// <summary>
/// Resolves a single, membership-validated workspace for every authenticated API
/// request. Services read that value through ICurrentUserService and never trust
/// a company id supplied in a request body or query string for access control.
/// </summary>
public sealed class CompanyContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            await next(context);
            return;
        }

        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId)
            || string.Equals(context.User.FindFirstValue("platformOwner"), bool.TrueString, StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var requestedCompanyId = context.Request.Headers.TryGetValue(CompanyContextConstants.HeaderName, out var header)
            ? header.ToString()
            : context.User.FindFirstValue("companyId");

        if (!Guid.TryParse(requestedCompanyId, out var companyId))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { title = "Select a company workspace before continuing." });
            return;
        }

        var membership = await dbContext.CompanyMemberships
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.CompanyId == companyId && x.IsActive && x.Company!.IsActive)
            .Select(x => new { x.CompanyId, x.Role })
            .FirstOrDefaultAsync(context.RequestAborted);

        if (membership is null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { title = "You do not have access to the selected company workspace." });
            return;
        }

        context.Items[CompanyContextConstants.ItemKey] = membership.CompanyId;
        context.Items[CompanyContextConstants.RoleItemKey] = membership.Role.ToString();
        await next(context);
    }
}
