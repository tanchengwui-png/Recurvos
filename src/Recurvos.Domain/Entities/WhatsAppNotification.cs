using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class WhatsAppNotification : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public Guid? ReminderScheduleId { get; set; }
    public string RecipientPhoneNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? ExternalMessageId { get; set; }
    public string? ErrorMessage { get; set; }
    public Invoice? Invoice { get; set; }
    public ReminderSchedule? ReminderSchedule { get; set; }
}
