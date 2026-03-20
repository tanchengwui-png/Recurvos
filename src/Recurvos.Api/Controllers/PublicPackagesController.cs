using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Recurvos.Application.Platform;

namespace Recurvos.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/packages")]
[EnableRateLimiting("public-read")]
public sealed class PublicPackagesController(IPlatformService platformService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PlatformPackageDto>>> GetPackages(CancellationToken cancellationToken) =>
        Ok(await platformService.GetPackagesAsync(cancellationToken: cancellationToken));
}
