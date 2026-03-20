using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Recurvos.Application.Auth;

namespace Recurvos.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAuthService authService) : ControllerBase
{
    [HttpPost("register")]
    [EnableRateLimiting("auth-register")]
    public async Task<ActionResult<RegisterResult>> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await authService.RegisterAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("verify-email")]
    [EnableRateLimiting("auth-verify")]
    public async Task<ActionResult<AuthResponse>> VerifyEmail(VerifyEmailRequest request, CancellationToken cancellationToken)
        => Ok(await authService.VerifyEmailAsync(request, cancellationToken));

    [HttpPost("resend-verification")]
    [EnableRateLimiting("auth-verify")]
    public async Task<IActionResult> ResendVerification(ResendVerificationRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await authService.ResendVerificationAsync(request, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("forgot-password")]
    [EnableRateLimiting("auth-reset")]
    public async Task<IActionResult> ForgotPassword(RequestPasswordResetRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await authService.RequestPasswordResetAsync(request, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("reset-password")]
    [EnableRateLimiting("auth-reset")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        await authService.ResetPasswordAsync(request, cancellationToken);
        return NoContent();
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth-login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
        => Ok(await authService.LoginAsync(request, cancellationToken));

    [HttpPost("refresh")]
    [EnableRateLimiting("auth-refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest request, CancellationToken cancellationToken)
        => Ok(await authService.RefreshAsync(request, cancellationToken));
}
