namespace Recurvos.Application.Finance;

public enum StatementAccountType
{
    Customer = 1,
    Supplier = 2,
}

public enum StatementRowSourceType
{
    OpeningBalance = 1,
    Invoice = 2,
    Payment = 3,
    CreditNote = 4,
    Refund = 5,
    PurchaseBill = 6,
    PurchasePayment = 7,
    PurchaseCreditNote = 8,
    PurchaseRefund = 9,
}

public sealed class StatementOfAccountQuery
{
    public Guid ContactId { get; set; }
    public StatementAccountType StatementType { get; set; } = StatementAccountType.Customer;
    public DateTime? FromDateUtc { get; set; }
    public DateTime? ToDateUtc { get; set; }
    // Preserved for forward compatibility. Most current transaction entities do not yet persist
    // transaction-level ContactPersonId references consistently, so the statement engine must
    // not attempt inferred filtering from this value until those references exist.
    public string? ContactPerson { get; set; }
    public bool IncludeOutstandingOnly { get; set; }
}

public sealed record StatementAgingSummaryDto(
    decimal Current,
    decimal Days1To30,
    decimal Days31To60,
    decimal Days61To90,
    decimal Days91Plus,
    decimal TotalOutstanding);

public sealed record StatementRowDto(
    string Id,
    StatementRowSourceType SourceType,
    Guid? SourceDocumentId,
    Guid? ReferenceDocumentId,
    DateTime DateUtc,
    DateTime? DueDateUtc,
    string DocumentNumber,
    string Description,
    decimal Debit,
    decimal Credit,
    decimal Balance,
    decimal OutstandingAmount,
    bool IsOutstanding,
    string CurrencyCode,
    bool IsOpeningBalance);

public sealed record StatementOfAccountDto(
    Guid ContactId,
    string ContactName,
    string ContactType,
    StatementAccountType StatementType,
    string CurrencyCode,
    decimal OpeningBalance,
    decimal ClosingBalance,
    bool HasOpeningBalance,
    bool HasMixedCurrencies,
    IReadOnlyCollection<string> CurrencyCodes,
    StatementAgingSummaryDto Aging,
    IReadOnlyCollection<StatementRowDto> Rows);

public interface IStatementService
{
    Task<StatementOfAccountDto> GetAsync(StatementOfAccountQuery query, CancellationToken cancellationToken = default);
}
