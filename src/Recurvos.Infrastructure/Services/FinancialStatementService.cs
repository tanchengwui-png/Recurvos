using System.Globalization;
using System.Text;
using Recurvos.Application.Accounting;
using Recurvos.Application.Finance;
using Recurvos.Domain.Enums;

namespace Recurvos.Infrastructure.Services;

public sealed class FinancialStatementService(IAccountingReportService reports) : IFinancialStatementService
{
    public async Task<ProfitAndLossReportDto> GetProfitAndLossAsync(ProfitAndLossQuery query, CancellationToken ct = default)
    {
        var current = await reports.GetTrialBalanceAsync(query, ct); TrialBalanceReportDto? prior = null;
        if (query.ComparePreviousPeriod) { var days = (current.ToDateUtc - current.FromDateUtc).Days; prior = await reports.GetTrialBalanceAsync(new AccountingReportQuery { CompanyId = query.CompanyId, FromDateUtc = current.FromDateUtc.AddDays(-days), ToDateUtc = current.FromDateUtc.AddDays(-1) }, ct); }
        var groups = BuildProfitAndLossGroups(current.Lines, prior?.Lines); var byKey = groups.ToDictionary(x => x.Key);
        var revenue = byKey.GetValueOrDefault("revenue")?.Amount ?? 0; var cost = byKey.GetValueOrDefault("cost-of-sales")?.Amount ?? 0; var operating = byKey.GetValueOrDefault("operating-expenses")?.Amount ?? 0; var otherIncome = byKey.GetValueOrDefault("other-income")?.Amount ?? 0; var otherExpense = byKey.GetValueOrDefault("other-expenses")?.Amount ?? 0;
        return new(current.CompanyId, current.CompanyName, current.Currency, current.FromDateUtc, current.ToDateUtc, prior is not null, groups, revenue, cost, revenue - cost, operating, otherIncome, otherExpense, revenue - cost - operating + otherIncome - otherExpense, prior is null ? null : BuildNetProfit(prior.Lines));
    }

    public async Task<BalanceSheetReportDto> GetBalanceSheetAsync(AccountingReportQuery query, CancellationToken ct = default)
    {
        var balance = await reports.GetTrialBalanceAsync(query, ct); var assets = BuildBalanceGroups(balance.Lines.Where(x => x.AccountType == AccountType.Asset), true, "asset"); var liabilities = BuildBalanceGroups(balance.Lines.Where(x => x.AccountType == AccountType.Liability), false, "liability");
        var equityAccounts = BuildAccounts(balance.Lines.Where(x => x.AccountType == AccountType.Equity), false, null); var retained = BuildNetProfit(balance.Lines, closing: true); var equityGroup = new FinancialStatementGroupDto("equity", "Equity", equityAccounts.Sum(x => x.Amount) + retained, null, equityAccounts.Concat([new FinancialStatementAccountDto(Guid.Empty, "RETAINED", "Retained earnings", retained)]).ToList());
        var totalAssets = assets.Sum(x => x.Amount); var totalLiabilities = liabilities.Sum(x => x.Amount); var totalEquity = equityGroup.Amount;
        return new(balance.CompanyId, balance.CompanyName, balance.Currency, balance.ToDateUtc.AddDays(-1), assets, liabilities, equityGroup, totalAssets, totalLiabilities, totalEquity, retained, totalAssets == totalLiabilities + totalEquity);
    }

    public async Task<CashFlowReportDto> GetCashFlowAsync(AccountingReportQuery query, CancellationToken ct = default)
    {
        var balance = await reports.GetTrialBalanceAsync(query, ct); var cash = balance.Lines.Where(IsCash).ToList(); var opening = cash.Sum(NetClosingOpening); var closing = cash.Sum(NetClosing); var operating = BuildCashFlowGroup("operating", "Operating Activities", balance.Lines.Where(x => !IsCash(x) && ClassifyCashFlow(x) == "operating")); var investing = BuildCashFlowGroup("investing", "Investing Activities", balance.Lines.Where(x => !IsCash(x) && ClassifyCashFlow(x) == "investing")); var financing = BuildCashFlowGroup("financing", "Financing Activities", balance.Lines.Where(x => !IsCash(x) && ClassifyCashFlow(x) == "financing")); var movement = closing - opening; var classified = operating.Amount + investing.Amount + financing.Amount;
        return new(balance.CompanyId, balance.CompanyName, balance.Currency, balance.FromDateUtc, balance.ToDateUtc, [operating], [investing], [financing], opening, movement, closing, opening + movement == closing && classified == movement);
    }

    public async Task<FinanceExportFile> ExportProfitAndLossAsync(ProfitAndLossQuery q, CancellationToken ct = default) => Csv("profit-and-loss", await GetProfitAndLossAsync(q, ct), r => r.Groups, r => new[] { "group", "account", "amount" });
    public async Task<FinanceExportFile> ExportBalanceSheetAsync(AccountingReportQuery q, CancellationToken ct = default) { var r = await GetBalanceSheetAsync(q, ct); return Csv("balance-sheet", r.AssetGroups.Concat(r.LiabilityGroups).Append(r.EquityGroup), new[] { "group", "account", "amount" }); }
    public async Task<FinanceExportFile> ExportCashFlowAsync(AccountingReportQuery q, CancellationToken ct = default) { var r = await GetCashFlowAsync(q, ct); return Csv("cash-flow", r.OperatingActivities.Concat(r.InvestingActivities).Concat(r.FinancingActivities), new[] { "group", "account", "amount" }); }

