using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Accounting;
using Recurvos.Application.Finance;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

/// <summary>Shared posted-journal query foundation for GL, trial balance, and future financial statements.</summary>
public sealed class AccountingReportService(AppDbContext db, ICurrentUserService currentUser) : IAccountingReportService
{
    public async Task<GeneralLedgerReportDto> GetGeneralLedgerAsync(GeneralLedgerQuery query, CancellationToken ct = default)
    {
        var context = await LoadContextAsync(query, ct);
        var lines = await LoadLinesAsync(context.CompanyId, context.ToUtc, query.AccountId, query.Search, ct);
        var accounts = lines.GroupBy(x => new AccountGroupKey(x.AccountId, x.AccountCodeSnapshot, x.AccountNameSnapshot, x.Account!.Type))
            .OrderBy(x => x.Key.AccountCode)
            .Select(group => BuildLedgerAccount(group, context.FromUtc, context.ToUtc)).ToList();
        return new GeneralLedgerReportDto(context.CompanyId, context.CompanyName, context.Currency, context.FromUtc, context.ToUtc, accounts);
    }

    public async Task<TrialBalanceReportDto> GetTrialBalanceAsync(AccountingReportQuery query, CancellationToken ct = default)
    {
        var context = await LoadContextAsync(query, ct);
        var lines = await LoadLinesAsync(context.CompanyId, context.ToUtc, null, null, ct);
        var reportLines = lines.GroupBy(x => new AccountGroupKey(x.AccountId, x.AccountCodeSnapshot, x.AccountNameSnapshot, x.Account!.Type))
            .OrderBy(x => x.Key.AccountCode).Select(group => BuildTrialBalanceLine(group, context.FromUtc, context.ToUtc)).ToList();
        var openingDebit = reportLines.Sum(x => x.OpeningDebit); var openingCredit = reportLines.Sum(x => x.OpeningCredit);
        var periodDebit = reportLines.Sum(x => x.PeriodDebit); var periodCredit = reportLines.Sum(x => x.PeriodCredit);
        var closingDebit = reportLines.Sum(x => x.ClosingDebit); var closingCredit = reportLines.Sum(x => x.ClosingCredit);
        return new TrialBalanceReportDto(context.CompanyId, context.CompanyName, context.Currency, context.FromUtc, context.ToUtc, reportLines, openingDebit, openingCredit, periodDebit, periodCredit, closingDebit, closingCredit, openingDebit == openingCredit && periodDebit == periodCredit && closingDebit == closingCredit);
    }

    public async Task<FinanceExportFile> ExportGeneralLedgerAsync(GeneralLedgerQuery query, CancellationToken ct = default)
    {
        var report = await GetGeneralLedgerAsync(query, ct); var csv = new StringBuilder("account code,account name,date,journal number,reference,description,debit,credit,running balance\n");
        foreach (var account in report.Accounts) foreach (var transaction in account.Transactions)
            csv.AppendLine(string.Join(',', Csv(account.AccountCode), Csv(account.AccountName), Csv(transaction.JournalDateUtc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), Csv(transaction.JournalNumber), Csv(transaction.ReferenceNo), Csv(transaction.Description), Amount(transaction.DebitAmount), Amount(transaction.CreditAmount), Amount(transaction.RunningBalance)));
        return File("general-ledger", csv);
    }

    public async Task<FinanceExportFile> ExportTrialBalanceAsync(AccountingReportQuery query, CancellationToken ct = default)
    {
        var report = await GetTrialBalanceAsync(query, ct); var csv = new StringBuilder("account code,account name,type,opening debit,opening credit,period debit,period credit,closing debit,closing credit\n");
        foreach (var line in report.Lines) csv.AppendLine(string.Join(',', Csv(line.AccountCode), Csv(line.AccountName), line.AccountType, Amount(line.OpeningDebit), Amount(line.OpeningCredit), Amount(line.PeriodDebit), Amount(line.PeriodCredit), Amount(line.ClosingDebit), Amount(line.ClosingCredit)));
        return File("trial-balance", csv);
    }

