using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class Company : BaseEntity
{
    public Guid? SubscriberId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RegistrationNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public string? NatureOfBusiness { get; set; }
    public string? LogoPath { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsPlatformAccount { get; set; }
    public string Currency { get; set; } = "MYR";
    public int InvoiceSequence { get; set; } = 1000;
    public string? SelectedPackage { get; set; }
    public string? PendingPackageCode { get; set; }
    public string? PackageStatus { get; set; }
    public DateTime? PackageGracePeriodEndsAtUtc { get; set; }
    public DateTime? PackageBillingCycleStartUtc { get; set; }
    public DateTime? TrialEndsAtUtc { get; set; }
    public User? Subscriber { get; set; }
    public CompanyInvoiceSettings? InvoiceSettings { get; set; }
    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
}
