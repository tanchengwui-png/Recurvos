using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

/// <summary>The immutable accounting document once posted.</summary>
public sealed class JournalEntry : CompanyOwnedEntity
{
    public string JournalNumber { get; set; } = string.Empty;
    public DateTime JournalDateUtc { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal ExchangeRate { get; set; } = 1m;
    public string ReferenceNo { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public JournalEntryStatus Status { get; set; } = JournalEntryStatus.Draft;
    public Guid? ReversesJournalEntryId { get; set; }
    public Guid? ReversedByJournalEntryId { get; set; }
    public Guid? PostedByUserId { get; set; }
    public DateTime? PostedAtUtc { get; set; }
    public Guid? CancelledByUserId { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public Company? Company { get; set; }
    public JournalEntry? ReversesJournalEntry { get; set; }
    public JournalEntry? ReversedByJournalEntry { get; set; }
    public ICollection<JournalEntryLine> Lines { get; set; } = new List<JournalEntryLine>();
}
