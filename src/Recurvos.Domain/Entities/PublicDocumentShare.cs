using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

/// <summary>Company-scoped authorization record for an intentionally public business document.</summary>
public sealed class PublicDocumentShare : CompanyOwnedEntity
{
    public string DocumentType { get; set; } = string.Empty;
    public Guid DocumentId { get; set; }
    // Only a SHA-256 representation is persisted; the bearer token is returned once to its creator.
    public string TokenHash { get; set; } = string.Empty;
    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}
