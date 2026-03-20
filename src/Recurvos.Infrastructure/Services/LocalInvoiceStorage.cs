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
    {
        var invoiceRoot = StoragePathResolver.Resolve(_environment, _options.InvoiceDirectory);
        var directory = Path.Combine(invoiceRoot, companyId.ToString("N"));
        Directory.CreateDirectory(directory);
        var filePath = Path.Combine(directory, $"{invoiceNumber}.pdf");
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
        string currency)
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
            currency));

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
        string currency)
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
            currency));

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
        string currency)
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
            InvoiceTypeLabel = periodStartUtc.HasValue && periodEndUtc.HasValue ? "Subscription Invoice" : "Manual Invoice",
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
            PaymentLink = paymentLink,
            PaymentQrDataUrl = paymentQrDataUrl,
            Subtotal = total,
            ShowTaxSection = isTaxEnabled,
            TaxLabel = isTaxEnabled ? $"{normalizedTaxName} {appliedTaxRate:0.##}%" : null,
            TaxTotal = taxAmount,
            DiscountTotal = 0,
            AmountDue = grandTotal,
            PaidAmount = 0,
            Notes = "Please include the invoice number with your payment reference.",
            SystemGeneratedFlag = true,
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
