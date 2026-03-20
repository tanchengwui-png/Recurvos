using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class EmailVerificationToken : BaseEntity
{
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
    public User? User { get; set; }
}