    private static IReadOnlyCollection<FinancialStatementGroupDto> BuildProfitAndLossGroups(IEnumerable<TrialBalanceLineDto> lines, IEnumerable<TrialBalanceLineDto>? comparison) => new[] { ("revenue", "Revenue"), ("cost-of-sales", "Cost of Sales"), ("operating-expenses", "Operating Expenses"), ("other-income", "Other Income"), ("other-expenses", "Other Expenses") }.Select(x => { var accounts = lines.Where(line => (line.AccountType is AccountType.Revenue or AccountType.Expense) && ProfitAndLossGroup(line) == x.Item1); var prior = comparison?.Where(line => (line.AccountType is AccountType.Revenue or AccountType.Expense) && ProfitAndLossGroup(line) == x.Item1); return new FinancialStatementGroupDto(x.Item1, x.Item2, BuildAccounts(accounts, x.Item1 is "revenue" or "other-income", false).Sum(a => a.Amount), prior is null ? null : BuildAccounts(prior, x.Item1 is "revenue" or "other-income", false).Sum(a => a.Amount), BuildAccounts(accounts, x.Item1 is "revenue" or "other-income", false)); }).Where(x => x.Accounts.Count > 0).ToList();
    private static IReadOnlyCollection<FinancialStatementGroupDto> BuildBalanceGroups(IEnumerable<TrialBalanceLineDto> lines, bool asset, string prefix) => lines.GroupBy(x => IsCurrent(x) ? $"current-{prefix}s" : $"non-current-{prefix}s").Select(group => new FinancialStatementGroupDto(group.Key, group.Key.StartsWith("current") ? $"Current {(prefix == "liability" ? "Liabilities" : "Assets")}" : $"Non-current {(prefix == "liability" ? "Liabilities" : "Assets")}", BuildAccounts(group, asset, null).Sum(x => x.Amount), null, BuildAccounts(group, asset, null))).ToList();
    private static FinancialStatementGroupDto BuildCashFlowGroup(string key, string name, IEnumerable<TrialBalanceLineDto> lines) { var accounts = lines.Select(x => new FinancialStatementAccountDto(x.AccountId, x.AccountCode, x.AccountName, -NetPeriod(x))).Where(x => x.Amount != 0).ToList(); return new(key, name, accounts.Sum(x => x.Amount), null, accounts); }
    private static IReadOnlyCollection<FinancialStatementAccountDto> BuildAccounts(IEnumerable<TrialBalanceLineDto> lines, bool creditNatural, bool? closing) => lines.Select(x => new FinancialStatementAccountDto(x.AccountId, x.AccountCode, x.AccountName, creditNatural ? -Net(x, closing ?? false) : Net(x, closing ?? false))).Where(x => x.Amount != 0).OrderBy(x => x.AccountCode).ToList();
    private static decimal BuildNetProfit(IEnumerable<TrialBalanceLineDto> lines, bool closing = false) => lines.Where(x => x.AccountType == AccountType.Revenue).Sum(x => -Net(x, closing)) - lines.Where(x => x.AccountType == AccountType.Expense).Sum(x => Net(x, closing));
    private static string ProfitAndLossGroup(TrialBalanceLineDto line) { var text = $"{line.AccountCode} {line.AccountName}".ToLowerInvariant(); if (line.AccountType == AccountType.Revenue) return text.Contains("other") ? "other-income" : "revenue"; if (text.Contains("cost of sales") || text.Contains("cost of goods") || text.Contains("cogs")) return "cost-of-sales"; return text.Contains("other") ? "other-expenses" : "operating-expenses"; }
    private static bool IsCurrent(TrialBalanceLineDto line) { var text = $"{line.AccountCode} {line.AccountName}".ToLowerInvariant(); return !(text.Contains("property") || text.Contains("plant") || text.Contains("equipment") || text.Contains("vehicle") || text.Contains("long-term") || text.Contains("non-current")); }
    private static bool IsCash(TrialBalanceLineDto line) { var text = $"{line.AccountCode} {line.AccountName}".ToLowerInvariant(); return line.AccountType == AccountType.Asset && (text.Contains("cash") || text.Contains("bank")); }
    private static string ClassifyCashFlow(TrialBalanceLineDto line) { var text = $"{line.AccountCode} {line.AccountName}".ToLowerInvariant(); if (line.AccountType == AccountType.Asset && !IsCurrent(line)) return "investing"; if (line.AccountType is AccountType.Liability or AccountType.Equity) return "financing"; return "operating"; }
    private static decimal Net(TrialBalanceLineDto line, bool closing) => closing ? line.ClosingDebit - line.ClosingCredit : NetPeriod(line);
    private static decimal NetPeriod(TrialBalanceLineDto line) => line.PeriodDebit - line.PeriodCredit;
    private static decimal NetClosing(TrialBalanceLineDto line) => line.ClosingDebit - line.ClosingCredit;
    private static decimal NetClosingOpening(TrialBalanceLineDto line) => line.OpeningDebit - line.OpeningCredit;
    private static FinanceExportFile Csv<T>(string prefix, T report, Func<T, IReadOnlyCollection<FinancialStatementGroupDto>> groups, Func<T, string[]> header) => Csv(prefix, groups(report), header(report));
    private static FinanceExportFile Csv(string prefix, IEnumerable<FinancialStatementGroupDto> groups, string[] header) { var csv = new StringBuilder(string.Join(',', header) + "\n"); foreach (var group in groups) foreach (var account in group.Accounts) csv.AppendLine($"\"{group.Name}\",\"{account.AccountCode} · {account.AccountName}\",{account.Amount.ToString("0.00", CultureInfo.InvariantCulture)}"); return new($"{prefix}-{DateTime.UtcNow:yyyyMMddHHmmss}.csv", Encoding.UTF8.GetBytes(csv.ToString()), "text/csv"); }
}
