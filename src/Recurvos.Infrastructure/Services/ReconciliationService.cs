using Recurvos.Application.Finance;

namespace Recurvos.Infrastructure.Services;

public sealed class ReconciliationService : IReconciliationService
{
    public Task<ReconciliationStatusDto> GetStatusAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new ReconciliationStatusDto(
            "Phase 2",
            "NotStarted",
            "Reconciliation will be implemented in phase 2 with payout batches, settlement lines, reconciliation results, and ledger postings."));
}
