using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class ReminderSchedule : CompanyOwnedEntity
{
    public Guid InvoiceId { get; set; }
    public Guid DunningRuleId { get; set; }
    public DateTime ScheduledAtUtc { get; set; }
    public DateTime? SentAtUtc { get; set; }
    public bool Cancelled { get; set; }
    public Invoice? Invoice { get; set; }
    public DunningRule? DunningRule { get; set; }
}
