using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Accounting;

public sealed class JournalEntryLineRequest
{
    [Required] public Guid? AccountId { get; set; }
    [MaxLength(1000)] public string Description { get; set; } = string.Empty;
    [Range(typeof(decimal), "0", "9999999999999999")] public decimal DebitAmount { get; set; }
    [Range(typeof(decimal), "0", "9999999999999999")] public decimal CreditAmount { get; set; }
}

public sealed class JournalEntryUpsertRequest
{
    // Retained for compatibility; the active workspace is authoritative.
    [Required] public Guid? CompanyId { get; set; }
    [Required] public DateTime JournalDateUtc { get; set; }
    [Required, MaxLength(3)] public string Currency { get; set; } = "MYR";
    [Range(typeof(decimal), "0.00000001", "9999999999999999")] public decimal ExchangeRate { get; set; } = 1m;
    [MaxLength(100)] public string ReferenceNo { get; set; } = string.Empty;
    [Required, MaxLength(1000)] public string Description { get; set; } = string.Empty;
    [Required, MinLength(2)] public List<JournalEntryLineRequest> Lines { get; set; } = new();
}

public sealed class JournalEntryListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public JournalEntryStatus? Status { get; set; }
    public DateTime? FromDateUtc { get; set; }
    public DateTime? ToDateUtc { get; set; }
}

public sealed record JournalEntryLineDto(Guid Id, int SortOrder, Guid AccountId, string AccountCode, string AccountName, string Description, decimal DebitAmount, decimal CreditAmount, decimal BaseDebitAmount, decimal BaseCreditAmount);
public sealed record JournalEntryListItemDto(Guid Id, Guid CompanyId, string CompanyName, string JournalNumber, DateTime JournalDateUtc, string Currency, decimal ExchangeRate, string ReferenceNo, string Description, decimal TotalDebit, decimal TotalCredit, JournalEntryStatus Status, Guid? ReversesJournalEntryId, Guid? ReversedByJournalEntryId);
public sealed record JournalEntryDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string JournalNumber, DateTime JournalDateUtc, string Currency, decimal ExchangeRate, string ReferenceNo, string Description, JournalEntryStatus Status, Guid? ReversesJournalEntryId, Guid? ReversedByJournalEntryId, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc, DateTime? PostedAtUtc, IReadOnlyCollection<JournalEntryLineDto> Lines);

public interface IJournalEntryService
{
    Task<IReadOnlyCollection<JournalEntryListItemDto>> GetAsync(JournalEntryListQuery query, CancellationToken cancellationToken = default);
    Task<JournalEntryDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<JournalEntryDetailsDto> CreateAsync(JournalEntryUpsertRequest request, CancellationToken cancellationToken = default);
    Task<JournalEntryDetailsDto?> UpdateAsync(Guid id, JournalEntryUpsertRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<JournalEntryDetailsDto?> PostAsync(Guid id, CancellationToken cancellationToken = default);
    Task<JournalEntryDetailsDto?> ReverseAsync(Guid id, CancellationToken cancellationToken = default);
    Task<JournalEntryDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default);
}
