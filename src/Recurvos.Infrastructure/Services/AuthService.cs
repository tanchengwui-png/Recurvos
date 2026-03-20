using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Auth;
using Recurvos.Application.Platform;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Templates;
using System.Security.Cryptography;
using System.Text;

namespace Recurvos.Infrastructure.Services;

public sealed class AuthService(
    AppDbContext dbContext,
    IPasswordHasher passwordHasher,
    IJwtTokenService jwtTokenService,
    IOptions<JwtOptions> jwtOptions,
    ISubscriberPackageBillingService subscriberPackageBillingService,
    IRegistrationGuardService registrationGuardService,
    IEmailSender emailSender,
    IOptions<AppUrlOptions> appUrlOptions) : IAuthService
{
    private readonly JwtOptions _jwtOptions = jwtOptions.Value;
    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;
    private const string TermsVersion = "2026-03-17";
    private const string PrivacyVersion = "2026-03-17";

    public async Task<RegisterResult> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        await registrationGuardService.ValidateAsync(request, cancellationToken);

        if (!request.AcceptLegalTerms)
        {
            throw new InvalidOperationException("Please agree to the Terms of Service and Privacy Policy before creating your account.");
        }

        var normalizedUserEmail = NormalizeEmail(request.Email);
        var normalizedCompanyEmail = NormalizeEmail(request.CompanyEmail);
        var normalizedPackageCode = request.PackageCode.Trim().ToLowerInvariant();
        var normalizedRegistrationNumber = request.RegistrationNumber.Trim().ToUpperInvariant();

        if (await dbContext.Users.AnyAsync(x => x.Email == normalizedUserEmail, cancellationToken))
        {
            throw new InvalidOperationException("A user with this email already exists.");
        }

        var isValidPackage = await dbContext.PlatformPackages.AnyAsync(
            x => x.Code == normalizedPackageCode && x.IsActive,
            cancellationToken);
        if (!isValidPackage)
        {
            throw new InvalidOperationException("Please choose a valid package.");
        }

        var company = new Company
        {
            Name = request.CompanyName.Trim(),
            RegistrationNumber = normalizedRegistrationNumber,
            Email = normalizedCompanyEmail,
            Phone = string.Empty,
            Address = string.Empty,
            IsActive = true,
            IsPlatformAccount = false,
            SelectedPackage = normalizedPackageCode,
            PackageStatus = "pending_verification",
            TrialEndsAtUtc = null
        };

        var user = new User
        {
            Company = company,
            CompanyId = company.Id,
            FullName = request.FullName.Trim(),
            Email = normalizedUserEmail,
            PasswordHash = passwordHasher.Hash(request.Password),
            IsEmailVerified = false,
            TermsAcceptedAtUtc = DateTime.UtcNow,
            PrivacyAcceptedAtUtc = DateTime.UtcNow,
            TermsVersion = TermsVersion,
            PrivacyVersion = PrivacyVersion,
            IsOwner = true,
            IsPlatformOwner = false,
            Role = UserRole.Owner
        };

        dbContext.Companies.Add(company);
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        company.SubscriberId = user.Id;
        await CreateVerificationTokenAsync(user, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        try
        {
            await SendVerificationEmailAsync(user, company, cancellationToken);
            return new RegisterResult(
                true,
                user.Email,
                "We sent a verification link to your email. Please verify your email before signing in.");
        }
        catch (Exception exception)
        {
            return new RegisterResult(
                true,
                user.Email,
                $"Your account was created, but the verification email could not be sent yet. Fix email delivery and use resend verification. Details: {exception.Message}");
        }
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        var user = await dbContext.Users.FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken)
            ?? throw new UnauthorizedAccessException("Invalid credentials.");

        if (!passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        if (!user.IsActive)
        {
            throw new UnauthorizedAccessException("This user account is inactive.");
        }

        if (!user.IsEmailVerified)
        {
            throw new UnauthorizedAccessException("Please verify your email before signing in.");
        }

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = jwtTokenService.GenerateRefreshToken(),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(_jwtOptions.RefreshTokenDays)
        };

        dbContext.RefreshTokens.Add(refreshToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        var companyName = await dbContext.Companies.Where(x => x.Id == user.CompanyId).Select(x => x.Name).FirstAsync(cancellationToken);
        return CreateResponse(user, companyName, refreshToken.Token);
    }

    public async Task<AuthResponse> VerifyEmailAsync(VerifyEmailRequest request, CancellationToken cancellationToken = default)
    {
        var tokenHash = HashToken(request.Token);
        var verification = await dbContext.EmailVerificationTokens
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TokenHash == tokenHash, cancellationToken)
            ?? throw new UnauthorizedAccessException("This verification link is invalid or has expired.");

        if (verification.UsedAtUtc.HasValue || verification.ExpiresAtUtc < DateTime.UtcNow || verification.User is null)
        {
            throw new UnauthorizedAccessException("This verification link is invalid or has expired.");
        }

        var user = verification.User;
        user.IsEmailVerified = true;
        user.EmailVerifiedAtUtc = DateTime.UtcNow;
        verification.UsedAtUtc = DateTime.UtcNow;

        var company = await dbContext.Companies.FirstAsync(x => x.Id == user.CompanyId, cancellationToken);
        company.PackageStatus = "pending_payment";

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = jwtTokenService.GenerateRefreshToken(),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(_jwtOptions.RefreshTokenDays)
        };

        dbContext.RefreshTokens.Add(refreshToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        registrationGuardService.MarkSuccessfulRegistration();
        await subscriberPackageBillingService.ProvisionForSubscriberCompanyAsync(company.Id, cancellationToken);

        return CreateResponse(user, company.Name, refreshToken.Token);
    }

    public async Task ResendVerificationAsync(ResendVerificationRequest request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        var user = await dbContext.Users.FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);
        if (user is null || user.IsEmailVerified)
        {
            return;
        }

        var company = await dbContext.Companies.FirstAsync(x => x.Id == user.CompanyId, cancellationToken);
        await CreateVerificationTokenAsync(user, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await SendVerificationEmailAsync(user, company, cancellationToken);
    }

    public async Task RequestPasswordResetAsync(RequestPasswordResetRequest request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        var user = await dbContext.Users
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (user is null || user.Company is null)
        {
            return;
        }

        await CreatePasswordResetTokenAsync(user, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await SendPasswordResetEmailAsync(user, user.Company, cancellationToken);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default)
    {
        var tokenHash = HashToken(request.Token);
        var reset = await dbContext.PasswordResetTokens
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TokenHash == tokenHash, cancellationToken)
            ?? throw new UnauthorizedAccessException("This password reset link is invalid or has expired.");

        if (reset.UsedAtUtc.HasValue || reset.ExpiresAtUtc < DateTime.UtcNow || reset.User is null)
        {
            throw new UnauthorizedAccessException("This password reset link is invalid or has expired.");
        }

        var user = reset.User;
        user.PasswordHash = passwordHasher.Hash(request.NewPassword);
        user.UpdatedAtUtc = DateTime.UtcNow;
        reset.UsedAtUtc = DateTime.UtcNow;

        var activeRefreshTokens = await dbContext.RefreshTokens
            .Where(x => x.UserId == user.Id && x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow)
            .ToListAsync(cancellationToken);

        foreach (var refreshToken in activeRefreshTokens)
        {
            refreshToken.RevokedAtUtc = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<AuthResponse> RefreshAsync(RefreshRequest request, CancellationToken cancellationToken = default)
    {
        var token = await dbContext.RefreshTokens.Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Token == request.RefreshToken, cancellationToken)
            ?? throw new UnauthorizedAccessException("Invalid refresh token.");

        if (!token.IsActive || token.User is null)
        {
            throw new UnauthorizedAccessException("Refresh token expired.");
        }

        if (!token.User.IsActive)
        {
            throw new UnauthorizedAccessException("This user account is inactive.");
        }

        token.RevokedAtUtc = DateTime.UtcNow;
        var replacement = new RefreshToken
        {
            UserId = token.UserId,
            Token = jwtTokenService.GenerateRefreshToken(),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(_jwtOptions.RefreshTokenDays)
        };

        dbContext.RefreshTokens.Add(replacement);
        await dbContext.SaveChangesAsync(cancellationToken);
        var companyName = await dbContext.Companies.Where(x => x.Id == token.User.CompanyId).Select(x => x.Name).FirstAsync(cancellationToken);
        return CreateResponse(token.User, companyName, replacement.Token);
    }

    private AuthResponse CreateResponse(User user, string companyName, string refreshToken) =>
        new(
            jwtTokenService.GenerateAccessToken(user.Id, user.CompanyId, user.Email, user.Role.ToString(), user.IsPlatformOwner),
            refreshToken,
            user.Id,
            user.CompanyId,
            companyName,
            user.Email,
            user.FullName,
            user.Role.ToString(),
            user.IsPlatformOwner);

    private static string NormalizeEmail(string value) => value.Trim().ToLowerInvariant();

    private async Task CreateVerificationTokenAsync(User user, CancellationToken cancellationToken)
    {
        var existingTokens = await dbContext.EmailVerificationTokens
            .Where(x => x.UserId == user.Id && !x.UsedAtUtc.HasValue)
            .ToListAsync(cancellationToken);

        foreach (var existing in existingTokens)
        {
            existing.UsedAtUtc = DateTime.UtcNow;
        }

        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');

        dbContext.EmailVerificationTokens.Add(new EmailVerificationToken
        {
            UserId = user.Id,
            TokenHash = HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(24)
        });

        user.UpdatedAtUtc = DateTime.UtcNow;
        _pendingRawToken = rawToken;
    }

    private string? _pendingRawToken;
    private string? _pendingPasswordResetToken;

    private async Task CreatePasswordResetTokenAsync(User user, CancellationToken cancellationToken)
    {
        var existingTokens = await dbContext.PasswordResetTokens
            .Where(x => x.UserId == user.Id && !x.UsedAtUtc.HasValue)
            .ToListAsync(cancellationToken);

        foreach (var existing in existingTokens)
        {
            existing.UsedAtUtc = DateTime.UtcNow;
        }

        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');

        dbContext.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(2)
        });

        user.UpdatedAtUtc = DateTime.UtcNow;
        _pendingPasswordResetToken = rawToken;
    }

    private async Task SendVerificationEmailAsync(User user, Company company, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_pendingRawToken))
        {
            throw new InvalidOperationException("Unable to create verification email.");
        }

        var verificationUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/verify-email?token={Uri.EscapeDataString(_pendingRawToken)}";
        var subject = "Verify your Recurvo account";
        var accountReference = string.Equals(user.FullName.Trim(), company.Name.Trim(), StringComparison.OrdinalIgnoreCase)
            ? "your company billing workspace"
            : $"{company.Name} and start using your billing workspace";
        var body = EmailTemplateRenderer.RenderActionEmail(
            "Email verification",
            "Activate your Recurvo account",
            $"Hi {user.FullName}, please verify your email to activate {accountReference}.",
            "Verify email",
            verificationUrl,
            [
                "This verification link expires in 24 hours.",
                "Your account will stay inactive until the email is verified.",
                "If you did not create this account, you can safely ignore this email."
            ],
            "This email was sent because a new Recurvo account was created with this address.");

        _pendingRawToken = null;
        try
        {
            await emailSender.SendAsync(user.Email, subject, body, cancellationToken: cancellationToken);
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to send verification email: {exception.Message}");
        }
    }

    private async Task SendPasswordResetEmailAsync(User user, Company company, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_pendingPasswordResetToken))
        {
            throw new InvalidOperationException("Unable to create password reset email.");
        }

        var resetUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(_pendingPasswordResetToken)}";
        var subject = "Reset your Recurvo password";
        var body = EmailTemplateRenderer.RenderActionEmail(
            "Password reset",
            "Reset your Recurvo password",
            $"Hi {user.FullName}, we received a request to reset the password for {company.Name}. Use the secure link below to choose a new password.",
            "Reset password",
            resetUrl,
            [
                "This reset link expires in 2 hours.",
                "If you did not request a password reset, you can ignore this email.",
                "Signing in again will require your new password."
            ],
            "This email was sent because a password reset was requested for your Recurvo account.");

        _pendingPasswordResetToken = null;
        try
        {
            await emailSender.SendAsync(user.Email, subject, body, cancellationToken: cancellationToken);
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to send password reset email: {exception.Message}");
        }
    }

    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
