using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.CreditNotes;

public sealed class CreateCreditNoteLineRequest
{
    public Guid? InvoiceLineId { get; set; }

    [Required, MaxLength(250)]
    public string Description { get; set; } = string.Empty;

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    [Range(typeof(decimal), "0.00", "9999999999999999")]
    public decimal UnitAmount { get; set; }

    [Range(typeof(decimal), "0.00", "9999999999999999")]
    public decimal TaxAmount { get; set; }
}

public sealed class CreateCreditNoteRequest
{
    [Required]
    public Guid InvoiceId { get; set; }

    [Required, MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;

    [Required]
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;

    [Required, MinLength(1)]
    public List<CreateCreditNoteLineRequest> Lines { get; set; } = new();
}

public sealed record CreditNoteLineDto(
    Guid Id,
    Guid? InvoiceLineId,
    string Description,
    int Quantity,
    decimal UnitAmount,
    decimal TaxAmount,
    decimal LineTotal);

public sealed record CreditNoteDto(
    Guid Id,
    Guid InvoiceId,
    Guid CustomerId,
    string Currency,
    decimal SubtotalReduction,
    decimal TaxReduction,
    decimal TotalReduction,
    string Reason,
    CreditNoteStatus Status,
    DateTime IssuedAtUtc,
    DateTime CreatedAtUtc,
    Guid? CreatedByUserId,
    IReadOnlyCollection<CreditNoteLineDto> Lines);

public interface ICreditNoteService
{
    Task<IReadOnlyCollection<CreditNoteDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<CreditNoteDto> CreateAsync(CreateCreditNoteRequest request, CancellationToken cancellationToken = default);
}
