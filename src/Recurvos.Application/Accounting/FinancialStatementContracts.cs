using Recurvos.Application.Finance;

namespace Recurvos.Application.Accounting;

public sealed class ProfitAndLossQuery : AccountingReportQuery { public bool ComparePreviousPeriod { get; set; } }
public sealed record FinancialStatementAccountDto(Guid AccountId, string AccountCode, string AccountName, decimal Amount, decimal? ComparisonAmount = null);
public sealed record FinancialStatementGroupDto(string Key, string Name, decimal Amount, decimal? ComparisonAmount, IReadOnlyCollection<FinancialStatementAccountDto> Accounts);
public sealed record ProfitAndLossReportDto(Guid CompanyId, string CompanyName, string Currency, DateTime FromDateUtc, DateTime ToDateUtc, bool HasComparison, IReadOnlyCollection<FinancialStatementGroupDto> Groups, decimal Revenue, decimal CostOfSales, decimal GrossProfit, decimal OperatingExpenses, decimal OtherIncome, decimal OtherExpenses, decimal NetProfit, decimal? ComparisonNetProfit);
public sealed record BalanceSheetReportDto(Guid CompanyId, string CompanyName, string Currency, DateTime AsOfDateUtc, IReadOnlyCollection<FinancialStatementGroupDto> AssetGroups, IReadOnlyCollection<FinancialStatementGroupDto> LiabilityGroups, FinancialStatementGroupDto EquityGroup, decimal TotalAssets, decimal TotalLiabilities, decimal TotalEquity, decimal RetainedEarnings, bool IsBalanced);
public sealed record CashFlowReportDto(Guid CompanyId, string CompanyName, string Currency, DateTime FromDateUtc, DateTime ToDateUtc, IReadOnlyCollection<FinancialStatementGroupDto> OperatingActivities, IReadOnlyCollection<FinancialStatementGroupDto> InvestingActivities, IReadOnlyCollection<FinancialStatementGroupDto> FinancingActivities, decimal OpeningCash, decimal NetCashMovement, decimal ClosingCash, bool IsBalanced);

public interface IFinancialStatementService
{
    Task<ProfitAndLossReportDto> GetProfitAndLossAsync(ProfitAndLossQuery query, CancellationToken cancellationToken = default);
    Task<BalanceSheetReportDto> GetBalanceSheetAsync(AccountingReportQuery query, CancellationToken cancellationToken = default);
    Task<CashFlowReportDto> GetCashFlowAsync(AccountingReportQuery query, CancellationToken cancellationToken = default);
    Task<FinanceExportFile> ExportProfitAndLossAsync(ProfitAndLossQuery query, CancellationToken cancellationToken = default);
    Task<FinanceExportFile> ExportBalanceSheetAsync(AccountingReportQuery query, CancellationToken cancellationToken = default);
    Task<FinanceExportFile> ExportCashFlowAsync(AccountingReportQuery query, CancellationToken cancellationToken = default);
}
