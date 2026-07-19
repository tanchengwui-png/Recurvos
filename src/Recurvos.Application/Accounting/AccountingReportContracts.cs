using Recurvos.Application.Finance;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Accounting;

public class AccountingReportQuery
{
    public Guid? CompanyId { get; set; }
    public DateTime? FromDateUtc { get; set; }
    public DateTime? ToDateUtc { get; set; }
}

public sealed class GeneralLedgerQuery : AccountingReportQuery
{
    public Guid? AccountId { get; set; }
    public string? Search { get; set; }
}

public sealed record GeneralLedgerTransactionDto(Guid JournalEntryId, string JournalNumber, DateTime JournalDateUtc, string ReferenceNo, string Description, decimal DebitAmount, decimal CreditAmount, decimal RunningBalance);
public sealed record GeneralLedgerAccountDto(Guid AccountId, string AccountCode, string AccountName, AccountType AccountType, decimal OpeningBalance, decimal PeriodDebit, decimal PeriodCredit, decimal ClosingBalance, IReadOnlyCollection<GeneralLedgerTransactionDto> Transactions);
public sealed record GeneralLedgerReportDto(Guid CompanyId, string CompanyName, string Currency, DateTime FromDateUtc, DateTime ToDateUtc, IReadOnlyCollection<GeneralLedgerAccountDto> Accounts);
public sealed record TrialBalanceLineDto(Guid AccountId, string AccountCode, string AccountName, AccountType AccountType, decimal OpeningDebit, decimal OpeningCredit, decimal PeriodDebit, decimal PeriodCredit, decimal ClosingDebit, decimal ClosingCredit);
public sealed record TrialBalanceReportDto(Guid CompanyId, string CompanyName, string Currency, DateTime FromDateUtc, DateTime ToDateUtc, IReadOnlyCollection<TrialBalanceLineDto> Lines, decimal TotalOpeningDebit, decimal TotalOpeningCredit, decimal TotalPeriodDebit, decimal TotalPeriodCredit, decimal TotalClosingDebit, decimal TotalClosingCredit, bool IsBalanced);

public interface IAccountingReportService
{
    Task<GeneralLedgerReportDto> GetGeneralLedgerAsync(GeneralLedgerQuery query, CancellationToken cancellationToken = default);
    Task<TrialBalanceReportDto> GetTrialBalanceAsync(AccountingReportQuery query, CancellationToken cancellationToken = default);
    Task<FinanceExportFile> ExportGeneralLedgerAsync(GeneralLedgerQuery query, CancellationToken cancellationToken = default);
    Task<FinanceExportFile> ExportTrialBalanceAsync(AccountingReportQuery query, CancellationToken cancellationToken = default);
}
