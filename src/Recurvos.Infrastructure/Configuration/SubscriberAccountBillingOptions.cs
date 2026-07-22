namespace Recurvos.Infrastructure.Configuration;

/// <summary>
/// Rollout controls for the account-owned billing migration. Both switches must
/// be enabled before a reconciled account may use account billing. Release 1
/// never reads account state for billing decisions.
/// </summary>
public sealed class SubscriberAccountBillingOptions
{
    public const string SectionName = "SubscriberAccountBilling";

    public bool Enabled { get; set; }
    public bool DualReadValidationEnabled { get; set; } = true;
    public bool DualWriteEnabled { get; set; }
}
