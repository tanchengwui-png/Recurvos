using FluentAssertions;
using Recurvos.Infrastructure.Services;
using Recurvos.Infrastructure.Templates;

namespace Recurvos.Application.Tests.Billing;

public sealed class InvoiceTemplateTests
{
    [Fact]
    public void InvoiceNumberFormatter_UsesDefaultMvpFormat()
    {
        var invoiceNumber = InvoiceNumberFormatter.Format(
            new DateTime(2026, 3, 17, 0, 0, 0, DateTimeKind.Utc),
            1);

        invoiceNumber.Should().Be("INV-2026-000001");
    }

    [Fact]
    public void InvoiceNumberFormatter_SupportsCustomSubscriberPattern()
    {
        var invoiceNumber = InvoiceNumberFormatter.Format(
            new DateTime(2026, 3, 17, 0, 0, 0, DateTimeKind.Utc),
            42,
            customPattern: "{PREFIX}/{YY}/{MM}/{SEQPAD}",
            prefix: "BILL",
            padding: 4);

        invoiceNumber.Should().Be("BILL/26/03/0042");
    }

    [Fact]
    public void CreateHtml_ContainsRequiredInvoiceSections()
    {
        var html = LocalInvoiceStorage.CreateHtml(
            companyName: "Recurvos Sdn Bhd",
            companyRegistrationNumber: "202601234567",
            companyEmail: "billing@recurvos.test",
            companyPhone: "+60 12-345 6789",
            companyAddress: "Kuala Lumpur",
            showCompanyAddressOnInvoice: true,
            companyLogo: null,
            bankName: "Maybank",
            bankAccountName: "Recurvos Sdn Bhd",
            bankAccount: "1234567890",
            paymentLink: "https://pay.example/inv",
            paymentQr: null,
            isTaxEnabled: false,
            taxName: null,
            taxRate: null,
            taxRegistrationNo: null,
            customerName: "Acme Customer",
            customerEmail: "accounts@acme.test",
            customerAddress: "Petaling Jaya",
            invoiceNumber: "INV-2026-000001",
            issueDateUtc: new DateTime(2026, 3, 17, 0, 0, 0, DateTimeKind.Utc),
            dueDateUtc: new DateTime(2026, 3, 24, 0, 0, 0, DateTimeKind.Utc),
            periodStartUtc: null,
            periodEndUtc: null,
            items:
            [
                ("Starter Plan", 2, 99m, 198m)
            ],
            total: 198m,
            currency: "usd");

        html.Should().Contain("INV-2026-000001");
        html.Should().Contain("Recurvos Sdn Bhd");
        html.Should().Contain("Acme Customer");
        html.Should().Contain("accounts@acme.test");
        html.Should().Contain("Petaling Jaya");
        html.Should().Contain("Starter Plan");
        html.Should().Contain("USD 198.00");
        html.Should().Contain("This is a system generated invoice.");
    }

    [Fact]
    public void CreatePdf_GeneratesDocumentBytes()
    {
        var pdf = LocalInvoiceStorage.CreatePdf(
            companyName: "Recurvos Sdn Bhd",
            companyRegistrationNumber: "202601234567",
            companyEmail: "billing@recurvos.test",
            companyPhone: "+60 12-345 6789",
            companyAddress: "Kuala Lumpur",
            showCompanyAddressOnInvoice: true,
            companyLogo: null,
            bankName: "Maybank",
            bankAccountName: "Recurvos Sdn Bhd",
            bankAccount: "1234567890",
            paymentLink: "https://pay.example/inv",
            paymentQr: null,
            isTaxEnabled: false,
            taxName: null,
            taxRate: null,
            taxRegistrationNo: null,
            customerName: "Acme Customer",
            customerEmail: "accounts@acme.test",
            customerAddress: "Petaling Jaya",
            invoiceNumber: "INV-2026-000001",
            issueDateUtc: new DateTime(2026, 3, 17, 0, 0, 0, DateTimeKind.Utc),
            dueDateUtc: new DateTime(2026, 3, 24, 0, 0, 0, DateTimeKind.Utc),
            periodStartUtc: new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc),
            periodEndUtc: new DateTime(2026, 3, 31, 0, 0, 0, DateTimeKind.Utc),
            items:
            [
                ("Starter Plan", 1, 99m, 99m)
            ],
            total: 99m,
            currency: "MYR");

        pdf.Should().NotBeNull();
        pdf.Length.Should().BeGreaterThan(1000);
    }
}