    private async Task<List<JournalEntryLine>> LoadLinesAsync(Guid companyId, DateTime toUtc, Guid? accountId, string? search, CancellationToken ct)
    {
        IQueryable<JournalEntryLine> lines = db.JournalEntryLines.Include(x => x.JournalEntry).Include(x => x.Account)
            .Where(x => x.JournalEntry!.CompanyId == companyId && (x.JournalEntry.Status == JournalEntryStatus.Posted || x.JournalEntry.Status == JournalEntryStatus.Reversed) && x.JournalEntry.JournalDateUtc < toUtc);
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); lines = lines.Where(x => x.JournalEntry!.JournalNumber.Contains(term) || x.JournalEntry.ReferenceNo.Contains(term) || x.JournalEntry.Description.Contains(term)); }
        if (accountId.HasValue) lines = lines.Where(x => x.AccountId == accountId.Value);
        return await lines.OrderBy(x => x.JournalEntry!.JournalDateUtc).ThenBy(x => x.JournalEntry!.JournalNumber).ThenBy(x => x.SortOrder).ToListAsync(ct);
    }

    private static GeneralLedgerAccountDto BuildLedgerAccount(IGrouping<AccountGroupKey, JournalEntryLine> group, DateTime fromUtc, DateTime toUtc)
    {
        var ordered = group.OrderBy(x => x.JournalEntry!.JournalDateUtc).ThenBy(x => x.JournalEntry!.JournalNumber).ThenBy(x => x.SortOrder).ToList();
        var opening = ordered.Where(x => x.JournalEntry!.JournalDateUtc < fromUtc).Sum(Net);
        var running = opening; var transactions = new List<GeneralLedgerTransactionDto>();
        foreach (var line in ordered.Where(x => x.JournalEntry!.JournalDateUtc >= fromUtc && x.JournalEntry!.JournalDateUtc < toUtc)) { running += Net(line); transactions.Add(new(line.JournalEntryId, line.JournalEntry!.JournalNumber, line.JournalEntry.JournalDateUtc, line.JournalEntry.ReferenceNo, string.IsNullOrWhiteSpace(line.Description) ? line.JournalEntry.Description : line.Description, line.BaseDebitAmount, line.BaseCreditAmount, running)); }
        var periodDebit = transactions.Sum(x => x.DebitAmount); var periodCredit = transactions.Sum(x => x.CreditAmount); var first = ordered[0];
        return new GeneralLedgerAccountDto(first.AccountId, first.AccountCodeSnapshot, first.AccountNameSnapshot, first.Account!.Type, opening, periodDebit, periodCredit, running, transactions);
    }

    private static TrialBalanceLineDto BuildTrialBalanceLine(IGrouping<AccountGroupKey, JournalEntryLine> group, DateTime fromUtc, DateTime toUtc)
    {
        var opening = group.Where(x => x.JournalEntry!.JournalDateUtc < fromUtc).Sum(Net); var debit = group.Where(x => x.JournalEntry!.JournalDateUtc >= fromUtc && x.JournalEntry.JournalDateUtc < toUtc).Sum(x => x.BaseDebitAmount); var credit = group.Where(x => x.JournalEntry!.JournalDateUtc >= fromUtc && x.JournalEntry.JournalDateUtc < toUtc).Sum(x => x.BaseCreditAmount); var closing = opening + debit - credit; var first = group.First();
        return new(first.AccountId, first.AccountCodeSnapshot, first.AccountNameSnapshot, first.Account!.Type, opening >= 0 ? opening : 0, opening < 0 ? -opening : 0, debit, credit, closing >= 0 ? closing : 0, closing < 0 ? -closing : 0);
    }
    private async Task<ReportContext> LoadContextAsync(AccountingReportQuery query, CancellationToken ct)
    {
        if (!query.CompanyId.HasValue || query.CompanyId == Guid.Empty) throw new InvalidOperationException("Company is required.");
        var company = await db.Companies.FirstOrDefaultAsync(x => x.Id == query.CompanyId && x.SubscriberId == UserId, ct) ?? throw new UnauthorizedAccessException();
        var from = query.FromDateUtc?.ToUniversalTime().Date ?? DateTime.UtcNow.Date.AddDays(-30); var to = (query.ToDateUtc?.ToUniversalTime().Date ?? DateTime.UtcNow.Date).AddDays(1);
        if (to <= from) throw new InvalidOperationException("The end date must be on or after the start date.");
        return new(company.Id, company.Name, company.Currency, from, to);
    }
    private Guid UserId => currentUser.UserId ?? throw new UnauthorizedAccessException();
    private static decimal Net(JournalEntryLine line) => line.BaseDebitAmount - line.BaseCreditAmount;
    private static string Csv(string value) => $"\"{value.Replace("\"", "\"\"")}\"";
    private static string Amount(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private static FinanceExportFile File(string prefix, StringBuilder content) => new($"{prefix}-{DateTime.UtcNow:yyyyMMddHHmmss}.csv", Encoding.UTF8.GetBytes(content.ToString()), "text/csv");
    private sealed record AccountGroupKey(Guid AccountId, string AccountCode, string AccountName, AccountType AccountType);
    private sealed record ReportContext(Guid CompanyId, string CompanyName, string Currency, DateTime FromUtc, DateTime ToUtc);
}
