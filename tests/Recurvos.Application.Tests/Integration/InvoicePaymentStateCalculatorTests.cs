using FluentAssertions;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Application.Tests.Integration;

public sealed class InvoicePaymentStateCalculatorTests
{
    [Fact]
    public void Recalculate_keeps_an_unpaid_invoice_open()
    {
        var invoice = Invoice(total: 265m);

        InvoicePaymentStateCalculator.Recalculate(invoice, []);

        invoice.AmountPaid.Should().Be(0m);
        invoice.AmountDue.Should().Be(265m);
        invoice.Status.Should().Be(InvoiceStatus.Open);
    }

    [Fact]
    public void Recalculate_uses_successful_payments_for_a_partial_payment()
    {
        var invoice = Invoice(total: 265m);

        InvoicePaymentStateCalculator.Recalculate(invoice, [Payment(165m)]);

        invoice.AmountPaid.Should().Be(165m);
        invoice.AmountDue.Should().Be(100m);
        invoice.Status.Should().Be(InvoiceStatus.Open);
    }

    [Fact]
    public void Recalculate_marks_a_fully_paid_invoice_paid()
    {
        var invoice = Invoice(total: 265m);

        InvoicePaymentStateCalculator.Recalculate(invoice, [Payment(265m)]);

        invoice.AmountPaid.Should().Be(265m);
        invoice.AmountDue.Should().Be(0m);
        invoice.Status.Should().Be(InvoiceStatus.Paid);
    }

    [Fact]
    public void Recalculate_subtracts_a_partial_refund_from_net_paid()
    {
        var invoice = Invoice(total: 265m);

        InvoicePaymentStateCalculator.Recalculate(invoice, [Payment(265m, refund: 100m)]);

        invoice.AmountPaid.Should().Be(165m);
        invoice.AmountDue.Should().Be(100m);
        invoice.Status.Should().Be(InvoiceStatus.Open);
    }

    [Fact]
    public void Recalculate_marks_a_fully_refunded_invoice_refunded()
    {
        var invoice = Invoice(total: 265m);

        InvoicePaymentStateCalculator.Recalculate(invoice, [Payment(265m, refund: 265m)]);

        invoice.AmountPaid.Should().Be(0m);
        invoice.AmountDue.Should().Be(265m);
        invoice.Status.Should().Be(InvoiceStatus.Refunded);
    }

    [Fact]
    public void Recalculate_handles_one_refund_across_multiple_payments_and_is_idempotent()
    {
        var invoice = Invoice(total: 265m);
        var payments = new[] { Payment(165m, refund: 100m), Payment(100m) };

        InvoicePaymentStateCalculator.Recalculate(invoice, payments);
        InvoicePaymentStateCalculator.Recalculate(invoice, payments); // Models a refreshed invoice read.

        invoice.AmountPaid.Should().Be(165m);
        invoice.AmountDue.Should().Be(100m);
        invoice.Status.Should().Be(InvoiceStatus.Open);
    }

    private static Invoice Invoice(decimal total) => new() { Total = total, AmountDue = total, Status = InvoiceStatus.Open };

    private static Payment Payment(decimal amount, decimal? refund = null)
    {
        var payment = new Payment { Amount = amount, Status = PaymentStatus.Succeeded };
        if (refund.HasValue)
        {
            payment.Refunds.Add(new Refund { Amount = refund.Value, Status = RefundStatus.Succeeded });
        }

        return payment;
    }
}
