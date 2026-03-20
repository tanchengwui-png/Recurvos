using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class User : CompanyOwnedEntity
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public bool IsEmailVerified { get; set; }
    public DateTime? EmailVerifiedAtUtc { get; set; }
    public DateTime? TermsAcceptedAtUtc { get; set; }
    public DateTime? PrivacyAcceptedAtUtc { get; set; }
    public string TermsVersion { get; set; } = string.Empty;
    public string PrivacyVersion { get; set; } = string.Empty;
    public bool IsOwner { get; set; }
    public bool IsPlatformOwner { get; set; }
    public UserRole Role { get; set; } = UserRole.Owner;
    public Company? Company { get; set; }
    public ICollection<Company> ManagedCompanies { get; set; } = new List<Company>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<EmailVerificationToken> EmailVerificationTokens { get; set; } = new List<EmailVerificationToken>();
    public ICollection<PasswordResetToken> PasswordResetTokens { get; set; } = new List<PasswordResetToken>();
}
