namespace Recurvos.Application.Finance;

public enum FinanceExportDocumentType
{
    Invoices = 1,
    Payments = 2,
    Refunds = 3,
    CreditNotes = 4
}

public sealed record FinanceExportRequest(
    FinanceExportDocumentType DocumentType,
    DateTime? StartDateUtc,
    DateTime? EndDateUtc);

public sealed record FinanceExportFile(string FileName, byte[] Content, string ContentType);

public sealed record ReconciliationStatusDto(string Phase, string Status, string Message);

public interface IAccountingExportService
{
    Task<FinanceExportFile> ExportAsync(FinanceExportRequest request, CancellationToken cancellationToken = default);
}

public interface IReconciliationService
{
    Task<ReconciliationStatusDto> GetStatusAsync(CancellationToken cancellationToken = default);
}
