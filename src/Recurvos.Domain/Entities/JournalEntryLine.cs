using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class JournalEntryLine : BaseEntity
{
    public Guid JournalEntryId { get; set; }
    public int SortOrder { get; set; }
    public Guid AccountId { get; set; }
    public string AccountCodeSnapshot { get; set; } = string.Empty;
    public string AccountNameSnapshot { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal DebitAmount { get; set; }
    public decimal CreditAmount { get; set; }
    public decimal BaseDebitAmount { get; set; }
    public decimal BaseCreditAmount { get; set; }
    public JournalEntry? JournalEntry { get; set; }
    public Account? Account { get; set; }
}
