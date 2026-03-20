using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class WebhookEvent : CompanyOwnedEntity
{
    public string GatewayName { get; set; } = string.Empty;
    public string ExternalEventId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public string Headers { get; set; } = string.Empty;
    public bool Processed { get; set; }
    public DateTime? ProcessedAtUtc { get; set; }
}
