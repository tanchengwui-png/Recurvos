using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Finance;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class StatementService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService) : IStatementService
{
    public async Task<StatementOfAccountDto> GetAsync(StatementOfAccountQuery query, CancellationToken cancellationToken = default)
    {
        var contact = await dbContext.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == query.ContactId, cancellationToken)
            ?? throw new InvalidOperationException("The selected contact could not be found.");

        ValidateStatementType(contact, query.StatementType);

        // TODO(statement-contact-person-tracking):
        // Add ContactPersonId references to quotations, sales orders, delivery orders, invoices,
        // credit notes, purchase orders, GRNs, bills, purchase credit notes, payments, and
        // purchase payments. Once those document-level relationships exist consistently, apply
        // query.ContactPerson as a true transaction filter here. Until then we preserve the
        // request contract and return the normal statement results without inferred filtering.

        var ownedCompanyIds = await OwnedCompanyIdsQuery().ToListAsync(cancellationToken);
        if (ownedCompanyIds.Count == 0)
        {
            return BuildEmpty(contact, query.StatementType);
        }

        var fromUtc = query.FromDateUtc?.ToUniversalTime();
        var toUtc = query.ToDateUtc?.ToUniversalTime();

        return query.StatementType == StatementAccountType.Supplier
            ? await BuildSupplierStatementAsync(contact, ownedCompanyIds, fromUtc, toUtc, query.IncludeOutstandingOnly, cancellationToken)
            : await BuildCustomerStatementAsync(contact, ownedCompanyIds, fromUtc, toUtc, query.IncludeOutstandingOnly, cancellationToken);
    }

    private async Task<StatementOfAccountDto> BuildCustomerStatementAsync(Customer contact, IReadOnlyCollection<Guid> ownedCompanyIds, DateTime? fromUtc, DateTime? toUtc, bool includeOutstandingOnly, CancellationToken cancellationToken)
    {
        var outstandingInvoices = await dbContext.Invoices
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.CustomerId == contact.Id
                && x.Status != InvoiceStatus.Draft
                && x.Status != InvoiceStatus.Voided
                && x.AmountDue > 0)
            .Select(x => new AgingDocument(
                x.Id,
                x.DueDateUtc,
                x.AmountDue,
                x.Currency,
                x.InvoiceNumber))
            .ToListAsync(cancellationToken);

        var outstandingInvoiceIds = outstandingInvoices.Select(x => x.DocumentId).ToHashSet();

        var invoices = await dbContext.Invoices
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.CustomerId == contact.Id
                && x.Status != InvoiceStatus.Draft
                && x.Status != InvoiceStatus.Voided)
            .Select(x => new CustomerInvoiceEntry(
                x.Id,
                x.IssueDateUtc,
                x.DueDateUtc,
                x.InvoiceNumber,
                x.Total,
                x.AmountDue,
                x.Currency))
            .ToListAsync(cancellationToken);

        var invoiceLookup = invoices.ToDictionary(
            x => x.Id,
            x => new
            {
                x.Id,
                x.DocumentNumber
            });

        var payments = await dbContext.Payments
            .AsNoTracking()
            .Where(x => x.Invoice != null
                && ownedCompanyIds.Contains(x.CompanyId)
                && x.Invoice.CustomerId == contact.Id
                && (x.Status == PaymentStatus.Succeeded || x.Status == PaymentStatus.Refunded)
                && x.PaidAtUtc.HasValue)
            .Select(x => new CustomerPaymentEntry(
                x.Id,
                x.InvoiceId,
                x.PaidAtUtc!.Value,
                x.ExternalPaymentId,
                x.Amount,
                x.Currency,
                x.Invoice!.InvoiceNumber))
            .ToListAsync(cancellationToken);

        var creditNotes = await dbContext.CreditNotes
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.CustomerId == contact.Id
                && x.Status == CreditNoteStatus.Issued)
            .Select(x => new CustomerCreditNoteEntry(
                x.Id,
                x.InvoiceId,
                x.IssuedAtUtc,
                x.CreditNoteNumber,
                x.TotalReduction,
                x.Currency,
                x.Reason))
            .ToListAsync(cancellationToken);

        var paymentInvoiceLookup = await dbContext.Payments
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.Invoice != null
                && x.Invoice.CustomerId == contact.Id)
            .Select(x => new
            {
                x.Id,
                x.InvoiceId,
                x.Invoice!.InvoiceNumber
            })
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var refunds = await dbContext.Refunds
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.Status == RefundStatus.Succeeded)
            .ToListAsync(cancellationToken);

        var refundEntries = refunds
            .Select(x =>
            {
                if (x.InvoiceId.HasValue && invoiceLookup.TryGetValue(x.InvoiceId.Value, out var invoice))
                {
                    return new CustomerRefundEntry(
                        x.Id,
                        invoice.Id,
                        x.CreatedAtUtc,
                        x.ExternalRefundId,
                        x.Amount,
                        x.Currency,
                        x.Reason,
                        invoice.DocumentNumber);
                }

                if (!paymentInvoiceLookup.TryGetValue(x.PaymentId, out var paymentInvoice))
                {
                    return null;
                }

                return new CustomerRefundEntry(
                    x.Id,
                    x.InvoiceId ?? paymentInvoice.InvoiceId,
                    x.CreatedAtUtc,
                    x.ExternalRefundId,
                    x.Amount,
                    x.Currency,
                    x.Reason,
                    paymentInvoice.InvoiceNumber);
            })
            .Where(x => x is not null)
            .Select(x => x!)
            .ToList();

        var rows = new List<StatementRowSeed>();

        rows.AddRange(invoices
            .Where(x => !includeOutstandingOnly || outstandingInvoiceIds.Contains(x.Id))
            .Select(x => new StatementRowSeed(
                Id: $"invoice-{x.Id}",
                SourceType: StatementRowSourceType.Invoice,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.Id,
                DateUtc: x.DateUtc,
                DueDateUtc: x.DueDateUtc,
                DocumentNumber: x.DocumentNumber,
                Description: $"Invoice {x.DocumentNumber}",
                Debit: x.Total,
                Credit: 0m,
                Delta: x.Total,
                SortOrder: 10,
                OutstandingAmount: x.AmountDue,
                IsOutstanding: x.AmountDue > 0,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        rows.AddRange(payments
            .Where(x => !includeOutstandingOnly || outstandingInvoiceIds.Contains(x.InvoiceId))
            .Select(x => new StatementRowSeed(
                Id: $"payment-{x.Id}",
                SourceType: StatementRowSourceType.Payment,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.InvoiceId,
                DateUtc: x.DateUtc,
                DueDateUtc: null,
                DocumentNumber: string.IsNullOrWhiteSpace(x.DocumentNumber) ? x.InvoiceNumber : x.DocumentNumber!,
                Description: $"Payment received for {x.InvoiceNumber}",
                Debit: 0m,
                Credit: x.Amount,
                Delta: -x.Amount,
                SortOrder: 20,
                OutstandingAmount: 0m,
                IsOutstanding: false,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        rows.AddRange(creditNotes
            .Where(x => !includeOutstandingOnly || outstandingInvoiceIds.Contains(x.InvoiceId))
            .Select(x => new StatementRowSeed(
                Id: $"credit-note-{x.Id}",
                SourceType: StatementRowSourceType.CreditNote,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.InvoiceId,
                DateUtc: x.DateUtc,
                DueDateUtc: null,
                DocumentNumber: x.DocumentNumber,
                Description: string.IsNullOrWhiteSpace(x.Reason) ? $"Credit note {x.DocumentNumber}" : $"Credit note: {x.Reason}",
                Debit: 0m,
                Credit: x.Amount,
                Delta: -x.Amount,
                SortOrder: 30,
                OutstandingAmount: 0m,
                IsOutstanding: false,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        rows.AddRange(refundEntries
            .Where(x => !includeOutstandingOnly || outstandingInvoiceIds.Contains(x.InvoiceId))
            .Select(x => new StatementRowSeed(
                Id: $"refund-{x.Id}",
                SourceType: StatementRowSourceType.Refund,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.InvoiceId,
                DateUtc: x.DateUtc,
                DueDateUtc: null,
                DocumentNumber: string.IsNullOrWhiteSpace(x.DocumentNumber) ? x.InvoiceNumber : x.DocumentNumber!,
                Description: string.IsNullOrWhiteSpace(x.Reason) ? $"Refund for {x.InvoiceNumber}" : $"Refund: {x.Reason}",
                Debit: x.Amount,
                Credit: 0m,
                Delta: x.Amount,
                SortOrder: 40,
                OutstandingAmount: 0m,
                IsOutstanding: false,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        var openingBalance = rows
            .Where(x => fromUtc.HasValue && x.DateUtc < fromUtc.Value)
            .Sum(x => x.Delta);

        var inRangeRows = rows
            .Where(x => MatchesRange(x.DateUtc, fromUtc, toUtc))
            .ToList();

        var finalRows = MaterializeRows(inRangeRows, openingBalance, queryType: StatementAccountType.Customer, fromUtc, contact.Currency);
        var aging = BuildAgingSummary(outstandingInvoices);
        var currencyCodes = CollectCurrencies(finalRows, outstandingInvoices.Select(x => x.CurrencyCode), contact.Currency);

        return new StatementOfAccountDto(
            contact.Id,
            string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            contact.ContactType,
            StatementAccountType.Customer,
            NormalizeCurrency(contact.Currency, currencyCodes.FirstOrDefault()),
            openingBalance,
            finalRows.LastOrDefault()?.Balance ?? openingBalance,
            Math.Abs(openingBalance) > 0.0001m,
            currencyCodes.Count > 1,
            currencyCodes,
            aging,
            finalRows);
    }

    private async Task<StatementOfAccountDto> BuildSupplierStatementAsync(Customer contact, IReadOnlyCollection<Guid> ownedCompanyIds, DateTime? fromUtc, DateTime? toUtc, bool includeOutstandingOnly, CancellationToken cancellationToken)
    {
        var outstandingBills = await dbContext.PurchaseBills
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.ContactId == contact.Id
                && x.Status != PurchaseBillStatus.Draft
                && x.Status != PurchaseBillStatus.Cancelled
                && x.AmountDue > 0)
            .Select(x => new AgingDocument(
                x.Id,
                x.DueDateUtc,
                x.AmountDue,
                x.Currency,
                x.PurchaseBillNumber))
            .ToListAsync(cancellationToken);

        var outstandingBillIds = outstandingBills.Select(x => x.DocumentId).ToHashSet();

        var bills = await dbContext.PurchaseBills
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.ContactId == contact.Id
                && x.Status != PurchaseBillStatus.Draft
                && x.Status != PurchaseBillStatus.Cancelled)
            .Select(x => new SupplierBillEntry(
                x.Id,
                x.IssueDateUtc,
                x.DueDateUtc,
                x.PurchaseBillNumber,
                x.TotalAmount,
                x.AmountDue,
                x.Currency))
            .ToListAsync(cancellationToken);

        var payments = await dbContext.PurchasePayments
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.ContactId == contact.Id
                && x.Status == PurchasePaymentStatus.Posted)
            .ToListAsync(cancellationToken);

        var paymentIds = payments.Select(x => x.Id).ToHashSet();
        var paymentAllocations = await dbContext.Set<PurchasePaymentAllocation>()
            .AsNoTracking()
            .Where(x => paymentIds.Contains(x.PurchasePaymentId))
            .ToListAsync(cancellationToken);

        var paymentEntries = (from payment in payments
            join allocation in paymentAllocations on payment.Id equals allocation.PurchasePaymentId
            select new SupplierPaymentEntry(
                payment.Id,
                allocation.PurchaseBillId,
                payment.PaymentDateUtc,
                payment.PurchasePaymentNumber,
                allocation.Amount,
                payment.Currency,
                allocation.PurchaseBillNumber))
            .ToList();

        var creditNotes = await dbContext.PurchaseCreditNotes
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.ContactId == contact.Id
                && (x.Status == PurchaseCreditNoteStatus.Approved || x.Status == PurchaseCreditNoteStatus.Applied))
            .Select(x => new SupplierCreditNoteEntry(
                x.Id,
                x.PurchaseBillId,
                x.IssuedAtUtc,
                x.PurchaseCreditNoteNumber,
                x.TotalReduction,
                x.Currency,
                x.Reason))
            .ToListAsync(cancellationToken);

        var refunds = await dbContext.PurchaseRefunds
            .AsNoTracking()
            .Where(x => ownedCompanyIds.Contains(x.CompanyId)
                && x.ContactId == contact.Id
                && (x.Status == PurchaseRefundStatus.Approved || x.Status == PurchaseRefundStatus.Refunded))
            .ToListAsync(cancellationToken);

        var refundIds = refunds.Select(x => x.Id).ToHashSet();
        var refundAllocations = await dbContext.Set<PurchaseRefundAllocation>()
            .AsNoTracking()
            .Where(x => refundIds.Contains(x.PurchaseRefundId))
            .ToListAsync(cancellationToken);

        var refundEntries = (from refund in refunds
            join allocation in refundAllocations on refund.Id equals allocation.PurchaseRefundId
            select new SupplierRefundEntry(
                refund.Id,
                allocation.PurchaseBillId,
                refund.RefundDateUtc,
                refund.PurchaseRefundNumber,
                allocation.Amount,
                refund.Currency,
                allocation.PurchaseBillNumber))
            .ToList();

        var rows = new List<StatementRowSeed>();

        rows.AddRange(bills
            .Where(x => !includeOutstandingOnly || outstandingBillIds.Contains(x.Id))
            .Select(x => new StatementRowSeed(
                Id: $"purchase-bill-{x.Id}",
                SourceType: StatementRowSourceType.PurchaseBill,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.Id,
                DateUtc: x.DateUtc,
                DueDateUtc: x.DueDateUtc,
                DocumentNumber: x.DocumentNumber,
                Description: $"Bill {x.DocumentNumber}",
                Debit: 0m,
                Credit: x.TotalAmount,
                Delta: x.TotalAmount,
                SortOrder: 10,
                OutstandingAmount: x.AmountDue,
                IsOutstanding: x.AmountDue > 0,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        rows.AddRange(paymentEntries
            .Where(x => !includeOutstandingOnly || outstandingBillIds.Contains(x.PurchaseBillId))
            .Select(x => new StatementRowSeed(
                Id: $"purchase-payment-{x.Id}-{x.PurchaseBillId}",
                SourceType: StatementRowSourceType.PurchasePayment,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.PurchaseBillId,
                DateUtc: x.DateUtc,
                DueDateUtc: null,
                DocumentNumber: x.DocumentNumber,
                Description: $"Payment for {x.PurchaseBillNumber}",
                Debit: x.Amount,
                Credit: 0m,
                Delta: -x.Amount,
                SortOrder: 20,
                OutstandingAmount: 0m,
                IsOutstanding: false,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        rows.AddRange(creditNotes
            .Where(x => !includeOutstandingOnly || outstandingBillIds.Contains(x.PurchaseBillId))
            .Select(x => new StatementRowSeed(
                Id: $"purchase-credit-note-{x.Id}",
                SourceType: StatementRowSourceType.PurchaseCreditNote,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.PurchaseBillId,
                DateUtc: x.DateUtc,
                DueDateUtc: null,
                DocumentNumber: x.DocumentNumber,
                Description: string.IsNullOrWhiteSpace(x.Reason) ? $"Purchase credit note {x.DocumentNumber}" : $"Purchase credit note: {x.Reason}",
                Debit: x.Amount,
                Credit: 0m,
                Delta: -x.Amount,
                SortOrder: 30,
                OutstandingAmount: 0m,
                IsOutstanding: false,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        rows.AddRange(refundEntries
            .Where(x => !includeOutstandingOnly || outstandingBillIds.Contains(x.PurchaseBillId))
            .Select(x => new StatementRowSeed(
                Id: $"purchase-refund-{x.Id}-{x.PurchaseBillId}",
                SourceType: StatementRowSourceType.PurchaseRefund,
                SourceDocumentId: x.Id,
                ReferenceDocumentId: x.PurchaseBillId,
                DateUtc: x.DateUtc,
                DueDateUtc: null,
                DocumentNumber: x.DocumentNumber,
                Description: $"Refund for {x.PurchaseBillNumber}",
                Debit: 0m,
                Credit: x.Amount,
                Delta: x.Amount,
                SortOrder: 40,
                OutstandingAmount: 0m,
                IsOutstanding: false,
                CurrencyCode: NormalizeCurrency(x.Currency),
                IsOpeningBalance: false)));

        var openingBalance = rows
            .Where(x => fromUtc.HasValue && x.DateUtc < fromUtc.Value)
            .Sum(x => x.Delta);

        var inRangeRows = rows
            .Where(x => MatchesRange(x.DateUtc, fromUtc, toUtc))
            .ToList();

        var finalRows = MaterializeRows(inRangeRows, openingBalance, queryType: StatementAccountType.Supplier, fromUtc, contact.Currency);
        var aging = BuildAgingSummary(outstandingBills);
        var currencyCodes = CollectCurrencies(finalRows, outstandingBills.Select(x => x.CurrencyCode), contact.Currency);

        return new StatementOfAccountDto(
            contact.Id,
            string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            contact.ContactType,
            StatementAccountType.Supplier,
            NormalizeCurrency(contact.Currency, currencyCodes.FirstOrDefault()),
            openingBalance,
            finalRows.LastOrDefault()?.Balance ?? openingBalance,
            Math.Abs(openingBalance) > 0.0001m,
            currencyCodes.Count > 1,
            currencyCodes,
            aging,
            finalRows);
    }

    private static IReadOnlyCollection<StatementRowDto> MaterializeRows(IEnumerable<StatementRowSeed> rows, decimal openingBalance, StatementAccountType queryType, DateTime? fromUtc, string? fallbackCurrency)
    {
        var orderedRows = rows
            .OrderBy(x => x.DateUtc)
            .ThenBy(x => x.SortOrder)
            .ThenBy(x => x.DocumentNumber, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var materialized = new List<StatementRowDto>();
        var runningBalance = 0m;

        if (Math.Abs(openingBalance) > 0.0001m)
        {
            runningBalance = openingBalance;
            materialized.Add(BuildOpeningBalanceRow(openingBalance, queryType, fromUtc, fallbackCurrency));
        }

        foreach (var row in orderedRows)
        {
            runningBalance += row.Delta;
            materialized.Add(new StatementRowDto(
                row.Id,
                row.SourceType,
                row.SourceDocumentId,
                row.ReferenceDocumentId,
                row.DateUtc,
                row.DueDateUtc,
                row.DocumentNumber,
                row.Description,
                row.Debit,
                row.Credit,
                runningBalance,
                row.OutstandingAmount,
                row.IsOutstanding,
                row.CurrencyCode,
                false));
        }

        return materialized;
    }

    private static StatementRowDto BuildOpeningBalanceRow(decimal openingBalance, StatementAccountType statementType, DateTime? fromUtc, string? fallbackCurrency)
    {
        var dateUtc = fromUtc ?? DateTime.UtcNow.Date;
        var isSupplier = statementType == StatementAccountType.Supplier;
        var debit = openingBalance == 0m
            ? 0m
            : isSupplier
                ? Math.Max(-openingBalance, 0m)
                : Math.Max(openingBalance, 0m);
        var credit = openingBalance == 0m
            ? 0m
            : isSupplier
                ? Math.Max(openingBalance, 0m)
                : Math.Max(-openingBalance, 0m);

        return new StatementRowDto(
            "opening-balance",
            StatementRowSourceType.OpeningBalance,
            null,
            null,
            dateUtc,
            null,
            "OPENING",
            "Opening balance brought forward",
            debit,
            credit,
            openingBalance,
            Math.Max(openingBalance, 0m),
            openingBalance > 0m,
            NormalizeCurrency(fallbackCurrency),
            true);
    }

    private static StatementAgingSummaryDto BuildAgingSummary(IEnumerable<AgingDocument> documents)
    {
        decimal current = 0m;
        decimal days1To30 = 0m;
        decimal days31To60 = 0m;
        decimal days61To90 = 0m;
        decimal days91Plus = 0m;
        var today = DateTime.UtcNow.Date;

        foreach (var document in documents.Where(x => x.OutstandingAmount > 0m))
        {
            var dueDate = document.DueDateUtc.Date;
            var ageInDays = (today - dueDate).Days;
            if (ageInDays <= 0)
            {
                current += document.OutstandingAmount;
            }
            else if (ageInDays <= 30)
            {
                days1To30 += document.OutstandingAmount;
            }
            else if (ageInDays <= 60)
            {
                days31To60 += document.OutstandingAmount;
            }
            else if (ageInDays <= 90)
            {
                days61To90 += document.OutstandingAmount;
            }
            else
            {
                days91Plus += document.OutstandingAmount;
            }
        }

        return new StatementAgingSummaryDto(
            current,
            days1To30,
            days31To60,
            days61To90,
            days91Plus,
            current + days1To30 + days31To60 + days61To90 + days91Plus);
    }

    private static bool MatchesRange(DateTime dateUtc, DateTime? fromUtc, DateTime? toUtc)
    {
        if (fromUtc.HasValue && dateUtc < fromUtc.Value)
        {
            return false;
        }

        if (toUtc.HasValue && dateUtc > toUtc.Value)
        {
            return false;
        }

        return true;
    }

    private static List<string> CollectCurrencies(IEnumerable<StatementRowDto> rows, IEnumerable<string> agingCurrencies, string? fallbackCurrency)
    {
        var currencies = rows.Select(x => x.CurrencyCode)
            .Concat(agingCurrencies)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (currencies.Count == 0)
        {
            currencies.Add(NormalizeCurrency(fallbackCurrency));
        }

        return currencies;
    }

    private static string NormalizeCurrency(string? currencyCode, string? fallback = null)
    {
        if (!string.IsNullOrWhiteSpace(currencyCode))
        {
            return currencyCode.Trim().ToUpperInvariant();
        }

        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return fallback.Trim().ToUpperInvariant();
        }

        return "MYR";
    }

    private static void ValidateStatementType(Customer contact, StatementAccountType statementType)
    {
        var normalizedTypes = (contact.ContactType ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.ToLowerInvariant())
            .ToHashSet();

        var requiredType = statementType == StatementAccountType.Supplier ? "supplier" : "customer";
        if (!normalizedTypes.Contains(requiredType))
        {
            throw new InvalidOperationException("The selected contact does not support the requested statement type.");
        }
    }

    private StatementOfAccountDto BuildEmpty(Customer contact, StatementAccountType statementType)
    {
        var currencyCode = NormalizeCurrency(contact.Currency);
        return new StatementOfAccountDto(
            contact.Id,
            string.IsNullOrWhiteSpace(contact.LegalName) ? contact.Name : contact.LegalName,
            contact.ContactType,
            statementType,
            currencyCode,
            0m,
            0m,
            false,
            false,
            [currencyCode],
            new StatementAgingSummaryDto(0m, 0m, 0m, 0m, 0m, 0m),
            Array.Empty<StatementRowDto>());
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private IQueryable<Guid> OwnedCompanyIdsQuery() => dbContext.Companies
        .Where(x => x.SubscriberId == GetSubscriberId())
        .Select(x => x.Id);

    private sealed record AgingDocument(Guid DocumentId, DateTime DueDateUtc, decimal OutstandingAmount, string CurrencyCode, string DocumentNumber);
    private sealed record CustomerInvoiceEntry(Guid Id, DateTime DateUtc, DateTime DueDateUtc, string DocumentNumber, decimal Total, decimal AmountDue, string Currency);
    private sealed record CustomerPaymentEntry(Guid Id, Guid InvoiceId, DateTime DateUtc, string? DocumentNumber, decimal Amount, string Currency, string InvoiceNumber);
    private sealed record CustomerCreditNoteEntry(Guid Id, Guid InvoiceId, DateTime DateUtc, string DocumentNumber, decimal Amount, string Currency, string Reason);
    private sealed record CustomerRefundEntry(Guid Id, Guid InvoiceId, DateTime DateUtc, string? DocumentNumber, decimal Amount, string Currency, string Reason, string InvoiceNumber);
    private sealed record SupplierBillEntry(Guid Id, DateTime DateUtc, DateTime DueDateUtc, string DocumentNumber, decimal TotalAmount, decimal AmountDue, string Currency);
    private sealed record SupplierPaymentEntry(Guid Id, Guid PurchaseBillId, DateTime DateUtc, string DocumentNumber, decimal Amount, string Currency, string PurchaseBillNumber);
    private sealed record SupplierCreditNoteEntry(Guid Id, Guid PurchaseBillId, DateTime DateUtc, string DocumentNumber, decimal Amount, string Currency, string Reason);
    private sealed record SupplierRefundEntry(Guid Id, Guid PurchaseBillId, DateTime DateUtc, string DocumentNumber, decimal Amount, string Currency, string PurchaseBillNumber);

    private sealed record StatementRowSeed(
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
        decimal Delta,
        int SortOrder,
        decimal OutstandingAmount,
        bool IsOutstanding,
        string CurrencyCode,
        bool IsOpeningBalance);
}
