using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class LedgerPosting : CompanyOwnedEntity
{
    public string SourceType { get; set; } = string.Empty;
    public string SourceId { get; set; } = string.Empty;
    public string AccountCode { get; set; } = string.Empty;
    public decimal DebitAmount { get; set; }
    public decimal CreditAmount { get; set; }
    public string Currency { get; set; } = "MYR";
    public LedgerPostingStatus Status { get; set; } = LedgerPostingStatus.Draft;
    public DateTime PostingDateUtc { get; set; }
    public string? ExternalLedgerRef { get; set; }
}
