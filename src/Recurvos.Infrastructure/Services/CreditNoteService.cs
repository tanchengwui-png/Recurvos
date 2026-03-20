using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.CreditNotes;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class CreditNoteService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService) : ICreditNoteService
{
    public async Task<IReadOnlyCollection<CreditNoteDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        var notes = await dbContext.CreditNotes
            .Include(x => x.Lines)
            .Where(x => x.CompanyId == companyId)
            .OrderByDescending(x => x.IssuedAtUtc)
            .ToListAsync(cancellationToken);

        return notes.Select(Map).ToList();
    }

    public async Task<CreditNoteDto> CreateAsync(CreateCreditNoteRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .Include(x => x.CreditNotes).ThenInclude(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == request.InvoiceId, cancellationToken)
            ?? throw new InvalidOperationException("Invoice not found.");

        if (invoice.Customer is null)
        {
            throw new InvalidOperationException("Invoice customer not found.");
        }

        if (invoice.Status == InvoiceStatus.Open || invoice.AmountPaid <= 0)
        {
            throw new InvalidOperationException("Credit notes are only available after payment. Use void for unpaid invoices.");
        }

        var lines = request.Lines.Select(line =>
        {
            var subtotal = line.UnitAmount * line.Quantity;
            return new CreditNoteLine
            {
                CompanyId = companyId,
                InvoiceLineId = line.InvoiceLineId,
                Description = line.Description.Trim(),
                Quantity = line.Quantity,
                UnitAmount = line.UnitAmount,
                TaxAmount = line.TaxAmount,
                LineTotal = subtotal + line.TaxAmount
            };
        }).ToList();

        var subtotalReduction = lines.Sum(x => x.UnitAmount * x.Quantity);
        var taxReduction = lines.Sum(x => x.TaxAmount);
        var totalReduction = lines.Sum(x => x.LineTotal);
        var existingCredits = invoice.CreditNotes.Where(x => x.Status == CreditNoteStatus.Issued).Sum(x => x.TotalReduction);
        var eligibleAmount = Math.Max(0, invoice.Total - existingCredits);
        if (totalReduction > eligibleAmount)
        {
            throw new InvalidOperationException("Credit note total cannot exceed invoice remaining eligible amount.");
        }

        var issuedAtUtc = request.IssuedAtUtc.Kind == DateTimeKind.Utc ? request.IssuedAtUtc : request.IssuedAtUtc.ToUniversalTime();
        var creditNote = new CreditNote
        {
            CompanyId = companyId,
            InvoiceId = invoice.Id,
            CustomerId = invoice.CustomerId,
            Currency = invoice.Currency,
            SubtotalReduction = subtotalReduction,
            TaxReduction = taxReduction,
            TotalReduction = totalReduction,
            Reason = request.Reason.Trim(),
            Status = CreditNoteStatus.Issued,
            IssuedAtUtc = issuedAtUtc,
            CreatedByUserId = currentUserService.UserId,
            Lines = lines
        };

        dbContext.CreditNotes.Add(creditNote);
        dbContext.CustomerBalanceTransactions.Add(new CustomerBalanceTransaction
        {
            CompanyId = companyId,
            CustomerId = invoice.CustomerId,
            InvoiceId = invoice.Id,
            CreditNote = creditNote,
            Amount = totalReduction,
            Currency = invoice.Currency,
            Type = CustomerBalanceTransactionType.CreditNoteIssued,
            Description = $"Credit note against invoice {invoice.InvoiceNumber}",
            CreatedByUserId = currentUserService.UserId
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("credit-note.issued", nameof(CreditNote), creditNote.Id.ToString(), invoice.InvoiceNumber, cancellationToken);
        return Map(creditNote);
    }

    internal static CreditNoteDto Map(CreditNote creditNote) =>
        new(
            creditNote.Id,
            creditNote.InvoiceId,
            creditNote.CustomerId,
            creditNote.Currency,
            creditNote.SubtotalReduction,
            creditNote.TaxReduction,
            creditNote.TotalReduction,
            creditNote.Reason,
            creditNote.Status,
            creditNote.IssuedAtUtc,
            creditNote.CreatedAtUtc,
            creditNote.CreatedByUserId,
            creditNote.Lines.Select(line => new CreditNoteLineDto(line.Id, line.InvoiceLineId, line.Description, line.Quantity, line.UnitAmount, line.TaxAmount, line.LineTotal)).ToList());

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
}
