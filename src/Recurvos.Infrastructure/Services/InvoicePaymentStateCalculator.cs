using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;

namespace Recurvos.Infrastructure.Services;

/// <summary>Maintains the invoice payment state from successful payments, refunds, and issued credit notes.</summary>
public static class InvoicePaymentStateCalculator
{
    public static decimal GetRefundedAmount(IEnumerable<Payment> payments) => payments
        .Where(payment => payment.Status == PaymentStatus.Succeeded)
        .SelectMany(payment => payment.Refunds)
        .Where(refund => refund.Status == RefundStatus.Succeeded)
        .Sum(refund => refund.Amount);

    public static void Recalculate(Invoice invoice, IEnumerable<Payment> payments, IEnumerable<CreditNote>? creditNotes = null)
    {
        if (invoice.Status is InvoiceStatus.Voided or InvoiceStatus.Draft or InvoiceStatus.Uncollectible)
        {
            return;
        }

        var successfulPayments = payments.Where(payment => payment.Status == PaymentStatus.Succeeded).ToList();
        var grossPaid = successfulPayments.Sum(payment => payment.Amount);
        var refunded = GetRefundedAmount(successfulPayments);
        var netPaid = Math.Max(0, grossPaid - refunded);
        var credited = (creditNotes ?? invoice.CreditNotes)
            .Where(creditNote => creditNote.Status == CreditNoteStatus.Issued)
            .Sum(creditNote => creditNote.TotalReduction);

        invoice.AmountPaid = netPaid;
        invoice.AmountDue = Math.Max(0, invoice.Total - netPaid - credited);
        // A refund returns received money; it does not settle or write off the invoice.
        // Any resulting balance must therefore make the invoice payable again.
        invoice.Status = invoice.AmountDue <= 0
            ? InvoiceStatus.Paid
            : InvoiceStatus.Open;
    }
}
