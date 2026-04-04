using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Templates;

namespace Recurvos.Infrastructure.Services;

public sealed class LocalInvoiceStorage(IOptions<StorageOptions> options, IHostEnvironment environment) : IInvoiceStorage
{
    private readonly StorageOptions _options = options.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<string> SaveInvoicePdfAsync(Guid companyId, string invoiceNumber, byte[] content, CancellationToken cancellationToken = default)
        => await SaveDocumentPdfAsync(companyId, invoiceNumber, content, cancellationToken);

    public async Task<string> SaveDocumentPdfAsync(Guid companyId, string documentNumber, byte[] content, CancellationToken cancellationToken = default)
    {
        var invoiceRoot = StoragePathResolver.Resolve(_environment, _options.InvoiceDirectory);
        var directory = Path.Combine(invoiceRoot, companyId.ToString("N"));
        Directory.CreateDirectory(directory);
        var filePath = Path.Combine(directory, $"{documentNumber}.pdf");
        await File.WriteAllBytesAsync(filePath, content, cancellationToken);
        return filePath.Replace("\\", "/");
    }

    public static byte[] CreatePdf(
        string companyName,
        string companyRegistrationNumber,
        string companyEmail,
        string companyPhone,
        string companyAddress,
        bool showCompanyAddressOnInvoice,
        byte[]? companyLogo,
        string? bankName,
        string? bankAccountName,
        string? bankAccount,
        string? paymentLink,
        byte[]? paymentQr,
        bool isTaxEnabled,
        string? taxName,
        decimal? taxRate,
        string? taxRegistrationNo,
        string customerName,
        string? customerEmail,
        string? customerAddress,
        string invoiceNumber,
        DateTime issueDateUtc,
        DateTime dueDateUtc,
        DateTime? periodStartUtc,
        DateTime? periodEndUtc,
        IEnumerable<(string Description, int Quantity, decimal UnitAmount, decimal TotalAmount)> items,
        decimal total,
        string currency,
        string? paymentConfirmationLink = null,
        string? documentTitle = null,
        string? documentNumberLabel = null,
        string? notes = null,
        bool systemGeneratedFlag = true,
        bool showDueDate = true,
        string? secondaryDocumentLabel = null,
        string? secondaryDocumentValue = null,
        string? periodLabel = null)
        => InvoicePdfTemplate.Render(CreateTemplateModel(
            companyName,
            companyRegistrationNumber,
            companyEmail,
            companyPhone,
            companyAddress,
            showCompanyAddressOnInvoice,
            companyLogo,
            bankName,
            bankAccountName,
            bankAccount,
            paymentLink,
            paymentQr,
            isTaxEnabled,
            taxName,
            taxRate,
            taxRegistrationNo,
            customerName,
            customerEmail,
            customerAddress,
            invoiceNumber,
            issueDateUtc,
            dueDateUtc,
            periodStartUtc,
            periodEndUtc,
            items,
            total,
            currency,
            paymentConfirmationLink,
            documentTitle,
            documentNumberLabel,
            notes,
            systemGeneratedFlag,
            showDueDate,
            secondaryDocumentLabel,
            secondaryDocumentValue,
            periodLabel));

    public static string CreateHtml(
        string companyName,
        string companyRegistrationNumber,
        string companyEmail,
        string companyPhone,
        string companyAddress,
        bool showCompanyAddressOnInvoice,
        byte[]? companyLogo,
        string? bankName,
        string? bankAccountName,
        string? bankAccount,
        string? paymentLink,
        byte[]? paymentQr,
        bool isTaxEnabled,
        string? taxName,
        decimal? taxRate,
        string? taxRegistrationNo,
        string customerName,
        string? customerEmail,
        string? customerAddress,
        string invoiceNumber,
        DateTime issueDateUtc,
        DateTime dueDateUtc,
        DateTime? periodStartUtc,
        DateTime? periodEndUtc,
        IEnumerable<(string Description, int Quantity, decimal UnitAmount, decimal TotalAmount)> items,
        decimal total,
        string currency,
        string? paymentConfirmationLink = null,
        string? documentTitle = null,
        string? documentNumberLabel = null,
        string? notes = null,
        bool systemGeneratedFlag = true,
        bool showDueDate = true,
        string? secondaryDocumentLabel = null,
        string? secondaryDocumentValue = null,
        string? periodLabel = null)
        => InvoiceHtmlTemplateRenderer.Render(CreateTemplateModel(
            companyName,
            companyRegistrationNumber,
            companyEmail,
            companyPhone,
            companyAddress,
            showCompanyAddressOnInvoice,
            companyLogo,
            bankName,
            bankAccountName,
            bankAccount,
            paymentLink,
            paymentQr,
            isTaxEnabled,
            taxName,
            taxRate,
            taxRegistrationNo,
            customerName,
            customerEmail,
            customerAddress,
            invoiceNumber,
            issueDateUtc,
            dueDateUtc,
            periodStartUtc,
            periodEndUtc,
            items,
            total,
            currency,
            paymentConfirmationLink,
            documentTitle,
            documentNumberLabel,
            notes,
            systemGeneratedFlag,
            showDueDate,
            secondaryDocumentLabel,
            secondaryDocumentValue,
            periodLabel));

