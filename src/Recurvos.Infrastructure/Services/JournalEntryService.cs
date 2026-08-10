using System.Data;
using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Accounting;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class JournalEntryService(AppDbContext db, ICurrentUserService currentUser, IAuditService audit) : IJournalEntryService
{
    public async Task<IReadOnlyCollection<JournalEntryListItemDto>> GetAsync(JournalEntryListQuery query, CancellationToken ct = default)
    {
        var items = db.JournalEntries.Include(x => x.Company).Include(x => x.Lines)
            .Where(x => OwnedCompanyIds().Contains(x.CompanyId));
        if (query.CompanyId.HasValue) items = items.Where(x => x.CompanyId == query.CompanyId);
        if (query.Status.HasValue) items = items.Where(x => x.Status == query.Status);
        if (query.FromDateUtc.HasValue) items = items.Where(x => x.JournalDateUtc >= query.FromDateUtc.Value.ToUniversalTime());
        if (query.ToDateUtc.HasValue) items = items.Where(x => x.JournalDateUtc <= query.ToDateUtc.Value.ToUniversalTime());
        if (!string.IsNullOrWhiteSpace(query.Search)) { var term = query.Search.Trim(); items = items.Where(x => x.JournalNumber.Contains(term) || x.ReferenceNo.Contains(term) || x.Description.Contains(term)); }
        return (await items.OrderByDescending(x => x.JournalDateUtc).ThenByDescending(x => x.CreatedAtUtc).ToListAsync(ct)).Select(MapList).ToList();
    }

    public async Task<JournalEntryDetailsDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var item = await LoadOwnedAsync(id, ct);
        return item is null ? null : MapDetails(item);
    }

    public async Task<JournalEntryDetailsDto> CreateAsync(JournalEntryUpsertRequest request, CancellationToken ct = default)
    {
        var companyId = await ValidateRequestAsync(request, null, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var company = await db.Companies.FirstAsync(x => x.Id == companyId && x.Id == ActiveCompanyId, ct);
        var item = new JournalEntry { CompanyId = companyId, JournalNumber = $"JE-{company.JournalEntrySequence++.ToString().PadLeft(6, '0')}", JournalDateUtc = request.JournalDateUtc.ToUniversalTime(), Currency = request.Currency.Trim().ToUpperInvariant(), ExchangeRate = request.ExchangeRate, ReferenceNo = request.ReferenceNo.Trim(), Description = request.Description.Trim() };
        item.Lines = await BuildLinesAsync(companyId, request, ct);
        db.JournalEntries.Add(item);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        await audit.WriteAsync("journal-entry.created", nameof(JournalEntry), item.Id.ToString(), companyId, item.JournalNumber, ct);
        return MapDetails(await LoadRequiredAsync(item.Id, ct));
    }

    public async Task<JournalEntryDetailsDto?> UpdateAsync(Guid id, JournalEntryUpsertRequest request, CancellationToken ct = default)
    {
        var item = await LoadOwnedAsync(id, ct); if (item is null) return null;
        if (item.Status != JournalEntryStatus.Draft) throw new InvalidOperationException("Posted, reversed, or cancelled journal entries are locked.");
        var companyId = await ValidateRequestAsync(request, item.CompanyId, ct);
        if (companyId != item.CompanyId) throw new InvalidOperationException("Journal entry company cannot be changed.");
        item.JournalDateUtc = request.JournalDateUtc.ToUniversalTime(); item.Currency = request.Currency.Trim().ToUpperInvariant(); item.ExchangeRate = request.ExchangeRate; item.ReferenceNo = request.ReferenceNo.Trim(); item.Description = request.Description.Trim(); item.UpdatedAtUtc = DateTime.UtcNow;
        db.JournalEntryLines.RemoveRange(item.Lines); item.Lines = await BuildLinesAsync(item.CompanyId, request, ct);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("journal-entry.updated", nameof(JournalEntry), item.Id.ToString(), item.CompanyId, item.JournalNumber, ct);
        return MapDetails(await LoadRequiredAsync(id, ct));
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var item = await LoadOwnedAsync(id, ct); if (item is null) return false;
        if (item.Status != JournalEntryStatus.Draft) throw new InvalidOperationException("Only draft journal entries can be deleted.");
        db.JournalEntries.Remove(item); await db.SaveChangesAsync(ct);
        await audit.WriteAsync("journal-entry.deleted", nameof(JournalEntry), item.Id.ToString(), item.CompanyId, item.JournalNumber, ct); return true;
    }

    public async Task<JournalEntryDetailsDto?> PostAsync(Guid id, CancellationToken ct = default)
    {
        var item = await LoadOwnedAsync(id, ct); if (item is null) return null;
        if (item.Status != JournalEntryStatus.Draft) throw new InvalidOperationException("Only draft journal entries can be posted.");
        EnsureBalanced(item.Lines.ToList());
        item.Status = JournalEntryStatus.Posted; item.PostedAtUtc = DateTime.UtcNow; item.PostedByUserId = UserId; item.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct); await audit.WriteAsync("journal-entry.posted", nameof(JournalEntry), item.Id.ToString(), item.CompanyId, item.JournalNumber, ct);
        return MapDetails(item);
    }

    public async Task<JournalEntryDetailsDto?> ReverseAsync(Guid id, CancellationToken ct = default)
    {
        var source = await LoadOwnedAsync(id, ct); if (source is null) return null;
        if (source.Status != JournalEntryStatus.Posted || source.ReversedByJournalEntryId.HasValue) throw new InvalidOperationException("Only an unreversed posted journal entry can be reversed.");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var company = await db.Companies.FirstAsync(x => x.Id == source.CompanyId && x.Id == ActiveCompanyId, ct);
        var reversal = new JournalEntry { CompanyId = source.CompanyId, JournalNumber = $"JE-{company.JournalEntrySequence++.ToString().PadLeft(6, '0')}", JournalDateUtc = DateTime.UtcNow.Date, Currency = source.Currency, ExchangeRate = source.ExchangeRate, ReferenceNo = source.JournalNumber, Description = $"Reversal of {source.JournalNumber}", Status = JournalEntryStatus.Posted, ReversesJournalEntryId = source.Id, PostedAtUtc = DateTime.UtcNow, PostedByUserId = UserId };
        reversal.Lines = source.Lines.OrderBy(x => x.SortOrder).Select((x, i) => new JournalEntryLine { SortOrder = i + 1, AccountId = x.AccountId, AccountCodeSnapshot = x.AccountCodeSnapshot, AccountNameSnapshot = x.AccountNameSnapshot, Description = x.Description, DebitAmount = x.CreditAmount, CreditAmount = x.DebitAmount, BaseDebitAmount = x.BaseCreditAmount, BaseCreditAmount = x.BaseDebitAmount }).ToList();
        source.Status = JournalEntryStatus.Reversed; source.ReversedByJournalEntryId = reversal.Id; source.ReversedByJournalEntry = reversal; source.UpdatedAtUtc = DateTime.UtcNow;
        db.JournalEntries.Add(reversal); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        await audit.WriteAsync("journal-entry.reversed", nameof(JournalEntry), source.Id.ToString(), source.CompanyId, $"{source.JournalNumber}->{reversal.JournalNumber}", ct);
        return MapDetails(await LoadRequiredAsync(reversal.Id, ct));
    }

    public async Task<JournalEntryDetailsDto?> CancelAsync(Guid id, CancellationToken ct = default)
    {
        var item = await LoadOwnedAsync(id, ct); if (item is null) return null;
        if (item.Status != JournalEntryStatus.Draft) throw new InvalidOperationException("Only draft journal entries can be cancelled.");
        item.Status = JournalEntryStatus.Cancelled; item.CancelledAtUtc = DateTime.UtcNow; item.CancelledByUserId = UserId; item.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct); await audit.WriteAsync("journal-entry.cancelled", nameof(JournalEntry), item.Id.ToString(), item.CompanyId, item.JournalNumber, ct); return MapDetails(item);
    }

    private async Task<Guid> ValidateRequestAsync(JournalEntryUpsertRequest request, Guid? existingCompanyId, CancellationToken ct)
    {
        if (!request.CompanyId.HasValue || request.CompanyId == Guid.Empty) throw new InvalidOperationException("Company is required.");
        var companyId = request.CompanyId.Value;
        if (!await OwnedCompanyIds().AnyAsync(x => x == companyId, ct)) throw new UnauthorizedAccessException();
        if (string.IsNullOrWhiteSpace(request.Description)) throw new InvalidOperationException("Description is required.");
        if (request.Lines.Count < 2) throw new InvalidOperationException("A journal entry requires at least two lines.");
        if (request.ExchangeRate <= 0) throw new InvalidOperationException("Exchange rate must be greater than zero.");
        var currency = request.Currency.Trim().ToUpperInvariant();
        if (currency.Length != 3 || !await db.CurrencyDefinitions.AnyAsync(x => x.CompanyId == companyId && x.Code == currency && x.IsActive, ct)) throw new InvalidOperationException("Select an active currency.");
        EnsureBalanced(request.Lines.Select(x => new JournalEntryLine { DebitAmount = x.DebitAmount, CreditAmount = x.CreditAmount }).ToList());
        return companyId;
    }

    private async Task<List<JournalEntryLine>> BuildLinesAsync(Guid companyId, JournalEntryUpsertRequest request, CancellationToken ct)
    {
        var ids = request.Lines.Select(x => x.AccountId ?? Guid.Empty).ToList();
        if (ids.Any(x => x == Guid.Empty)) throw new InvalidOperationException("Select an account for every line.");
        var accounts = await db.Accounts.Where(x => x.CompanyId == companyId && ids.Contains(x.Id) && x.IsActive && x.AllowManualEntries).ToDictionaryAsync(x => x.Id, ct);
        if (accounts.Count != ids.Distinct().Count()) throw new InvalidOperationException("Every account must be active, manual-entry enabled, and belong to the journal company.");
        return request.Lines.Select((x, index) => { var account = accounts[x.AccountId!.Value]; return new JournalEntryLine { SortOrder = index + 1, AccountId = account.Id, AccountCodeSnapshot = account.Code, AccountNameSnapshot = account.Name, Description = x.Description.Trim(), DebitAmount = Math.Round(x.DebitAmount, 2), CreditAmount = Math.Round(x.CreditAmount, 2), BaseDebitAmount = Math.Round(x.DebitAmount * request.ExchangeRate, 2), BaseCreditAmount = Math.Round(x.CreditAmount * request.ExchangeRate, 2) }; }).ToList();
    }

    private static void EnsureBalanced(IReadOnlyCollection<JournalEntryLine> lines)
    {
        if (lines.Count < 2 || lines.Any(x => x.DebitAmount < 0 || x.CreditAmount < 0 || (x.DebitAmount > 0 && x.CreditAmount > 0) || (x.DebitAmount == 0 && x.CreditAmount == 0))) throw new InvalidOperationException("Each line must contain either a positive debit or a positive credit.");
        if (Math.Round(lines.Sum(x => x.DebitAmount), 2) != Math.Round(lines.Sum(x => x.CreditAmount), 2)) throw new InvalidOperationException("Total debits must equal total credits.");
    }
    private Guid UserId => currentUser.UserId ?? throw new UnauthorizedAccessException();
    private Guid ActiveCompanyId => currentUser.CompanyId ?? throw new UnauthorizedAccessException();
    private IQueryable<Guid> OwnedCompanyIds() => db.Companies.Where(x => x.Id == ActiveCompanyId).Select(x => x.Id);
    private Task<JournalEntry?> LoadOwnedAsync(Guid id, CancellationToken ct) => db.JournalEntries.Include(x => x.Company).Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && OwnedCompanyIds().Contains(x.CompanyId), ct);
    private async Task<JournalEntry> LoadRequiredAsync(Guid id, CancellationToken ct) => await LoadOwnedAsync(id, ct) ?? throw new InvalidOperationException("Journal entry was not found.");
    private static JournalEntryListItemDto MapList(JournalEntry x) => new(x.Id, x.CompanyId, x.Company?.Name ?? "", x.JournalNumber, x.JournalDateUtc, x.Currency, x.ExchangeRate, x.ReferenceNo, x.Description, x.Lines.Sum(l => l.DebitAmount), x.Lines.Sum(l => l.CreditAmount), x.Status, x.ReversesJournalEntryId, x.ReversedByJournalEntryId);
    private static JournalEntryDetailsDto MapDetails(JournalEntry x) => new(x.Id, x.CompanyId, x.Company?.Name ?? "", x.JournalNumber, x.JournalDateUtc, x.Currency, x.ExchangeRate, x.ReferenceNo, x.Description, x.Status, x.ReversesJournalEntryId, x.ReversedByJournalEntryId, x.CreatedAtUtc, x.UpdatedAtUtc, x.PostedAtUtc, x.Lines.OrderBy(l => l.SortOrder).Select(l => new JournalEntryLineDto(l.Id, l.SortOrder, l.AccountId, l.AccountCodeSnapshot, l.AccountNameSnapshot, l.Description, l.DebitAmount, l.CreditAmount, l.BaseDebitAmount, l.BaseCreditAmount)).ToList());
}
