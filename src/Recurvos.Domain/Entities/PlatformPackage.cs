using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PlatformPackage : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PriceLabel { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.Month;
    public int IntervalCount { get; set; } = 1;
    public int GracePeriodDays { get; set; } = 7;
    public int MaxCompanies { get; set; } = 1;
    public int MaxProducts { get; set; } = 1;
    public int MaxPlans { get; set; } = 0;
    public int MaxCustomers { get; set; } = 1;
    public int MaxWhatsAppRemindersPerMonth { get; set; }
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }
    public ICollection<PlatformPackageFeature> Features { get; set; } = new List<PlatformPackageFeature>();
    public ICollection<PlatformPackageTrustPoint> TrustPoints { get; set; } = new List<PlatformPackageTrustPoint>();
}
