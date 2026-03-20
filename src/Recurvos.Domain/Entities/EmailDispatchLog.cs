using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class EmailDispatchLog : CompanyOwnedEntity
{
    public string OriginalRecipient { get; set; } = string.Empty;
    public string EffectiveRecipient { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string DeliveryMode { get; set; } = string.Empty;
    public bool WasRedirected { get; set; }
    public string? RedirectReason { get; set; }
    public bool Succeeded { get; set; }
    public string? ErrorMessage { get; set; }
}
