using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Recurvos.Application.Settings;

namespace Recurvos.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/app")]
[EnableRateLimiting("public-read")]
public sealed class PublicAppController(ISettingsService settingsService) : ControllerBase
{
    [HttpGet("runtime-profile")]
    public async Task<ActionResult<PlatformRuntimeProfileDto>> GetRuntimeProfile(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetPlatformRuntimeProfileAsync(cancellationToken));
}
