using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PlatformPackageTrustPoint : BaseEntity
{
    public Guid PlatformPackageId { get; set; }
    public string Text { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public PlatformPackage? PlatformPackage { get; set; }
}
