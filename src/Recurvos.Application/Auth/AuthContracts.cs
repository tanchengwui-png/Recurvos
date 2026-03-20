using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Auth;

public sealed class RegisterRequest
{
    [MaxLength(200)]
    public string Website { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string PackageCode { get; set; } = "starter";

    [Required, MaxLength(200)]
    public string CompanyName { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string RegistrationNumber { get; set; } = string.Empty;

    [Required, MaxLength(200), EmailAddress]
    public string CompanyEmail { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string FullName { get; set; } = string.Empty;

    [Required, MaxLength(200), EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8)]
    public string Password { get; set; } = string.Empty;

    [Range(typeof(bool), "true", "true", ErrorMessage = "You must agree to the Terms of Service and Privacy Policy.")]
    public bool AcceptLegalTerms { get; set; }
}

public sealed class VerifyEmailRequest
{
    [Required]
    public string Token { get; set; } = string.Empty;
}

public sealed class ResendVerificationRequest
{
    [Required, MaxLength(200), EmailAddress]
    public string Email { get; set; } = string.Empty;
}

public sealed class RequestPasswordResetRequest
{
    [Required, MaxLength(200), EmailAddress]
    public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    [Required]
    public string Token { get; set; } = string.Empty;

    [Required, MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;
}

public sealed class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public sealed class RefreshRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}

public sealed record RegisterResult(bool RequiresEmailVerification, string Email, string Message);
public sealed record AuthResponse(string AccessToken, string RefreshToken, Guid UserId, Guid CompanyId, string CompanyName, string Email, string FullName, string Role, bool IsPlatformOwner);

public interface IAuthService
{
    Task<RegisterResult> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default);
    Task<AuthResponse> VerifyEmailAsync(VerifyEmailRequest request, CancellationToken cancellationToken = default);
    Task ResendVerificationAsync(ResendVerificationRequest request, CancellationToken cancellationToken = default);
    Task RequestPasswordResetAsync(RequestPasswordResetRequest request, CancellationToken cancellationToken = default);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);
    Task<AuthResponse> RefreshAsync(RefreshRequest request, CancellationToken cancellationToken = default);
}

public interface IRegistrationGuardService
{
    Task ValidateAsync(RegisterRequest request, CancellationToken cancellationToken = default);
    void MarkSuccessfulRegistration();
}
