using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Finance;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class AccountingExportService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService) : IAccountingExportService
{
    public async Task<FinanceExportFile> ExportAsync(FinanceExportRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var dateRange = ResolveDateRange(request.StartDateUtc, request.EndDateUtc);

        return request.DocumentType switch
        {
            FinanceExportDocumentType.Invoices => await ExportInvoicesAsync(companyId, dateRange.StartUtc, dateRange.EndUtc, cancellationToken),
            FinanceExportDocumentType.Payments => await ExportPaymentsAsync(companyId, dateRange.StartUtc, dateRange.EndUtc, cancellationToken),
            FinanceExportDocumentType.Refunds => await ExportRefundsAsync(companyId, dateRange.StartUtc, dateRange.EndUtc, cancellationToken),
            FinanceExportDocumentType.CreditNotes => await ExportCreditNotesAsync(companyId, dateRange.StartUtc, dateRange.EndUtc, cancellationToken),
            _ => throw new InvalidOperationException("Unsupported finance export type.")
        };
    }

    private async Task<FinanceExportFile> ExportInvoicesAsync(Guid companyId, DateTime startUtc, DateTime endUtc, CancellationToken cancellationToken)
    {
        var invoices = await dbContext.Invoices
            .Include(x => x.Customer)
            .Where(x => x.CompanyId == companyId && x.IssueDateUtc >= startUtc && x.IssueDateUtc < endUtc)
            .OrderBy(x => x.IssueDateUtc)
            .ToListAsync(cancellationToken);

        var csv = BuildCsv(invoices.Select(invoice => new FinanceCsvRow(
            invoice.InvoiceNumber,
            invoice.Customer?.ExternalReference ?? string.Empty,
            invoice.Customer?.Name ?? string.Empty,
            invoice.Currency,
            invoice.Subtotal,
            0m,
            invoice.Total,
            invoice.AmountPaid,
            invoice.AmountPaid > 0 ? invoice.UpdatedAtUtc ?? invoice.CreatedAtUtc : (DateTime?)null,
            string.Empty,
            ResolveInvoiceStatus(invoice))));

        foreach (var invoice in invoices)
        {
            invoice.AccountingExportedAtUtc = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return CreateFile("invoices", csv);
    }

    private async Task<FinanceExportFile> ExportPaymentsAsync(Guid companyId, DateTime startUtc, DateTime endUtc, CancellationToken cancellationToken)
    {
        var payments = await dbContext.Payments
            .Include(x => x.Invoice)!.ThenInclude(x => x!.Customer)
            .Include(x => x.Refunds)
            .Where(x => x.CompanyId == companyId && ((x.PaidAtUtc ?? x.CreatedAtUtc) >= startUtc) && ((x.PaidAtUtc ?? x.CreatedAtUtc) < endUtc))
            .OrderBy(x => x.PaidAtUtc ?? x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var csv = BuildCsv(payments.Select(payment => new FinanceCsvRow(
            $"PAY-{payment.Id.ToString()[..8].ToUpperInvariant()}",
            payment.Invoice?.Customer?.ExternalReference ?? string.Empty,
            payment.Invoice?.Customer?.Name ?? string.Empty,
            payment.Currency,
            payment.Amount,
            0m,
            payment.Amount,
            payment.Amount - payment.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount),
            payment.PaidAtUtc,
            string.Join(" | ", new[] { payment.ExternalPaymentId, payment.GatewayTransactionId, payment.GatewaySettlementRef }.Where(x => !string.IsNullOrWhiteSpace(x))),
            payment.Status.ToString())));

        return CreateFile("payments", csv);
    }

    private async Task<FinanceExportFile> ExportRefundsAsync(Guid companyId, DateTime startUtc, DateTime endUtc, CancellationToken cancellationToken)
    {
        var refunds = await dbContext.Refunds
            .Include(x => x.Invoice)!.ThenInclude(x => x!.Customer)
            .Where(x => x.CompanyId == companyId && x.CreatedAtUtc >= startUtc && x.CreatedAtUtc < endUtc)
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var csv = BuildCsv(refunds.Select(refund => new FinanceCsvRow(
            $"REF-{refund.Id.ToString()[..8].ToUpperInvariant()}",
            refund.Invoice?.Customer?.ExternalReference ?? string.Empty,
            refund.Invoice?.Customer?.Name ?? string.Empty,
            refund.Currency,
            refund.Amount,
            0m,
            refund.Amount,
            0m,
            null,
            refund.ExternalRefundId ?? string.Empty,
            refund.Status.ToString())));

        return CreateFile("refunds", csv);
    }

    private async Task<FinanceExportFile> ExportCreditNotesAsync(Guid companyId, DateTime startUtc, DateTime endUtc, CancellationToken cancellationToken)
    {
        var creditNotes = await dbContext.CreditNotes
            .Include(x => x.Customer)
            .Where(x => x.CompanyId == companyId && x.IssuedAtUtc >= startUtc && x.IssuedAtUtc < endUtc)
            .OrderBy(x => x.IssuedAtUtc)
            .ToListAsync(cancellationToken);

        var csv = BuildCsv(creditNotes.Select(note => new FinanceCsvRow(
            $"CN-{note.Id.ToString()[..8].ToUpperInvariant()}",
            note.Customer?.ExternalReference ?? string.Empty,
            note.Customer?.Name ?? string.Empty,
            note.Currency,
            note.SubtotalReduction,
            note.TaxReduction,
            note.TotalReduction,
            0m,
            null,
            note.InvoiceId.ToString(),
            note.Status.ToString())));

        return CreateFile("credit-notes", csv);
    }

    private static string BuildCsv(IEnumerable<FinanceCsvRow> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine("document no,customer code,customer name,currency,subtotal,tax,total,paid amount,payment date,external reference,status");

        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(",",
                Escape(row.DocumentNo),
                Escape(row.CustomerCode),
                Escape(row.CustomerName),
                Escape(row.Currency),
                FormatAmount(row.Subtotal),
                FormatAmount(row.Tax),
                FormatAmount(row.Total),
                FormatAmount(row.PaidAmount),
                Escape(row.PaymentDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty),
                Escape(row.ExternalReference),
                Escape(row.Status)));
        }

        return builder.ToString();
    }

    private static FinanceExportFile CreateFile(string prefix, string csv)
    {
        var fileName = $"{prefix}-{DateTime.UtcNow:yyyyMMddHHmmss}.csv";
        return new FinanceExportFile(fileName, Encoding.UTF8.GetBytes(csv), "text/csv");
    }

    private static string Escape(string value)
    {
        var safe = value.Replace("\"", "\"\"");
        return $"\"{safe}\"";
    }

    private static string FormatAmount(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);

    private static (DateTime StartUtc, DateTime EndUtc) ResolveDateRange(DateTime? startDateUtc, DateTime? endDateUtc)
    {
        var startUtc = startDateUtc?.ToUniversalTime() ?? DateTime.UtcNow.Date.AddDays(-30);
        var endUtc = endDateUtc?.ToUniversalTime() ?? DateTime.UtcNow.Date.AddDays(1);
        return endUtc <= startUtc ? (startUtc, startUtc.AddDays(1)) : (startUtc, endUtc);
    }

    private static string ResolveInvoiceStatus(Invoice invoice)
    {
        if (invoice.Status == InvoiceStatus.Paid)
        {
            return "Paid";
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            return "Void";
        }

        if (invoice.AmountDue > 0 && invoice.DueDateUtc.Date < DateTime.UtcNow.Date)
        {
            return "Overdue";
        }

        return invoice.Status.ToString();
    }

    private sealed record FinanceCsvRow(
        string DocumentNo,
        string CustomerCode,
        string CustomerName,
        string Currency,
        decimal Subtotal,
        decimal Tax,
        decimal Total,
        decimal PaidAmount,
        DateTime? PaymentDate,
        string ExternalReference,
        string Status);
}
