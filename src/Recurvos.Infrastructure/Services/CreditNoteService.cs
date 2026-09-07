using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.CreditNotes;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Templates;

namespace Recurvos.Infrastructure.Services;

public sealed class CreditNoteService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IEmailSender emailSender,
    IInvoiceStorage invoiceStorage) : ICreditNoteService
{
    public async Task<IReadOnlyCollection<CreditNoteDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        var notes = await dbContext.CreditNotes
            .Include(x => x.Lines)
            .Include(x => x.Invoice)
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
            .Include(x => x.Payments).ThenInclude(x => x.Refunds)
            .Include(x => x.CreditNotes).ThenInclude(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == request.InvoiceId, cancellationToken)
            ?? throw new InvalidOperationException("Invoice not found.");

        if (invoice.Customer is null)
        {
            throw new InvalidOperationException("Invoice customer not found.");
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            throw new InvalidOperationException("Voided invoices cannot receive credit notes.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new InvalidOperationException("Reason is required.");
        }

        if (request.Lines.Count == 0)
        {
            throw new InvalidOperationException("At least one credit note line is required.");
        }

        var previouslyCreditedByLine = invoice.CreditNotes
            .Where(note => note.Status == CreditNoteStatus.Issued)
            .SelectMany(note => note.Lines)
            .Where(line => line.InvoiceLineId.HasValue)
            .GroupBy(line => line.InvoiceLineId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(line => line.Quantity));
        var invoiceLines = invoice.LineItems.ToDictionary(line => line.Id);
        var selectedLineIds = new HashSet<Guid>();
        var lines = request.Lines.Select(line =>
        {
            if (!line.InvoiceLineId.HasValue || !invoiceLines.TryGetValue(line.InvoiceLineId.Value, out var sourceLine))
            {
                throw new InvalidOperationException("Each credit note line must reference an invoice line.");
            }

            if (!selectedLineIds.Add(sourceLine.Id))
            {
                throw new InvalidOperationException("An invoice line can only be credited once per credit note.");
            }

            var remainingQuantity = Math.Max(0m, sourceLine.Quantity - previouslyCreditedByLine.GetValueOrDefault(sourceLine.Id));
            if (line.Quantity <= 0m || line.Quantity > remainingQuantity)
            {
                throw new InvalidOperationException($"Credit quantity for {sourceLine.Description} cannot exceed the remaining quantity of {remainingQuantity:0.##}.");
            }

            var taxAmount = sourceLine.Quantity == 0m
                ? 0m
                : decimal.Round(sourceLine.TaxAmount * line.Quantity / sourceLine.Quantity, 2, MidpointRounding.AwayFromZero);
            var subtotal = sourceLine.UnitAmount * line.Quantity;
            return new CreditNoteLine
            {
                CompanyId = companyId,
                InvoiceLineId = sourceLine.Id,
                Description = sourceLine.Description,
                Quantity = line.Quantity,
                UnitAmount = sourceLine.UnitAmount,
                TaxAmount = taxAmount,
                LineTotal = subtotal + taxAmount
            };
        }).ToList();

        // Credit eligibility is independent of payment collection. A paid invoice
        // may still be credited; only issued credit notes consume this allowance.
        InvoicePaymentStateCalculator.Recalculate(invoice, invoice.Payments, invoice.CreditNotes);

        var subtotalReduction = lines.Sum(x => x.UnitAmount * x.Quantity);
        var taxReduction = lines.Sum(x => x.TaxAmount);
        var totalReduction = lines.Sum(x => x.LineTotal);
        var existingCredits = invoice.CreditNotes.Where(x => x.Status == CreditNoteStatus.Issued).Sum(x => x.TotalReduction);
        var eligibleAmount = Math.Max(0, invoice.Total - existingCredits);
        if (eligibleAmount <= 0)
        {
            throw new InvalidOperationException("This invoice has no remaining eligible amount for a credit note.");
        }

        if (totalReduction > eligibleAmount)
        {
            throw new InvalidOperationException($"Credit note amount cannot exceed the remaining eligible amount of {invoice.Currency} {eligibleAmount:0.00}.");
        }

        var issuedAtUtc = request.IssuedAtUtc.Kind == DateTimeKind.Utc ? request.IssuedAtUtc : request.IssuedAtUtc.ToUniversalTime();
        var creditNoteNumber = await GenerateCreditNoteNumberAsync(companyId, issuedAtUtc, cancellationToken);
        var creditNote = new CreditNote
        {
            CompanyId = companyId,
            InvoiceId = invoice.Id,
            CustomerId = invoice.CustomerId,
            CreditNoteNumber = creditNoteNumber,
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
        // Keep the tracked aggregate in sync before calculating the invoice state
        // and the post-credit document balance below.
        invoice.CreditNotes.Add(creditNote);
        InvoicePaymentStateCalculator.Recalculate(invoice, invoice.Payments, invoice.CreditNotes);
        dbContext.CustomerBalanceTransactions.Add(new CustomerBalanceTransaction
        {
            CompanyId = companyId,
            CustomerId = invoice.CustomerId,
            InvoiceId = invoice.Id,
            CreditNote = creditNote,
            Amount = totalReduction,
            Currency = invoice.Currency,
            Type = CustomerBalanceTransactionType.CreditNoteIssued,
            Description = $"Credit note {creditNoteNumber} against invoice {invoice.InvoiceNumber}",
            CreatedByUserId = currentUserService.UserId
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        var company = await dbContext.Companies
            .Include(x => x.InvoiceSettings)
            .FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
        var newOutstanding = invoice.AmountDue;
        var pdfContent = await BuildCreditNotePdfAsync(company, invoice, creditNote, newOutstanding, cancellationToken);
        creditNote.PdfPath = await invoiceStorage.SaveDocumentPdfAsync(companyId, creditNote.CreditNoteNumber, pdfContent, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        await TrySendCreditNoteEmailAsync(company, invoice, creditNote, newOutstanding, pdfContent, cancellationToken);
        await auditService.WriteAsync("credit-note.issued", nameof(CreditNote), creditNote.Id.ToString(), creditNote.CreditNoteNumber, cancellationToken);
        return Map(creditNote);
    }

    public async Task<CreditNotePdfFile?> DownloadAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        var creditNote = await dbContext.CreditNotes
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == id, cancellationToken);

        if (creditNote?.Invoice is null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(creditNote.PdfPath) && File.Exists(creditNote.PdfPath))
        {
            var existingContent = await File.ReadAllBytesAsync(creditNote.PdfPath, cancellationToken);
            return new CreditNotePdfFile($"{creditNote.CreditNoteNumber}.pdf", existingContent, "application/pdf");
        }

        var company = await dbContext.Companies
            .Include(x => x.InvoiceSettings)
            .FirstAsync(x => x.Id == creditNote.Invoice.CompanyId, cancellationToken);
        var issuedCreditsTotal = await dbContext.CreditNotes
            .Where(x => x.CompanyId == companyId && x.InvoiceId == creditNote.InvoiceId && x.Status == CreditNoteStatus.Issued)
            .SumAsync(x => x.TotalReduction, cancellationToken);
        var newOutstanding = Math.Max(0, creditNote.Invoice.Total - issuedCreditsTotal);
        var pdfContent = await BuildCreditNotePdfAsync(company, creditNote.Invoice, creditNote, newOutstanding, cancellationToken);
        creditNote.PdfPath = await invoiceStorage.SaveDocumentPdfAsync(companyId, creditNote.CreditNoteNumber, pdfContent, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new CreditNotePdfFile($"{creditNote.CreditNoteNumber}.pdf", pdfContent, "application/pdf");
    }

    internal static CreditNoteDto Map(CreditNote creditNote) =>
        new(
            creditNote.Id,
            creditNote.InvoiceId,
            creditNote.Invoice?.InvoiceNumber,
            creditNote.CustomerId,
            creditNote.CreditNoteNumber,
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

    private async Task<string> GenerateCreditNoteNumberAsync(Guid companyId, DateTime issuedAtUtc, CancellationToken cancellationToken)
    {
        var settings = await EnsureInvoiceSettingsAsync(companyId, cancellationToken);
        var year = issuedAtUtc.Year;
        if (settings.CreditNoteResetYearly && settings.CreditNoteLastResetYear != year)
        {
            settings.CreditNoteNextNumber = 1;
            settings.CreditNoteLastResetYear = year;
        }

        var customPattern = settings.CreditNotePrefix.Contains('{') ? settings.CreditNotePrefix : null;
        var creditNoteNumber = InvoiceNumberFormatter.Format(
            issuedAtUtc,
            settings.CreditNoteNextNumber,
            customPattern: customPattern,
            prefix: customPattern is null ? settings.CreditNotePrefix : "CN",
            padding: settings.CreditNotePadding);
        settings.CreditNoteNextNumber += 1;
        return creditNoteNumber;
    }

    private async Task<byte[]> BuildCreditNotePdfAsync(Company company, Invoice invoice, CreditNote creditNote, decimal newOutstanding, CancellationToken cancellationToken)
        => LocalInvoiceStorage.CreatePdf(
            company.Name,
            company.RegistrationNumber,
            company.Email,
            company.Phone,
            company.Address,
            company.InvoiceSettings?.ShowCompanyAddressOnInvoice ?? true,
            company.LogoPath is null ? null : await File.ReadAllBytesAsync(company.LogoPath, cancellationToken).ConfigureAwait(false),
            bankName: null,
            bankAccountName: null,
            bankAccount: null,
            paymentLink: null,
            paymentQr: null,
            invoice.IsTaxEnabled,
            invoice.TaxName,
            invoice.TaxRate,
            invoice.TaxRegistrationNo,
            invoice.Customer?.Name ?? string.Empty,
            invoice.Customer?.Email,
            invoice.Customer?.BillingAddress,
            creditNote.CreditNoteNumber,
            creditNote.IssuedAtUtc,
            creditNote.IssuedAtUtc,
            invoice.PeriodStartUtc,
            invoice.PeriodEndUtc,
            creditNote.Lines.Select(line => (line.Description, line.Quantity, line.UnitAmount, line.LineTotal)),
            creditNote.SubtotalReduction,
            creditNote.Currency,
            paymentConfirmationLink: null,
            documentTitle: "CREDIT NOTE",
            documentNumberLabel: "Credit Note No",
            notes: $"Reason: {creditNote.Reason}\nNew outstanding: {creditNote.Currency} {newOutstanding:0.00}",
            systemGeneratedFlag: false,
            showDueDate: false,
            secondaryDocumentLabel: "Original Invoice",
            secondaryDocumentValue: invoice.InvoiceNumber,
            periodLabel: "Service Period");

    private async Task TrySendCreditNoteEmailAsync(Company company, Invoice invoice, CreditNote creditNote, decimal newOutstanding, byte[] pdfContent, CancellationToken cancellationToken)
    {
        if (invoice.Customer is null || string.IsNullOrWhiteSpace(invoice.Customer.Email))
        {
            return;
        }

        var body = EmailTemplateRenderer.RenderCreditNoteEmail(
            company.Name,
            invoice.Customer.Name,
            invoice.InvoiceNumber,
            creditNote.CreditNoteNumber,
            $"{creditNote.Currency} {creditNote.TotalReduction:0.00}",
            $"{creditNote.Currency} {newOutstanding:0.00}",
            creditNote.IssuedAtUtc.ToString("dd MMM yyyy"));

        await emailSender.SendAsync(
            invoice.Customer.Email.Trim(),
            $"Credit note {creditNote.CreditNoteNumber} for {invoice.InvoiceNumber}",
            body,
            [new EmailAttachment($"{creditNote.CreditNoteNumber}.pdf", pdfContent, "application/pdf")],
            logContext: new EmailLogContext(
                CompanyId: company.Id,
                NotificationType: "CreditNote",
                InvoiceId: invoice.Id,
                InvoiceNumber: invoice.InvoiceNumber,
                CustomerName: invoice.Customer.Name),
            cancellationToken: cancellationToken);
    }

    private async Task<CompanyInvoiceSettings> EnsureInvoiceSettingsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);
        if (settings is not null)
        {
            return settings;
        }

        settings = new CompanyInvoiceSettings
        {
            CompanyId = companyId,
            Prefix = "INV",
            NextNumber = 1,
            Padding = 4,
            ResetYearly = false,
            ReceiptPrefix = "RCT",
            ReceiptNextNumber = 1,
            ReceiptPadding = 4,
            ReceiptResetYearly = false,
            CreditNotePrefix = "CN",
            CreditNoteNextNumber = 1,
            CreditNotePadding = 4,
            CreditNoteResetYearly = false,
            PaymentDueDays = 7,
            ShowCompanyAddressOnInvoice = true,
            ShowCompanyAddressOnReceipt = true,
            AutoSendInvoices = true,
            CcSubscriberOnCustomerEmails = true,
            WhatsAppProvider = "generic_api",
            AutoCompressUploads = true,
            UploadMaxBytes = 2_000_000,
            UploadImageMaxDimension = 1600,
            UploadImageQuality = 80
        };

        await CompanyInvoiceSettingsCreation.ApplySubscriberPackageDefaultsAsync(dbContext, settings, cancellationToken);
        return await CompanyInvoiceSettingsCreation.AddOrGetExistingAsync(dbContext, settings, cancellationToken);
    }
}
