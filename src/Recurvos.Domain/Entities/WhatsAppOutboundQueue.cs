using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class WhatsAppOutboundQueue : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public Guid? ReminderScheduleId { get; set; }
    public string RecipientPhoneNumber { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Template { get; set; }
    public string Reference { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime NotBeforeUtc { get; set; } = DateTime.UtcNow;
    public int AttemptCount { get; set; }
    public DateTime? LastAttemptAtUtc { get; set; }
    public DateTime? NextAttemptAtUtc { get; set; }
    public string? ExternalMessageId { get; set; }
    public string? ErrorMessage { get; set; }
    public Invoice? Invoice { get; set; }
    public ReminderSchedule? ReminderSchedule { get; set; }
}
