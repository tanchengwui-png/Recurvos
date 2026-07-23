namespace Recurvos.Infrastructure.Configuration;

/// <summary>
/// Rollout controls for the account-owned billing migration. Both switches must
/// be enabled before a reconciled account may use account billing. Release 3
/// permits only healthy, explicitly opted-in accounts to use the shadow read
/// boundary; the default remains legacy Company billing.
/// </summary>
public sealed class SubscriberAccountBillingOptions
{
    public const string SectionName = "SubscriberAccountBilling";

    public bool Enabled { get; set; }
    public bool DualReadValidationEnabled { get; set; } = true;
    public bool DualWriteEnabled { get; set; }
}