    public static InvoiceTemplateModel CreateTemplateModel(
        string companyName,
        string companyRegistrationNumber,
        string companyEmail,
        string companyPhone,
        string companyAddress,
        bool showCompanyAddressOnInvoice,
        byte[]? companyLogo,
        string? bankName,
        string? bankAccountName,
        string? bankAccount,
        string? paymentLink,
        byte[]? paymentQr,
        bool isTaxEnabled,
        string? taxName,
        decimal? taxRate,
        string? taxRegistrationNo,
        string customerName,
        string? customerEmail,
        string? customerAddress,
        string invoiceNumber,
        DateTime issueDateUtc,
        DateTime dueDateUtc,
        DateTime? periodStartUtc,
        DateTime? periodEndUtc,
        IEnumerable<(string Description, int Quantity, decimal UnitAmount, decimal TotalAmount)> items,
        decimal total,
        string currency,
        string? paymentConfirmationLink = null,
        string? documentTitle = null,
        string? documentNumberLabel = null,
        string? notes = null,
        bool systemGeneratedFlag = true,
        bool showDueDate = true,
        string? secondaryDocumentLabel = null,
        string? secondaryDocumentValue = null,
        string? periodLabel = null)
    {
        var normalizedCurrency = InvoiceTemplateSupport.NormalizeCurrency(currency);
        var logoDataUrl = InvoiceTemplateSupport.ToDataUrl(companyLogo, "image/png");
        var paymentQrDataUrl = InvoiceTemplateSupport.ToDataUrl(paymentQr, "image/png");
        var normalizedTaxName = string.IsNullOrWhiteSpace(taxName) ? "SST" : taxName.Trim();
        var appliedTaxRate = isTaxEnabled ? Math.Max(0, taxRate ?? 0) : 0;
        var taxAmount = isTaxEnabled ? Math.Round(total * appliedTaxRate / 100m, 2, MidpointRounding.AwayFromZero) : 0m;
        var grandTotal = total + taxAmount;
        return new InvoiceTemplateModel
        {
            DocumentTitle = string.IsNullOrWhiteSpace(documentTitle) ? "INVOICE" : documentTitle.Trim(),
            DocumentNumberLabel = string.IsNullOrWhiteSpace(documentNumberLabel) ? "Invoice No" : documentNumberLabel.Trim(),
            InvoiceTypeLabel = periodStartUtc.HasValue && periodEndUtc.HasValue ? "Subscription Invoice" : "Manual Invoice",
            ShowDueDate = showDueDate,
            SecondaryDocumentLabel = string.IsNullOrWhiteSpace(secondaryDocumentLabel) ? null : secondaryDocumentLabel.Trim(),
            SecondaryDocumentValue = string.IsNullOrWhiteSpace(secondaryDocumentValue) ? null : secondaryDocumentValue.Trim(),
            PeriodLabel = string.IsNullOrWhiteSpace(periodLabel) ? "Billing Period" : periodLabel.Trim(),
            InvoiceNumber = invoiceNumber,
            InvoiceDateUtc = issueDateUtc,
            DueDateUtc = dueDateUtc,
            PeriodStartUtc = periodStartUtc,
            PeriodEndUtc = periodEndUtc,
            Currency = normalizedCurrency,
            LogoBytes = companyLogo,
            LogoDataUrl = logoDataUrl,
            IssuerName = companyName,
            IssuerRegistrationNumber = companyRegistrationNumber,
            IssuerSstNumber = isTaxEnabled ? taxRegistrationNo : null,
            IssuerEmail = companyEmail,
            IssuerPhone = companyPhone,
            IssuerAddress = showCompanyAddressOnInvoice ? companyAddress : null,
            CustomerName = customerName,
            CustomerEmail = customerEmail,
            CustomerAddress = customerAddress,
            BankName = bankName,
            BankAccountName = bankAccountName,
            BankAccount = bankAccount,
            PaymentGatewayLink = paymentLink,
            PaymentConfirmationLink = paymentConfirmationLink,
            PaymentLink = paymentLink,
            PaymentQrDataUrl = paymentQrDataUrl,
            Subtotal = total,
            ShowTaxSection = isTaxEnabled,
            TaxLabel = isTaxEnabled ? $"{normalizedTaxName} {appliedTaxRate:0.##}%" : null,
            TaxTotal = taxAmount,
            DiscountTotal = 0,
            AmountDue = grandTotal,
            PaidAmount = 0,
            Notes = string.IsNullOrWhiteSpace(notes) ? "Please include the invoice number with your payment reference." : notes.Trim(),
            SystemGeneratedFlag = systemGeneratedFlag,
            Items = items.Select(item => new InvoiceTemplateLineItem
            {
                Description = item.Description,
                Quantity = item.Quantity,
                UnitPrice = item.UnitAmount,
                TaxAmount = 0,
                LineTotal = item.TotalAmount
            }).ToList()
        };
    }
}
