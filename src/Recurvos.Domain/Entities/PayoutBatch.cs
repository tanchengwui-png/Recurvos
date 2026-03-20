using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class PayoutBatch : CompanyOwnedEntity
{
    public string ProviderName { get; set; } = string.Empty;
    public string ExternalBatchRef { get; set; } = string.Empty;
    public string Currency { get; set; } = "MYR";
    public decimal GrossAmount { get; set; }
    public decimal FeeAmount { get; set; }
    public decimal NetAmount { get; set; }
    public DateTime PayoutDateUtc { get; set; }
    public ICollection<SettlementLine> SettlementLines { get; set; } = new List<SettlementLine>();
}
