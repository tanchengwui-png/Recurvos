using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Payments;
using Recurvos.Application.Platform;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Templates;

namespace Recurvos.Infrastructure.Services;

public sealed class SubscriberPackageBillingService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IEnumerable<IPaymentGateway> gateways,
    IAuditService auditService,
    IEmailSender emailSender,
    IOptions<AppUrlOptions> appUrlOptions,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : ISubscriberPackageBillingService
{
    private const string PlatformInvoicePrefix = "SUB";
    private readonly IPaymentGateway _gateway = gateways.First(x => x.Name == "Billplz");
    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task ProvisionForSubscriberCompanyAsync(Guid subscriberCompanyId, CancellationToken cancellationToken = default)
    {
        var company = await dbContext.Companies.FirstOrDefaultAsync(x => x.Id == subscriberCompanyId && !x.IsPlatformAccount, cancellationToken)
            ?? throw new KeyNotFoundException("Subscriber company not found.");

        var packageCode = company.SelectedPackage?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(packageCode))
        {
            return;
        }

        var package = await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == packageCode && x.IsActive, cancellationToken)
            ?? throw new KeyNotFoundException("Package not found.");

        var existingOpenInvoices = await dbContext.Invoices
            .Where(x => x.SubscriberCompanyId == company.Id
                && x.SourceType == InvoiceSourceType.PlatformSubscription
                && x.Status != InvoiceStatus.Paid
                && x.Status != InvoiceStatus.Voided)
            .ToListAsync(cancellationToken);

        foreach (var existingInvoice in existingOpenInvoices)
        {
            existingInvoice.Status = InvoiceStatus.Voided;
            existingInvoice.AmountDue = 0;
        }

        if (existingOpenInvoices.Count > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var platformCompany = await dbContext.Companies.FirstAsync(x => x.IsPlatformAccount, cancellationToken);
        var platformOwner = await dbContext.Users.FirstAsync(x => x.IsPlatformOwner && x.CompanyId == platformCompany.Id, cancellationToken);
        var billingCustomer = await EnsureBillingCustomerAsync(platformOwner.Id, company, cancellationToken);
        var invoiceNumber = await GenerateInvoiceNumberAsync(platformCompany.Id, cancellationToken);
        var issueDateUtc = DateTime.UtcNow;
        var platformTaxSettings = await EnsurePlatformInvoiceSettingsAsync(platformCompany.Id, cancellationToken)
            ?? throw new InvalidOperationException("Platform invoice settings could not be resolved.");
        var dueDateUtc = issueDateUtc.AddDays(platformTaxSettings?.PaymentDueDays ?? 7);
        var gracePeriodEndsAtUtc = dueDateUtc.AddDays(package.GracePeriodDays);
        company.PendingPackageCode = null;
        company.PackageStatus = "pending_payment";
        company.PackageGracePeriodEndsAtUtc = gracePeriodEndsAtUtc;
        var taxProfile = ResolveTaxProfile(platformTaxSettings);
        var taxAmount = CalculateTaxAmount(package.Amount, taxProfile);
        var grandTotal = package.Amount + taxAmount;
        var intervalLabel = package.IntervalUnit switch
        {
            IntervalUnit.Month => $"{package.IntervalCount} month",
            IntervalUnit.Quarter => $"{package.IntervalCount} quarter",
            IntervalUnit.Year => $"{package.IntervalCount} year",
            _ => "one-time"
        };

        var invoice = new Invoice
        {
            CompanyId = platformCompany.Id,
            CustomerId = billingCustomer.Id,
            SubscriberCompanyId = company.Id,
            InvoiceNumber = invoiceNumber,
            Status = InvoiceStatus.Open,
            IssueDateUtc = issueDateUtc,
            DueDateUtc = dueDateUtc,
            SourceType = InvoiceSourceType.PlatformSubscription,
            Subtotal = package.Amount,
            TaxAmount = taxAmount,
            IsTaxEnabled = taxProfile.IsEnabled,
            TaxName = taxProfile.IsEnabled ? taxProfile.Name : null,
            TaxRate = taxProfile.IsEnabled ? taxProfile.Rate : null,
            TaxRegistrationNo = taxProfile.IsEnabled ? taxProfile.RegistrationNo : null,
            Total = grandTotal,
            AmountDue = grandTotal,
            AmountPaid = 0,
            Currency = package.Currency,
            LineItems =
            [
                new InvoiceLineItem
                {
                    CompanyId = platformCompany.Id,
                    Description = $"{package.Name} package ({intervalLabel})",
                    Quantity = 1,
                    UnitAmount = package.Amount,
                    TotalAmount = package.Amount
                }
            ]
        };

        var issuerProfile = PlatformIssuerProfileResolver.Resolve(platformCompany, platformTaxSettings);
        var pdf = LocalInvoiceStorage.CreatePdf(
            issuerProfile.CompanyName,
            issuerProfile.RegistrationNumber,
            issuerProfile.BillingEmail,
            issuerProfile.Phone ?? string.Empty,
            issuerProfile.Address ?? string.Empty,
            platformTaxSettings!.ShowCompanyAddressOnInvoice,
            await ReadBytesIfExistsAsync(platformCompany.LogoPath, cancellationToken),
            platformTaxSettings.BankName,
            platformTaxSettings.BankAccountName,
            platformTaxSettings.BankAccount,
            platformTaxSettings.PaymentLink,
            await ReadBytesIfExistsAsync(platformTaxSettings.PaymentQrPath, cancellationToken),
            taxProfile.IsEnabled,
            taxProfile.Name,
            taxProfile.Rate,
            taxProfile.RegistrationNo,
            company.Name,
            company.Email,
            company.Address,
            invoice.InvoiceNumber,
            issueDateUtc,
            dueDateUtc,
            null,
            null,
            invoice.LineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
            invoice.Subtotal,
            invoice.Currency);
        invoice.PdfPath = await SaveInvoicePdfAsync(platformCompany.Id, invoice.InvoiceNumber, pdf, cancellationToken);

        dbContext.Invoices.Add(invoice);
        await dbContext.SaveChangesAsync(cancellationToken);
        await TryWriteAuditAsync("subscriber-package.invoice.created", nameof(Invoice), invoice.Id.ToString(), platformCompany.Id, invoice.InvoiceNumber, cancellationToken);

        await TryAutoSendPlatformInvoiceEmailAsync(platformCompany, billingCustomer, invoice, platformTaxSettings, cancellationToken);
    }

    public async Task<SubscriberPackageBillingSummaryDto> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        var subscriberCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(x => x.Id == subscriberCompanyId && !x.IsPlatformAccount, cancellationToken)
            ?? throw new UnauthorizedAccessException();
        var package = await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == company.SelectedPackage, cancellationToken);
        var pendingUpgrade = string.IsNullOrWhiteSpace(company.PendingPackageCode)
            ? null
            : await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == company.PendingPackageCode, cancellationToken);

        var invoices = await dbContext.Invoices
            .Include(x => x.Payments)
            .Include(x => x.PaymentConfirmations)
            .Where(x => x.SubscriberCompanyId == subscriberCompanyId && x.SourceType == InvoiceSourceType.PlatformSubscription)
            .OrderByDescending(x => x.IssueDateUtc)
            .ToListAsync(cancellationToken);

        IReadOnlyCollection<SubscriberPackageUpgradeOptionDto> availableUpgrades = package is null
            ? Array.Empty<SubscriberPackageUpgradeOptionDto>()
            : (await dbContext.PlatformPackages
                .Where(x => x.IsActive
                    && x.DisplayOrder > package.DisplayOrder
                    && x.Amount > package.Amount
                    && x.Currency == package.Currency
                    && x.IntervalUnit == package.IntervalUnit
                    && x.IntervalCount == package.IntervalCount)
                .OrderBy(x => x.DisplayOrder)
                .Select(x => new SubscriberPackageUpgradeOptionDto(
                    x.Code,
                    x.Name,
                    x.Description,
                    x.PriceLabel,
                    x.Amount,
                    x.Currency,
                    FormatBillingInterval(x.IntervalCount, x.IntervalUnit)))
                .ToListAsync(cancellationToken));
        DateTime? currentCycleEndUtc = package is null
            ? null
            : await ResolveCurrentCycleEndUtcAsync(company, package, cancellationToken);

        return new SubscriberPackageBillingSummaryDto(
            company.SelectedPackage,
            package?.Name,
            ResolvePackageStatus(company.PackageStatus, company.PackageGracePeriodEndsAtUtc),
            company.PackageGracePeriodEndsAtUtc,
            package?.Amount,
            package?.Currency,
            package is null ? null : FormatBillingInterval(package.IntervalCount, package.IntervalUnit),
            company.PendingPackageCode,
            pendingUpgrade?.Name,
            currentCycleEndUtc,
            !string.IsNullOrWhiteSpace(company.Address),
            availableUpgrades,
            invoices.Select(MapInvoice).ToList());
    }

    public async Task<SubscriberPackageUpgradePreviewDto> PreviewUpgradeAsync(string packageCode, CancellationToken cancellationToken = default)
    {
        var preview = await BuildUpgradePreviewAsync(packageCode, cancellationToken);
        return preview.Preview;
    }

    public async Task<SubscriberPackageBillingInvoiceDto> CreateUpgradeInvoiceAsync(string packageCode, CancellationToken cancellationToken = default)
    {
        var preview = await BuildUpgradePreviewAsync(packageCode, cancellationToken);
        var company = preview.Company;
        EnsureSubscriberBillingAddressConfigured(company);

        var existingOpenInvoices = await dbContext.Invoices
            .Where(x => x.SubscriberCompanyId == company.Id
                && x.SourceType == InvoiceSourceType.PlatformSubscription
                && x.Status != InvoiceStatus.Paid
                && x.Status != InvoiceStatus.Voided)
            .ToListAsync(cancellationToken);
        if (existingOpenInvoices.Count > 0)
        {
            throw new InvalidOperationException("Please settle the current package invoice before upgrading.");
        }

        var billingCustomer = await EnsureBillingCustomerAsync(preview.PlatformOwner.Id, company, cancellationToken);
        var invoiceNumber = await GenerateInvoiceNumberAsync(preview.PlatformCompany.Id, cancellationToken);
        var issueDateUtc = DateTime.UtcNow;
        var dueDateUtc = issueDateUtc.AddDays(preview.PlatformSettings.PaymentDueDays);
        var gracePeriodEndsAtUtc = dueDateUtc.AddDays(preview.TargetPackage.GracePeriodDays);
        var description = $"Upgrade to {preview.TargetPackage.Name} ({preview.Preview.RemainingDays} day{(preview.Preview.RemainingDays == 1 ? "" : "s")} remaining in current cycle)";

        var invoice = new Invoice
        {
            CompanyId = preview.PlatformCompany.Id,
            CustomerId = billingCustomer.Id,
            SubscriberCompanyId = company.Id,
            InvoiceNumber = invoiceNumber,
            Status = InvoiceStatus.Open,
            IssueDateUtc = issueDateUtc,
            DueDateUtc = dueDateUtc,
            PeriodEndUtc = preview.Preview.CurrentCycleEndUtc,
            SourceType = InvoiceSourceType.PlatformSubscription,
            Subtotal = preview.Preview.UpgradeSubtotal,
            TaxAmount = preview.Preview.TaxAmount,
            IsTaxEnabled = preview.TaxProfile.IsEnabled,
            TaxName = preview.TaxProfile.IsEnabled ? preview.TaxProfile.Name : null,
            TaxRate = preview.TaxProfile.IsEnabled ? preview.TaxProfile.Rate : null,
            TaxRegistrationNo = preview.TaxProfile.IsEnabled ? preview.TaxProfile.RegistrationNo : null,
            Total = preview.Preview.TotalAmount,
            AmountDue = preview.Preview.TotalAmount,
            AmountPaid = 0,
            Currency = preview.TargetPackage.Currency,
            LineItems =
            [
                new InvoiceLineItem
                {
                    CompanyId = preview.PlatformCompany.Id,
                    Description = description,
                    Quantity = 1,
                    UnitAmount = preview.Preview.UpgradeSubtotal,
                    TotalAmount = preview.Preview.UpgradeSubtotal
                }
            ]
        };

        var issuerProfile = PlatformIssuerProfileResolver.Resolve(preview.PlatformCompany, preview.PlatformSettings);
        var pdf = LocalInvoiceStorage.CreatePdf(
            issuerProfile.CompanyName,
            issuerProfile.RegistrationNumber,
            issuerProfile.BillingEmail,
            issuerProfile.Phone ?? string.Empty,
            issuerProfile.Address ?? string.Empty,
            preview.PlatformSettings.ShowCompanyAddressOnInvoice,
            await ReadBytesIfExistsAsync(preview.PlatformCompany.LogoPath, cancellationToken),
            preview.PlatformSettings.BankName,
            preview.PlatformSettings.BankAccountName,
            preview.PlatformSettings.BankAccount,
            preview.PlatformSettings.PaymentLink,
            await ReadBytesIfExistsAsync(preview.PlatformSettings.PaymentQrPath, cancellationToken),
            preview.TaxProfile.IsEnabled,
            preview.TaxProfile.Name,
            preview.TaxProfile.Rate,
            preview.TaxProfile.RegistrationNo,
            company.Name,
            company.Email,
            company.Address,
            invoice.InvoiceNumber,
            issueDateUtc,
            dueDateUtc,
            null,
            preview.Preview.CurrentCycleEndUtc,
            invoice.LineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
            invoice.Subtotal,
            invoice.Currency);
        invoice.PdfPath = await SaveInvoicePdfAsync(preview.PlatformCompany.Id, invoice.InvoiceNumber, pdf, cancellationToken);

        company.PendingPackageCode = preview.TargetPackage.Code;
        company.PackageStatus = "upgrade_pending_payment";
        company.PackageGracePeriodEndsAtUtc = gracePeriodEndsAtUtc;

        dbContext.Invoices.Add(invoice);
        await dbContext.SaveChangesAsync(cancellationToken);
        await TryWriteAuditAsync("subscriber-package.upgrade.invoice-created", nameof(Invoice), invoice.Id.ToString(), preview.PlatformCompany.Id, invoice.InvoiceNumber, cancellationToken);

        await TryAutoSendPlatformInvoiceEmailAsync(preview.PlatformCompany, billingCustomer, invoice, preview.PlatformSettings, cancellationToken);

        return MapInvoice(invoice);
    }

    public async Task<SubscriberPackageReactivationPreviewDto> PreviewReactivationAsync(string packageCode, CancellationToken cancellationToken = default)
    {
        var preview = await BuildReactivationPreviewAsync(packageCode, cancellationToken);
        return preview.Preview;
    }

    public async Task<SubscriberPackageBillingInvoiceDto> CreateReactivationInvoiceAsync(string packageCode, CancellationToken cancellationToken = default)
    {
        var preview = await BuildReactivationPreviewAsync(packageCode, cancellationToken);
        EnsureSubscriberBillingAddressConfigured(preview.Company);
        var existingOpenInvoice = await dbContext.Invoices
            .Include(x => x.Payments)
            .Include(x => x.PaymentConfirmations)
            .Where(x => x.SubscriberCompanyId == preview.Company.Id
                && x.SourceType == InvoiceSourceType.PlatformSubscription
                && x.Status != InvoiceStatus.Paid
                && x.Status != InvoiceStatus.Voided)
            .OrderByDescending(x => x.IssueDateUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (existingOpenInvoice is not null)
        {
            return MapInvoice(existingOpenInvoice);
        }

        preview.Company.SelectedPackage = preview.Package.Code;
        preview.Company.PendingPackageCode = null;
        preview.Company.PackageBillingCycleStartUtc = null;
        preview.Company.PackageGracePeriodEndsAtUtc = null;

        await dbContext.SaveChangesAsync(cancellationToken);
        await ProvisionForSubscriberCompanyAsync(preview.Company.Id, cancellationToken);

        var invoice = await dbContext.Invoices
            .Include(x => x.Payments)
            .Include(x => x.PaymentConfirmations)
            .Where(x => x.SubscriberCompanyId == preview.Company.Id && x.SourceType == InvoiceSourceType.PlatformSubscription)
            .OrderByDescending(x => x.IssueDateUtc)
            .FirstAsync(cancellationToken);

        return MapInvoice(invoice);
    }

    public async Task<SubscriberPackageBillingInvoiceDto?> CreatePaymentLinkAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var subscriberCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var subscriberCompany = await dbContext.Companies
            .FirstOrDefaultAsync(x => x.Id == subscriberCompanyId && !x.IsPlatformAccount, cancellationToken)
            ?? throw new UnauthorizedAccessException();
        EnsureSubscriberBillingAddressConfigured(subscriberCompany);

        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.Payments).ThenInclude(x => x.Attempts)
            .Include(x => x.PaymentConfirmations)
            .FirstOrDefaultAsync(x => x.Id == invoiceId && x.SubscriberCompanyId == subscriberCompanyId && x.SourceType == InvoiceSourceType.PlatformSubscription, cancellationToken);
        if (invoice?.Customer is null)
        {
            return null;
        }

        if (invoice.PaymentConfirmations.Any(x => x.Status == PaymentConfirmationStatus.Pending))
        {
            throw new InvalidOperationException("A payment confirmation is already pending for this invoice.");
        }

        invoice.Customer.BillingAddress = subscriberCompany.Address.Trim();

        var packageName = await ResolvePackageNameAsync(subscriberCompanyId, cancellationToken);
        var result = await _gateway.CreatePaymentLinkAsync(new CreatePaymentLinkCommand
        {
            CompanyId = invoice.CompanyId,
            GatewayConfigurationCompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNumber,
            Amount = invoice.AmountDue,
            Currency = invoice.Currency,
            CustomerName = invoice.Customer.Name,
            CustomerEmail = invoice.Customer.Email,
            CustomerMobile = invoice.Customer.PhoneNumber,
            Description = $"{packageName} package invoice {invoice.InvoiceNumber}",
            CallbackUrl = $"{_appUrlOptions.ApiBaseUrl.TrimEnd('/')}/api/webhooks/billplz",
            RedirectUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/package-billing"
        }, cancellationToken);

        var payment = new Payment
        {
            CompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            Amount = invoice.AmountDue,
            Currency = invoice.Currency,
            GatewayName = _gateway.Name,
            Status = PaymentStatus.Pending,
            ExternalPaymentId = result.ExternalPaymentId,
            PaymentLinkUrl = result.PaymentUrl
        };

        dbContext.Payments.Add(payment);
        dbContext.PaymentAttempts.Add(new PaymentAttempt
        {
            CompanyId = payment.CompanyId,
            Payment = payment,
            AttemptNumber = 1,
            Status = PaymentStatus.Pending,
            RawResponse = result.RawResponse
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await TryWriteAuditAsync("subscriber-package.payment-link.created", nameof(Payment), payment.Id.ToString(), invoice.InvoiceNumber, cancellationToken);

        invoice.Payments.Add(payment);
        return MapInvoice(invoice);
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var subscriberCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .FirstOrDefaultAsync(x => x.Id == invoiceId && x.SubscriberCompanyId == subscriberCompanyId && x.SourceType == InvoiceSourceType.PlatformSubscription, cancellationToken);
        if (invoice?.Customer is null)
        {
            return null;
        }

        var filePath = ResolveStoredPath(invoice.PdfPath);
        if (filePath is null || !File.Exists(filePath))
        {
            var issuerCompany = await dbContext.Companies.FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
            var invoiceSettings = await EnsurePlatformInvoiceSettingsAsync(invoice.CompanyId, cancellationToken);
            var issuerProfile = PlatformIssuerProfileResolver.Resolve(issuerCompany, invoiceSettings);
            var pdf = LocalInvoiceStorage.CreatePdf(
                issuerProfile.CompanyName,
                issuerProfile.RegistrationNumber,
                issuerProfile.BillingEmail,
                issuerProfile.Phone ?? string.Empty,
                issuerProfile.Address ?? string.Empty,
                invoiceSettings.ShowCompanyAddressOnInvoice,
                await ReadBytesIfExistsAsync(issuerCompany.LogoPath, cancellationToken),
                invoiceSettings.BankName,
                invoiceSettings.BankAccountName,
                invoiceSettings.BankAccount,
                invoiceSettings.PaymentLink,
                await ReadBytesIfExistsAsync(invoiceSettings.PaymentQrPath, cancellationToken),
                invoice.IsTaxEnabled,
                invoice.TaxName,
                invoice.TaxRate,
                invoice.TaxRegistrationNo,
                invoice.Customer.Name,
                invoice.Customer.Email,
                invoice.Customer.BillingAddress,
                invoice.InvoiceNumber,
                invoice.IssueDateUtc,
                invoice.DueDateUtc,
                null,
                null,
                invoice.LineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
                invoice.Subtotal,
                invoice.Currency);
            invoice.PdfPath = await SaveInvoicePdfAsync(invoice.CompanyId, invoice.InvoiceNumber, pdf, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            filePath = ResolveStoredPath(invoice.PdfPath);
        }

        if (filePath is null || !File.Exists(filePath))
        {
            return null;
        }

        return (await File.ReadAllBytesAsync(filePath, cancellationToken), $"{invoice.InvoiceNumber}.pdf", "application/pdf");
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadReceiptAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var subscriberCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.Id == invoiceId && x.SubscriberCompanyId == subscriberCompanyId && x.SourceType == InvoiceSourceType.PlatformSubscription, cancellationToken);
        if (invoice?.Customer is null)
        {
            return null;
        }

        var payment = invoice.Payments
            .Where(x => x.Status == PaymentStatus.Succeeded && x.PaidAtUtc.HasValue)
            .OrderByDescending(x => x.PaidAtUtc)
            .FirstOrDefault();
        if (payment is null)
        {
            return null;
        }

        var filePath = ResolveStoredPath(payment.ReceiptPdfPath);
        if (filePath is null || !File.Exists(filePath))
        {
            var issuerCompany = await dbContext.Companies.FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
            var invoiceSettings = await EnsurePlatformInvoiceSettingsAsync(invoice.CompanyId, cancellationToken);
            var packageName = await ResolvePackageNameAsync(subscriberCompanyId, cancellationToken);
            var receiptNumber = await GenerateReceiptNumberAsync(invoice.CompanyId, cancellationToken);
            var issuerProfile = PlatformIssuerProfileResolver.Resolve(issuerCompany, invoiceSettings);
            var receiptBytes = ReceiptPdfTemplate.Render(
                issuerProfile.CompanyName,
                issuerProfile.RegistrationNumber,
                issuerProfile.BillingEmail,
                invoiceSettings.ShowCompanyAddressOnReceipt ? issuerProfile.Address : null,
                invoice.Customer.Name,
                invoice.Customer.BillingAddress,
                receiptNumber,
                invoice.InvoiceNumber,
                packageName,
                payment.Amount,
                payment.Currency,
                payment.GatewayName,
                payment.PaidAtUtc!.Value,
                payment.ExternalPaymentId ?? payment.GatewayTransactionId ?? payment.GatewaySettlementRef,
                invoice.AmountDue);
            payment.ReceiptPdfPath = await SaveReceiptPdfAsync(invoice.CompanyId, receiptNumber, receiptBytes, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            filePath = ResolveStoredPath(payment.ReceiptPdfPath);
        }

        if (filePath is null || !File.Exists(filePath))
        {
            return null;
        }

        var fileName = Path.GetFileName(filePath);
        return (await File.ReadAllBytesAsync(filePath, cancellationToken), string.IsNullOrWhiteSpace(fileName) ? $"{invoice.InvoiceNumber}-receipt.pdf" : fileName, "application/pdf");
    }

    private async Task<Customer> EnsureBillingCustomerAsync(Guid platformOwnerUserId, Company subscriberCompany, CancellationToken cancellationToken)
    {
        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(x => x.SubscriberId == platformOwnerUserId && x.ExternalReference == subscriberCompany.Id.ToString("N"), cancellationToken);
        if (customer is not null)
        {
            customer.Name = subscriberCompany.Name;
            customer.Email = subscriberCompany.Email;
            customer.BillingAddress = subscriberCompany.Address;
            return customer;
        }

        customer = new Customer
        {
            SubscriberId = platformOwnerUserId,
            Name = subscriberCompany.Name,
            Email = subscriberCompany.Email,
            BillingAddress = subscriberCompany.Address,
            ExternalReference = subscriberCompany.Id.ToString("N")
        };
        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        return customer;
    }

    private async Task<CompanyInvoiceSettings> EnsurePlatformInvoiceSettingsAsync(Guid platformCompanyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == platformCompanyId, cancellationToken);
        if (settings is not null)
        {
            return settings;
        }

        settings = new CompanyInvoiceSettings
        {
            CompanyId = platformCompanyId,
            Prefix = PlatformInvoicePrefix,
            NextNumber = 1,
            Padding = 6,
            ResetYearly = false,
            ReceiptPrefix = "RCT",
            ReceiptNextNumber = 1,
            ReceiptPadding = 6,
            ReceiptResetYearly = false,
            ShowCompanyAddressOnInvoice = true,
            ShowCompanyAddressOnReceipt = true
        };
        dbContext.CompanyInvoiceSettings.Add(settings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return settings;
    }

    private async Task<string> GenerateInvoiceNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(companyId, cancellationToken);
        var invoiceNumber = InvoiceNumberFormatter.Format(
            DateTime.UtcNow,
            settings.NextNumber,
            prefix: settings.Prefix,
            padding: settings.Padding);
        settings.NextNumber += 1;
        await dbContext.SaveChangesAsync(cancellationToken);
        return invoiceNumber;
    }

    private async Task<string> GenerateReceiptNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(companyId, cancellationToken);
        var currentYear = DateTime.UtcNow.Year;
        if (settings.ReceiptResetYearly && settings.ReceiptLastResetYear != currentYear)
        {
            settings.ReceiptNextNumber = 1;
            settings.ReceiptLastResetYear = currentYear;
        }

        var receiptNumber = InvoiceNumberFormatter.Format(
            DateTime.UtcNow,
            settings.ReceiptNextNumber,
            prefix: settings.ReceiptPrefix,
            padding: settings.ReceiptPadding);
        settings.ReceiptNextNumber += 1;
        await dbContext.SaveChangesAsync(cancellationToken);
        return receiptNumber;
    }

    private async Task<string> ResolvePackageNameAsync(Guid subscriberCompanyId, CancellationToken cancellationToken)
    {
        return await dbContext.Companies
            .Where(x => x.Id == subscriberCompanyId)
            .Select(x => dbContext.PlatformPackages.Where(p => p.Code == x.SelectedPackage).Select(p => p.Name).FirstOrDefault() ?? "Subscriber package")
            .FirstAsync(cancellationToken);
    }

    private async Task<DateTime> ResolveCurrentCycleEndUtcAsync(Company company, PlatformPackage package, CancellationToken cancellationToken)
    {
        var cycleStartUtc = company.PackageBillingCycleStartUtc
            ?? await dbContext.Payments
                .Where(x => x.Invoice != null
                    && x.Invoice.SourceType == InvoiceSourceType.PlatformSubscription
                    && x.Invoice.SubscriberCompanyId == company.Id
                    && x.Status == PaymentStatus.Succeeded
                    && x.PaidAtUtc.HasValue)
                .OrderByDescending(x => x.PaidAtUtc)
                .Select(x => x.PaidAtUtc)
                .FirstOrDefaultAsync(cancellationToken)
            ?? DateTime.UtcNow;

        return AddInterval(cycleStartUtc, package.IntervalUnit, package.IntervalCount);
    }

    private async Task<(SubscriberPackageUpgradePreviewDto Preview, Company Company, Company PlatformCompany, User PlatformOwner, CompanyInvoiceSettings PlatformSettings, PlatformPackage TargetPackage, CompanyTaxProfile TaxProfile)> BuildUpgradePreviewAsync(string packageCode, CancellationToken cancellationToken)
    {
        var subscriberCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(x => x.Id == subscriberCompanyId && !x.IsPlatformAccount, cancellationToken)
            ?? throw new UnauthorizedAccessException();

        if (!string.Equals(company.PackageStatus, "active", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Only active packages can be upgraded.");
        }

        var currentPackage = await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == company.SelectedPackage, cancellationToken)
            ?? throw new InvalidOperationException("Current package could not be resolved.");
        var targetCode = packageCode.Trim().ToLowerInvariant();
        var targetPackage = await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == targetCode && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Upgrade package was not found.");

        if (targetPackage.DisplayOrder <= currentPackage.DisplayOrder || targetPackage.Amount <= currentPackage.Amount)
        {
            throw new InvalidOperationException("Downgrades and same-level package changes are not allowed.");
        }

        if (targetPackage.Currency != currentPackage.Currency
            || targetPackage.IntervalUnit != currentPackage.IntervalUnit
            || targetPackage.IntervalCount != currentPackage.IntervalCount)
        {
            throw new InvalidOperationException("Package upgrades currently require the same billing cadence and currency.");
        }

        if (!string.IsNullOrWhiteSpace(company.PendingPackageCode))
        {
            throw new InvalidOperationException("A package upgrade is already waiting for payment.");
        }

        var platformCompany = await dbContext.Companies.FirstAsync(x => x.IsPlatformAccount, cancellationToken);
        var platformOwner = await dbContext.Users.FirstAsync(x => x.IsPlatformOwner && x.CompanyId == platformCompany.Id, cancellationToken);
        var platformSettings = await EnsurePlatformInvoiceSettingsAsync(platformCompany.Id, cancellationToken);
        var taxProfile = ResolveTaxProfile(platformSettings);
        var cycleStartUtc = company.PackageBillingCycleStartUtc
            ?? await dbContext.Payments
                .Where(x => x.Invoice != null
                    && x.Invoice.SourceType == InvoiceSourceType.PlatformSubscription
                    && x.Invoice.SubscriberCompanyId == company.Id
                    && x.Status == PaymentStatus.Succeeded
                    && x.PaidAtUtc.HasValue)
                .OrderByDescending(x => x.PaidAtUtc)
                .Select(x => x.PaidAtUtc)
                .FirstOrDefaultAsync(cancellationToken)
            ?? DateTime.UtcNow;
        var cycleEndUtc = AddInterval(cycleStartUtc, currentPackage.IntervalUnit, currentPackage.IntervalCount);
        var totalTicks = Math.Max(1, (cycleEndUtc - cycleStartUtc).Ticks);
        var remainingTicks = Math.Max(0, (cycleEndUtc - DateTime.UtcNow).Ticks);
        if (remainingTicks <= 0)
        {
            throw new InvalidOperationException("The current package cycle has already ended. Wait for the next invoice cycle before changing package.");
        }

        var upgradeSubtotal = Math.Round((targetPackage.Amount - currentPackage.Amount) * remainingTicks / totalTicks, 2, MidpointRounding.AwayFromZero);
        if (upgradeSubtotal <= 0)
        {
            throw new InvalidOperationException("There is no prorated upgrade amount remaining for this cycle.");
        }

        var taxAmount = CalculateTaxAmount(upgradeSubtotal, taxProfile);
        var totalAmount = upgradeSubtotal + taxAmount;
        var remainingDays = Math.Max(1, (int)Math.Ceiling((cycleEndUtc - DateTime.UtcNow).TotalDays));
        var totalDays = Math.Max(1, (int)Math.Ceiling((cycleEndUtc - cycleStartUtc).TotalDays));

        return (
            new SubscriberPackageUpgradePreviewDto(
                currentPackage.Code,
                currentPackage.Name,
                targetPackage.Code,
                targetPackage.Name,
                currentPackage.Amount,
                targetPackage.Amount,
                upgradeSubtotal,
                taxAmount,
                totalAmount,
                targetPackage.Currency,
                remainingDays,
                totalDays,
                cycleEndUtc),
            company,
            platformCompany,
            platformOwner,
            platformSettings,
            targetPackage,
            taxProfile);
    }

    private async Task<(SubscriberPackageReactivationPreviewDto Preview, Company Company, PlatformPackage Package)> BuildReactivationPreviewAsync(string packageCode, CancellationToken cancellationToken)
    {
        var subscriberCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(x => x.Id == subscriberCompanyId && !x.IsPlatformAccount, cancellationToken)
            ?? throw new UnauthorizedAccessException();
        var packageStatus = ResolvePackageStatus(company.PackageStatus, company.PackageGracePeriodEndsAtUtc);
        if (packageStatus is not "past_due" and not "terminated")
        {
            throw new InvalidOperationException("Reactivation is only available after billing access has ended.");
        }

        var package = await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == packageCode.Trim().ToLowerInvariant() && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Selected package was not found.");
        var platformCompany = await dbContext.Companies.FirstAsync(x => x.IsPlatformAccount, cancellationToken);
        var platformSettings = await EnsurePlatformInvoiceSettingsAsync(platformCompany.Id, cancellationToken);
        var taxProfile = ResolveTaxProfile(platformSettings);
        var taxAmount = CalculateTaxAmount(package.Amount, taxProfile);

        return (
            new SubscriberPackageReactivationPreviewDto(
                package.Code,
                package.Name,
                package.Amount,
                taxAmount,
                package.Amount + taxAmount,
                package.Currency,
                FormatBillingInterval(package.IntervalCount, package.IntervalUnit)),
            company,
            package);
    }

    private static string FormatBillingInterval(int intervalCount, IntervalUnit intervalUnit)
    {
        var unit = intervalUnit switch
        {
            IntervalUnit.Month => intervalCount == 1 ? "month" : "months",
            IntervalUnit.Quarter => intervalCount == 1 ? "quarter" : "quarters",
            IntervalUnit.Year => intervalCount == 1 ? "year" : "years",
            _ => "billing cycle"
        };

        return intervalCount <= 1 ? $"Every {unit}" : $"Every {intervalCount} {unit}";
    }

    private static DateTime AddInterval(DateTime startUtc, IntervalUnit intervalUnit, int intervalCount) =>
        intervalUnit switch
        {
            IntervalUnit.Month => startUtc.AddMonths(intervalCount),
            IntervalUnit.Quarter => startUtc.AddMonths(intervalCount * 3),
            IntervalUnit.Year => startUtc.AddYears(intervalCount),
            _ => startUtc
        };

    private static CompanyTaxProfile ResolveTaxProfile(CompanyInvoiceSettings? settings)
    {
        if (settings?.IsTaxEnabled != true)
        {
            return new CompanyTaxProfile(false, "SST", null, null);
        }

        return new CompanyTaxProfile(
            true,
            string.IsNullOrWhiteSpace(settings.TaxName) ? "SST" : settings.TaxName.Trim(),
            settings.TaxRate,
            string.IsNullOrWhiteSpace(settings.TaxRegistrationNo) ? null : settings.TaxRegistrationNo.Trim());
    }

    private static decimal CalculateTaxAmount(decimal subtotal, CompanyTaxProfile taxProfile) =>
        !taxProfile.IsEnabled || !taxProfile.Rate.HasValue
            ? 0m
            : Math.Round(subtotal * taxProfile.Rate.Value / 100m, 2, MidpointRounding.AwayFromZero);

    private static string ResolvePackageStatus(string? rawStatus, DateTime? gracePeriodEndsAtUtc)
    {
        var normalized = rawStatus?.Trim().ToLowerInvariant() ?? string.Empty;
        return normalized == "pending_payment" && gracePeriodEndsAtUtc.HasValue && gracePeriodEndsAtUtc.Value < DateTime.UtcNow
            ? "past_due"
            : normalized;
    }

    private static void EnsureSubscriberBillingAddressConfigured(Company company)
    {
        if (!string.IsNullOrWhiteSpace(company.Address))
        {
            return;
        }

        throw new InvalidOperationException("Please update your company billing address in Companies before creating or paying package invoices.");
    }

    private SubscriberPackageBillingInvoiceDto MapInvoice(Invoice invoice)
    {
        var paymentLink = invoice.Payments.OrderByDescending(x => x.CreatedAtUtc).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.PaymentLinkUrl))?.PaymentLinkUrl;
        var hasReceipt = invoice.Payments.Any(x => x.Status == PaymentStatus.Succeeded && x.PaidAtUtc.HasValue);
        var hasPendingConfirmation = invoice.PaymentConfirmations.Any(x => x.Status == PaymentConfirmationStatus.Pending);
        return new SubscriberPackageBillingInvoiceDto(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.LineItems.FirstOrDefault()?.Description ?? "Subscriber package",
            invoice.Status.ToString(),
            invoice.IssueDateUtc,
            invoice.DueDateUtc,
            invoice.Total,
            invoice.AmountDue,
            invoice.Currency,
            hasReceipt,
            paymentLink,
            hasPendingConfirmation);
    }

    private async Task<string> SaveInvoicePdfAsync(Guid companyId, string invoiceNumber, byte[] pdf, CancellationToken cancellationToken)
    {
        var invoiceRoot = StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory);
        var directory = Path.Combine(invoiceRoot, companyId.ToString("N"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"{invoiceNumber}.pdf");
        await File.WriteAllBytesAsync(path, pdf, cancellationToken);
        return path.Replace("\\", "/");
    }

    private async Task<string> SaveReceiptPdfAsync(Guid companyId, string receiptNumber, byte[] pdf, CancellationToken cancellationToken)
    {
        var receiptRoot = Path.Combine(StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory), companyId.ToString("N"), "receipts");
        Directory.CreateDirectory(receiptRoot);
        var path = Path.Combine(receiptRoot, $"{receiptNumber}.pdf");
        await File.WriteAllBytesAsync(path, pdf, cancellationToken);
        return path.Replace("\\", "/");
    }

    private string? ResolveStoredPath(string? relativeOrAbsolutePath)
    {
        if (string.IsNullOrWhiteSpace(relativeOrAbsolutePath))
        {
            return null;
        }

        if (Path.IsPathRooted(relativeOrAbsolutePath))
        {
            return relativeOrAbsolutePath;
        }

        return Path.Combine(Directory.GetCurrentDirectory(), relativeOrAbsolutePath.Replace('/', Path.DirectorySeparatorChar));
    }

    private async Task SendPlatformInvoiceEmailAsync(Company issuerCompany, Customer billingCustomer, Invoice invoice, CancellationToken cancellationToken)
    {
        var filePath = ResolveStoredPath(invoice.PdfPath);
        if (filePath is null || !File.Exists(filePath))
        {
            throw new InvalidOperationException("Platform invoice PDF could not be generated for email delivery.");
        }

        var pdfContent = await File.ReadAllBytesAsync(filePath, cancellationToken);
        var invoiceSettings = await EnsurePlatformInvoiceSettingsAsync(issuerCompany.Id, cancellationToken);
        var issuerProfile = PlatformIssuerProfileResolver.Resolve(issuerCompany, invoiceSettings);
        var body = EmailTemplateRenderer.RenderInvoiceEmail(
            issuerProfile.CompanyName,
            billingCustomer.Name,
            invoice.InvoiceNumber,
            $"{invoice.Currency} {invoice.AmountDue:0.00}",
            invoice.DueDateUtc.ToString("dd MMM yyyy"),
            paymentUrl: null,
            isReminder: false);

        await emailSender.SendAsync(
            billingCustomer.Email,
            $"Invoice {invoice.InvoiceNumber}",
            body,
            attachments: [new EmailAttachment($"{invoice.InvoiceNumber}.pdf", pdfContent, "application/pdf")],
            cancellationToken: cancellationToken);
    }

    private async Task TryAutoSendPlatformInvoiceEmailAsync(Company issuerCompany, Customer billingCustomer, Invoice invoice, CompanyInvoiceSettings invoiceSettings, CancellationToken cancellationToken)
    {
        if (!invoiceSettings.AutoSendInvoices || string.IsNullOrWhiteSpace(billingCustomer.Email))
        {
            return;
        }

        try
        {
            await SendPlatformInvoiceEmailAsync(issuerCompany, billingCustomer, invoice, cancellationToken);
            await TryWriteAuditAsync("invoice.auto-sent", nameof(Invoice), invoice.Id.ToString(), issuerCompany.Id, invoice.InvoiceNumber, cancellationToken);
        }
        catch (Exception exception)
        {
            await TryWriteAuditAsync(
                "invoice.auto-send.failed",
                nameof(Invoice),
                invoice.Id.ToString(),
                issuerCompany.Id,
                $"{invoice.InvoiceNumber}: {exception.Message}",
                cancellationToken);
        }
    }

    private async Task TryWriteAuditAsync(string action, string entityName, string entityId, string? metadata, CancellationToken cancellationToken)
    {
        try
        {
            await auditService.WriteAsync(action, entityName, entityId, metadata, cancellationToken);
        }
        catch
        {
        }
    }

    private async Task TryWriteAuditAsync(string action, string entityName, string entityId, Guid companyId, string? metadata, CancellationToken cancellationToken)
    {
        try
        {
            await auditService.WriteAsync(action, entityName, entityId, companyId, metadata, cancellationToken);
        }
        catch
        {
        }
    }

    private static async Task<byte[]?> ReadBytesIfExistsAsync(string? path, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(path, cancellationToken);
    }

    private sealed record CompanyTaxProfile(bool IsEnabled, string Name, decimal? Rate, string? RegistrationNo);
}
