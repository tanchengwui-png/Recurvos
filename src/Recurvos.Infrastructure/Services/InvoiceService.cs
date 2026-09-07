using Microsoft.EntityFrameworkCore;
using System.Data;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Common;
using Recurvos.Application.CreditNotes;
using Recurvos.Application.Features;
using Recurvos.Application.Invoices;
using Recurvos.Application.Payments;
using Recurvos.Application.Platform;
using Recurvos.Application.Refunds;
using Recurvos.Application.Settings;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Templates;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Recurvos.Infrastructure.Services;

public sealed class InvoiceService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IEmailSender emailSender,
    IPlatformWhatsAppGateway platformWhatsAppGateway,
    IInvoiceStorage invoiceStorage,
    IEnumerable<IPaymentGateway> gateways,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService,
    IPackageLimitService packageLimitService,
    IBillingReadinessService billingReadinessService,
    IPaymentConfirmationService paymentConfirmationService,
    IPaymentService paymentService,
    PlatformOwnerNotificationService platformOwnerNotificationService,
    IOptions<AppUrlOptions> appUrlOptions,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : IInvoiceService
{
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private const int PublicPaymentConfirmationTokenLifetimeDays = 30;
    private readonly IReadOnlyDictionary<string, IPaymentGateway> _gateways = gateways.ToDictionary(x => x.Name, StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> AllowedPaymentProofExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    };

    private static readonly HashSet<string> AllowedPaymentProofContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpeg",
        "image/webp",
    };

    private const string DefaultInvoicePrefix = "INV";
    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<InvoiceDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        var invoices = await Query(GetCompanyId()).OrderByDescending(x => x.IssueDateUtc).ToListAsync(cancellationToken);
        if (invoices.Any(RefreshInvoicePaymentState))
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        var history = await GetHistoryMapAsync(invoices.Select(x => x.Id).ToList(), cancellationToken);
        return invoices.Select(x => Map(x, history)).ToList();
    }

    public async Task<InvoiceDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await Query(GetCompanyId()).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        if (RefreshInvoicePaymentState(invoice))
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var history = await GetHistoryMapAsync(new[] { id }, cancellationToken);
        return Map(invoice, history);
    }

    public async Task<InvoiceWhatsAppLinkOptionsDto?> GetWhatsAppLinkOptionsAsync(Guid id, CancellationToken cancellationToken = default)
        => await GetWhatsAppLinkOptionsForCompanyAsync(GetCompanyId(), id, cancellationToken);

    public async Task<InvoiceWhatsAppLinkOptionsDto?> GetWhatsAppLinkOptionsForCompanyAsync(Guid companyId, Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var paymentGatewayLink = await ResolveGatewayPaymentLinkAsync(invoice, cancellationToken);
        var paymentConfirmationLink = await ResolvePaymentConfirmationLinkAsync(invoice, cancellationToken);
        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(invoice.CompanyId, cancellationToken);
        var actionLink = paymentGatewayLink ?? paymentConfirmationLink ?? invoiceSettings?.PaymentLink;

        return new InvoiceWhatsAppLinkOptionsDto(
            invoice.Id,
            invoice.InvoiceNumber,
            actionLink,
            paymentGatewayLink,
            paymentConfirmationLink);
    }

    public async Task<InvoiceDto> CreateAsync(CreateInvoiceRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.ManualInvoices, cancellationToken);
        await billingReadinessService.EnsureReadyAsync(companyId, "invoice creation", cancellationToken);
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == request.CustomerId, cancellationToken)
            ?? throw new InvalidOperationException("Customer not found.");

        if (request.LineItems.Count == 0)
        {
            throw new InvalidOperationException("At least one invoice line item is required.");
        }

        var invoiceNumber = await GenerateInvoiceNumberAsync(companyId, cancellationToken);
        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(companyId, cancellationToken);
        var companyAddress = await ResolveCompanyInvoiceAddressAsync(companyId, request.CompanyAddressId, cancellationToken);
        var lineItems = await BuildManualInvoiceLinesAsync(companyId, request.LineItems, cancellationToken);
        var subtotal = lineItems.Sum(x => x.TotalAmount);
        var taxAmount = lineItems.Sum(x => x.TaxAmount);
        var grandTotal = lineItems.Sum(x => x.LineTotal);
        var issueDateUtc = DateTime.UtcNow;
        var taxSnapshot = await ResolveInvoiceTaxSnapshotAsync(companyId, lineItems, cancellationToken);
        var resolvedCurrency = await ResolveAndValidateInvoiceCurrencyAsync(
            companyId,
            cancellationToken,
            customer.Currency,
            await ResolveCompanyCurrencyAsync(companyId, cancellationToken));
        var invoice = new Invoice
        {
            CompanyId = companyId,
            CustomerId = customer.Id,
            InvoiceNumber = invoiceNumber,
            Status = InvoiceStatus.Open,
            IssueDateUtc = issueDateUtc,
            DueDateUtc = request.DueDateUtc.ToUniversalTime(),
            SourceType = InvoiceSourceType.Manual,
            Subtotal = subtotal,
            TaxAmount = taxAmount,
            IsTaxEnabled = taxSnapshot.IsTaxEnabled,
            TaxName = taxSnapshot.TaxName,
            TaxRate = taxSnapshot.TaxRate,
            TaxRegistrationNo = taxSnapshot.TaxRegistrationNo,
            Total = grandTotal,
            AmountDue = grandTotal,
            AmountPaid = 0,
            Currency = resolvedCurrency,
            CompanyAddressSnapshot = companyAddress,
            LineItems = lineItems
        };

        var pdf = await CreateManualInvoicePdfAsync(
            companyId,
            companyAddress,
            customer.Name,
            customer.Email,
            customer.BillingAddress,
            invoiceNumber,
            invoice.IssueDateUtc,
            invoice.DueDateUtc,
            lineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
            subtotal,
            new CompanyTaxProfile(invoice.IsTaxEnabled, invoice.TaxName ?? "Tax", invoice.TaxRate, invoice.TaxRegistrationNo),
            taxAmount,
            invoice.Currency,
            cancellationToken);
        invoice.PdfPath = await invoiceStorage.SaveInvoicePdfAsync(companyId, invoiceNumber, pdf, cancellationToken);

        dbContext.Invoices.Add(invoice);
        var rules = await dbContext.DunningRules
            .Where(x => x.CompanyId == companyId && x.IsActive)
            .ToListAsync(cancellationToken);
        foreach (var rule in rules)
        {
            dbContext.ReminderSchedules.Add(new ReminderSchedule
            {
                CompanyId = companyId,
                Invoice = invoice,
                DunningRuleId = rule.Id,
                ReminderName = rule.Name,
                OffsetDays = rule.OffsetDays,
                ScheduledAtUtc = invoice.DueDateUtc.Date.AddDays(rule.OffsetDays)
            });
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("invoice.created", nameof(Invoice), invoice.Id.ToString(), invoice.InvoiceNumber, cancellationToken);
        if (invoiceSettings?.AutoSendInvoices == true
            && await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.EmailReminders, cancellationToken))
        {
            await SendInvoiceEmailAsync(invoice, customer, cancellationToken);
            await auditService.WriteAsync("invoice.auto-sent", nameof(Invoice), invoice.Id.ToString(), invoice.InvoiceNumber, cancellationToken);
        }
        await TrySendInvoiceWhatsAppAsync(invoice, customer, cancellationToken);
        return (await GetByIdAsync(invoice.Id, cancellationToken))!;
    }

    public async Task<InvoiceDto?> CreateFromSalesOrderAsync(Guid salesOrderId, CreateSalesInvoiceRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.ManualInvoices, cancellationToken);
        await billingReadinessService.EnsureReadyAsync(companyId, "sales invoice creation", cancellationToken);
        await using var transaction = dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        var salesOrder = await dbContext.SalesOrders
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == salesOrderId, cancellationToken);
        if (salesOrder is null)
        {
            return null;
        }
        if (salesOrder.Status is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled)
            throw new InvalidOperationException($"{salesOrder.SalesOrderNumber} is closed and cannot be used to create additional documents.");
        if (salesOrder.Lines.Count > 0 && salesOrder.Lines.All(line => line.DeliveredQuantity >= line.Quantity))
            throw new InvalidOperationException($"Cannot create an invoice from {salesOrder.SalesOrderNumber} because all quantities have already been delivered.");

        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == salesOrder.ContactId, cancellationToken)
            ?? throw new InvalidOperationException("Contact not found.");

        if (request.LineItems.Count == 0)
        {
            throw new InvalidOperationException("At least one invoice line item is required.");
        }

        var directlyInvoicedByLine = await dbContext.InvoiceLineItems
            .Where(line => line.Invoice!.SalesOrderId == salesOrder.Id
                && !line.Invoice.DeliveryOrderId.HasValue
                && line.Invoice.Status != InvoiceStatus.Voided
                && line.SalesOrderLineId.HasValue)
            .GroupBy(line => line.SalesOrderLineId!.Value)
            .Select(group => new { SalesOrderLineId = group.Key, Quantity = group.Sum(line => line.Quantity) })
            .ToDictionaryAsync(item => item.SalesOrderLineId, item => item.Quantity, cancellationToken);

        var invoiceLineItems = BuildSalesOrderInvoiceLines(companyId, salesOrder, request.LineItems, directlyInvoicedByLine);
        if (invoiceLineItems.Count == 0)
        {
            throw new InvalidOperationException("At least one invoice line item is required.");
        }

        var invoice = await CreateSalesInvoiceRecordAsync(
            companyId,
            customer,
            salesOrder.Currency,
            request.DueDateUtc,
            request.PaymentTermId,
            request.UsePaymentTermDueDate,
            invoiceLineItems,
            salesOrder.Id,
            null,
            cancellationToken);

        ApplySalesOrderInvoiceQuantities(salesOrder, invoice.LineItems, 1m);
        RecomputeSalesOrderCompletion(salesOrder);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("invoice.created-from-sales-order", nameof(Invoice), invoice.Id.ToString(), salesOrder.SalesOrderNumber, cancellationToken);
        return (await GetByIdAsync(invoice.Id, cancellationToken))!;
    }

    public async Task<InvoiceDto?> CreateFromDeliveryOrderAsync(Guid deliveryOrderId, CreateSalesInvoiceRequest request, CancellationToken cancellationToken = default)
    {
        var companyId = GetCompanyId();
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.ManualInvoices, cancellationToken);
        await billingReadinessService.EnsureReadyAsync(companyId, "sales invoice creation", cancellationToken);
        await using var transaction = dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        var deliveryOrder = await dbContext.DeliveryOrders
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == deliveryOrderId, cancellationToken);
        if (deliveryOrder is null)
        {
            return null;
        }

        if (deliveryOrder.Status is DeliveryOrderStatus.Draft or DeliveryOrderStatus.Cancelled)
        {
            throw new InvalidOperationException("Only delivered delivery orders can be invoiced.");
        }
        if (deliveryOrder.Lines.Count > 0 && deliveryOrder.Lines.All(line => line.InvoicedQuantity >= line.Quantity))
            throw new InvalidOperationException($"Cannot create an invoice from {deliveryOrder.DeliveryOrderNumber} because all quantities have already been invoiced.");

        var salesOrder = deliveryOrder.SalesOrderId.HasValue
            ? await dbContext.SalesOrders.Include(x => x.Lines)
                .FirstAsync(x => x.CompanyId == companyId && x.Id == deliveryOrder.SalesOrderId.Value, cancellationToken)
            : null;
        if (salesOrder?.Status is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled)
            throw new InvalidOperationException($"{salesOrder.SalesOrderNumber} is closed and cannot be used to create additional documents.");

        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == deliveryOrder.ContactId, cancellationToken)
            ?? throw new InvalidOperationException("Contact not found.");

        if (request.LineItems.Count == 0)
        {
            throw new InvalidOperationException("At least one invoice line item is required.");
        }

        var invoiceLineItems = BuildDeliveryOrderInvoiceLines(companyId, deliveryOrder, salesOrder, request.LineItems);
        if (invoiceLineItems.Count == 0)
        {
            throw new InvalidOperationException("At least one invoice line item is required.");
        }

        var invoice = await CreateSalesInvoiceRecordAsync(
            companyId,
            customer,
            deliveryOrder.Currency,
            request.DueDateUtc,
            request.PaymentTermId,
            request.UsePaymentTermDueDate,
            invoiceLineItems,
            salesOrder?.Id,
            deliveryOrder.Id,
            cancellationToken);

        ApplyDeliveryOrderInvoiceQuantities(deliveryOrder, salesOrder, invoice.LineItems, 1m);
        if (salesOrder is not null) RecomputeSalesOrderCompletion(salesOrder);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync("invoice.created-from-delivery-order", nameof(Invoice), invoice.Id.ToString(), deliveryOrder.DeliveryOrderNumber, cancellationToken);
        return (await GetByIdAsync(invoice.Id, cancellationToken))!;
    }

    public async Task<(byte[] Content, string FileName, string ContentType)> GeneratePreviewPdfAsync(PreviewInvoiceRequest request, CancellationToken cancellationToken = default)
    {
        if (request.LineItems.Count == 0)
        {
            throw new InvalidOperationException("At least one invoice line item is required.");
        }

        if (request.IsTaxEnabled && (!request.TaxRate.HasValue || request.TaxRate.Value <= 0))
        {
            throw new InvalidOperationException("Tax rate is required when SST is enabled for preview.");
        }

        var issueDateUtc = DateTime.UtcNow;
        var invoiceNumber = string.IsNullOrWhiteSpace(request.InvoiceNumber)
            ? $"PREVIEW-{issueDateUtc:yyyyMMdd-HHmmss}"
            : request.InvoiceNumber.Trim();
        var items = request.LineItems.Select(item => (
            item.Description.Trim(),
            item.Quantity,
            item.UnitAmount,
            item.Quantity * item.UnitAmount)).ToList();
        var total = items.Sum(x => x.Item4);
        var taxProfile = new CompanyTaxProfile(
            request.IsTaxEnabled,
            string.IsNullOrWhiteSpace(request.TaxName) ? "SST" : request.TaxName.Trim(),
            request.IsTaxEnabled ? request.TaxRate : null,
            request.IsTaxEnabled && !string.IsNullOrWhiteSpace(request.TaxRegistrationNo) ? request.TaxRegistrationNo.Trim() : null);
        var companyId = GetCompanyId();
        var pdf = await CreateManualInvoicePdfAsync(
            companyId,
            await ResolveCompanyInvoiceAddressAsync(companyId, null, cancellationToken),
            request.CustomerName.Trim(),
            string.IsNullOrWhiteSpace(request.CustomerEmail) ? null : request.CustomerEmail.Trim(),
            string.IsNullOrWhiteSpace(request.CustomerAddress) ? null : request.CustomerAddress.Trim(),
            invoiceNumber,
            issueDateUtc,
            request.DueDateUtc.ToUniversalTime(),
            items,
            total,
            taxProfile,
            null,
            await ResolveCompanyCurrencyAsync(companyId, cancellationToken),
            cancellationToken);

        return (pdf, $"{invoiceNumber}.pdf", "application/pdf");
    }

    public async Task<(byte[] Content, string FileName, string ContentType)> GenerateReceiptPreviewPdfAsync(PreviewReceiptRequest request, CancellationToken cancellationToken = default)
    {
        var issueDateUtc = DateTime.UtcNow;
        var company = await dbContext.Companies.Include(x => x.Addresses).FirstAsync(x => x.Id == GetCompanyId(), cancellationToken);
        var invoiceSettings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == company.Id, cancellationToken);
        var companyAddress = ResolveDefaultCompanyAddress(company);
        var receiptNumber = string.IsNullOrWhiteSpace(request.ReceiptNumber)
            ? $"{invoiceSettings?.ReceiptPrefix ?? "RCT"}-PREVIEW-{issueDateUtc:yyyyMMdd-HHmmss}"
            : request.ReceiptNumber.Trim();
        var invoiceNumber = string.IsNullOrWhiteSpace(request.InvoiceNumber)
            ? $"INV-PREVIEW-{issueDateUtc:yyyyMMdd-HHmmss}"
            : request.InvoiceNumber.Trim();
        var receipt = ReceiptPdfTemplate.Render(
            company.Name,
            company.RegistrationNumber,
            company.Email,
            invoiceSettings?.ShowCompanyAddressOnReceipt == true ? companyAddress : null,
            await ReadCompanyLogoAsync(company.LogoPath, cancellationToken),
            request.CustomerName.Trim(),
            null,
            receiptNumber,
            invoiceNumber,
            request.Description.Trim(),
            request.Amount,
            ResolveInvoiceCurrency(request.Currency, company.Currency),
            request.PaymentMethod.Trim(),
            request.PaidAtUtc.ToUniversalTime());

        return (receipt, $"{receiptNumber}.pdf", "application/pdf");
    }

    public async Task<InvoiceDto?> GenerateSubscriptionInvoiceNowAsync(Guid subscriptionId, CancellationToken cancellationToken = default)
    {
        var subscription = await GetSubscriptionForInvoiceGenerationAsync(subscriptionId, cancellationToken);
        if (subscription is null)
        {
            return null;
        }

        var generated = await CreateSubscriptionInvoiceAsync(subscription, persist: true, previewInvoiceNumber: null, cancellationToken);
        return generated?.Invoice is null ? null : (await GetByIdAsync(generated.Invoice.Id, cancellationToken))!;
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> GenerateSubscriptionPreviewPdfAsync(Guid subscriptionId, CancellationToken cancellationToken = default)
    {
        var subscription = await GetSubscriptionForInvoiceGenerationAsync(subscriptionId, cancellationToken);
        if (subscription is null)
        {
            return null;
        }

        var previewInvoiceNumber = $"PREVIEW-{DateTime.UtcNow:yyyyMMdd-HHmmss}";
        var generated = await CreateSubscriptionInvoiceAsync(subscription, persist: false, previewInvoiceNumber, cancellationToken);
        if (generated is null)
        {
            return null;
        }

        return (generated.PdfContent, $"{previewInvoiceNumber}.pdf", "application/pdf");
    }

    public async Task<bool> SendInvoiceAsync(Guid id, SendInvoiceRequest? request = null, CancellationToken cancellationToken = default)
    {
        if (!await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.EmailReminders, cancellationToken))
        {
            throw new InvalidOperationException("Your current package does not include invoice email sending.");
        }

        var invoice = await dbContext.Invoices.Include(x => x.Customer).Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice?.Customer is null)
        {
            return false;
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            throw new InvalidOperationException("Voided invoices cannot be sent.");
        }

        var resolvedRecipient = string.IsNullOrWhiteSpace(request?.RecipientEmail) ? invoice.Customer.Email : request.RecipientEmail.Trim();
        if (!HasValidEmailAddress(resolvedRecipient))
        {
            throw new InvalidOperationException("Add a valid email address to the contact before sending this invoice.");
        }

        await billingReadinessService.EnsureReadyAsync(invoice.CompanyId, "invoice sending", cancellationToken);

        await SendInvoiceEmailAsync(invoice, invoice.Customer, cancellationToken, resolvedRecipient, request?.Message);
        await auditService.WriteAsync("invoice.sent", nameof(Invoice), invoice.Id.ToString(), invoice.InvoiceNumber, cancellationToken);
        return true;
    }

    public async Task<InvoiceDto?> MarkPaidAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices.Include(x => x.LineItems).Include(x => x.Customer)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            throw new InvalidOperationException("Voided invoices cannot be marked as paid.");
        }

        var outstanding = invoice.AmountDue;
        if (outstanding <= 0)
        {
            return await GetByIdAsync(id, cancellationToken);
        }

        ApplyPayment(invoice, outstanding);
        dbContext.Payments.Add(new Payment
        {
            CompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            Amount = outstanding,
            Currency = invoice.Currency,
            GatewayName = "Manual",
            Status = PaymentStatus.Succeeded,
            PaidAtUtc = DateTime.UtcNow
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        var paymentId = await dbContext.Payments
            .Where(x => x.InvoiceId == invoice.Id && x.Status == PaymentStatus.Succeeded)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => x.Id)
            .FirstAsync(cancellationToken);
        await platformOwnerNotificationService.TryNotifyNewPaymentAsync(paymentId, cancellationToken);
        await paymentService.TryAutoSendReceiptIfEligibleAsync(paymentId, cancellationToken);
        await auditService.WriteAsync("invoice.paid", nameof(Invoice), invoice.Id.ToString(), $"amount={outstanding:0.00}", cancellationToken);
        return await GetByIdAsync(id, cancellationToken);
    }

    public async Task<InvoiceDto?> RecordPaymentAsync(Guid id, RecordInvoicePaymentRequest request, CancellationToken cancellationToken = default)
        => await RecordPaymentWithProofAsync(id, request, null, cancellationToken);

    public async Task<InvoiceDto?> RecordPaymentWithProofAsync(Guid id, RecordInvoicePaymentRequest request, PaymentProofUpload? proof, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices.Include(x => x.LineItems).Include(x => x.Customer)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            throw new InvalidOperationException("Voided invoices cannot receive payments.");
        }

        if (request.Amount <= 0)
        {
            throw new InvalidOperationException("Payment amount must be greater than zero.");
        }

        if (invoice.AmountDue <= 0)
        {
            throw new InvalidOperationException("This invoice has no outstanding balance.");
        }

        if (request.Amount > invoice.AmountDue)
        {
            throw new InvalidOperationException("Payment amount cannot exceed the current balance.");
        }

        ApplyPayment(invoice, request.Amount);
        var payment = new Payment
        {
            CompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            Amount = request.Amount,
            Currency = invoice.Currency,
            GatewayName = request.Method.Trim(),
            Status = PaymentStatus.Succeeded,
            ExternalPaymentId = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim(),
            PaidAtUtc = request.PaidAtUtc?.ToUniversalTime() ?? DateTime.UtcNow
        };

        if (proof is not null)
        {
            var savedProof = await SavePaymentProofAsync(invoice.CompanyId, invoice.InvoiceNumber, proof, cancellationToken);
            payment.ProofFilePath = savedProof.Path;
            payment.ProofFileName = savedProof.FileName;
            payment.ProofContentType = savedProof.ContentType;
        }

        dbContext.Payments.Add(payment);
        dbContext.SalesPaymentAllocations.Add(new SalesPaymentAllocation
        {
            Payment = payment,
            InvoiceId = invoice.Id,
            Amount = request.Amount,
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await platformOwnerNotificationService.TryNotifyNewPaymentAsync(payment.Id, cancellationToken);
        await paymentService.TryAutoSendReceiptIfEligibleAsync(payment.Id, cancellationToken);
        await auditService.WriteAsync(
            "invoice.payment-recorded",
            nameof(Invoice),
            invoice.Id.ToString(),
            $"{request.Method}:{request.Amount:0.00}{(proof is null ? string.Empty : ":with-proof")}",
            cancellationToken);
        return await GetByIdAsync(id, cancellationToken);
    }

    public async Task<InvoiceDto?> ReverseLatestManualPaymentAsync(Guid id, ReverseInvoicePaymentRequest request, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var payments = await dbContext.Payments
            .Include(x => x.Attempts)
            .Include(x => x.Refunds)
            .Include(x => x.Disputes)
            .Where(x => x.CompanyId == invoice.CompanyId && x.InvoiceId == invoice.Id)
            .OrderByDescending(x => x.PaidAtUtc ?? x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var payment = payments.FirstOrDefault(IsReversibleManualPayment);
        if (payment is null)
        {
            throw new InvalidOperationException("No reversible manual payment was found for this invoice.");
        }

        var reason = request.Reason.Trim();
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new InvalidOperationException("A reason is required to reverse a payment.");
        }

        payment.Status = PaymentStatus.Reversed;

        RecalculateInvoiceAmounts(invoice, payments);

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("payment.reversed", nameof(Payment), payment.Id.ToString(), reason, cancellationToken);
        await auditService.WriteAsync("invoice.payment-reversed", nameof(Invoice), invoice.Id.ToString(), $"{payment.Id}:{reason}", cancellationToken);
        return await GetByIdAsync(id, cancellationToken);
    }

    public async Task<InvoiceDto?> RefundLatestManualPaymentAsync(Guid id, RecordRefundRequest request, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var payments = await dbContext.Payments
            .Include(x => x.Attempts)
            .Include(x => x.Refunds)
            .Include(x => x.Disputes)
            .Where(x => x.CompanyId == invoice.CompanyId && x.InvoiceId == invoice.Id)
            .OrderByDescending(x => x.PaidAtUtc ?? x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var payment = payments.FirstOrDefault(IsRefundableManualPayment);
        if (payment is null)
        {
            throw new InvalidOperationException("No refundable manual payment was found for this invoice.");
        }

        var reason = request.Reason.Trim();
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new InvalidOperationException("A reason is required to refund a payment.");
        }

        var alreadyRefunded = payment.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount);
        var refundableAmount = Math.Max(0, payment.Amount - alreadyRefunded);
        if (request.Amount <= 0)
        {
            throw new InvalidOperationException("Refund amount must be greater than zero.");
        }

        if (request.Amount > refundableAmount)
        {
            throw new InvalidOperationException($"Refund amount cannot exceed the remaining refundable amount of {payment.Currency} {refundableAmount:0.00}.");
        }

        var refund = new Refund
        {
            CompanyId = invoice.CompanyId,
            PaymentId = payment.Id,
            InvoiceId = invoice.Id,
            Amount = request.Amount,
            Currency = payment.Currency,
            Reason = reason,
            ExternalRefundId = string.IsNullOrWhiteSpace(request.ExternalRefundId) ? null : request.ExternalRefundId.Trim(),
            Status = RefundStatus.Succeeded,
            CreatedByUserId = currentUserService.UserId
        };

        dbContext.Refunds.Add(refund);
        InvoicePaymentStateCalculator.Recalculate(invoice, payments);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("refund.recorded", nameof(Refund), refund.Id.ToString(), $"payment={payment.Id}", cancellationToken);
        return await GetByIdAsync(id, cancellationToken);
    }

    public async Task<InvoiceDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices
            .Include(x => x.LineItems)
            .Include(x => x.Customer)
            .Include(x => x.CreditNotes)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        if (invoice.AmountPaid > 0)
        {
            throw new InvalidOperationException("Paid invoices cannot be voided.");
        }

        if (invoice.CreditNotes.Any(x => x.Status == CreditNoteStatus.Issued))
        {
            throw new InvalidOperationException("Invoices with issued credit notes cannot be voided.");
        }

        await ReverseSalesInvoiceQuantitiesAsync(invoice, cancellationToken);
        invoice.Status = InvoiceStatus.Voided;
        invoice.AmountDue = 0;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("invoice.cancelled", nameof(Invoice), invoice.Id.ToString(), invoice.InvoiceNumber, cancellationToken);
        return await GetByIdAsync(id, cancellationToken);
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadPdfAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (invoice is null || invoice.Customer is null)
        {
            return null;
        }

        var bytes = await RegenerateInvoicePdfAsync(invoice, invoice.Customer, cancellationToken);
        return (bytes, $"{invoice.InvoiceNumber}.pdf", "application/pdf");
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadReceiptAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
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

        var filePath = ResolvePdfPath(payment.ReceiptPdfPath);
        if (filePath is null || !File.Exists(filePath))
        {
            var company = await dbContext.Companies.FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
            var invoiceSettings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == invoice.CompanyId, cancellationToken);
            var description = invoice.LineItems.FirstOrDefault()?.Description ?? $"Invoice {invoice.InvoiceNumber}";
            var receiptNumber = await GenerateReceiptNumberAsync(invoice.CompanyId, cancellationToken);
            var receiptBytes = ReceiptPdfTemplate.Render(
                company.Name,
                company.RegistrationNumber,
                company.Email,
                invoiceSettings?.ShowCompanyAddressOnReceipt == true ? ResolveInvoiceCompanyAddressSnapshot(invoice, company.Address) : null,
                await ReadCompanyLogoAsync(company.LogoPath, cancellationToken),
                invoice.Customer.Name,
                invoice.Customer.BillingAddress,
                receiptNumber,
                invoice.InvoiceNumber,
                description,
                payment.Amount,
                payment.Currency,
                payment.GatewayName,
                payment.PaidAtUtc!.Value,
                payment.ExternalPaymentId ?? payment.GatewayTransactionId ?? payment.GatewaySettlementRef,
                invoice.AmountDue);

            var receiptRoot = Path.Combine(StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory), invoice.CompanyId.ToString("N"), "receipts");
            Directory.CreateDirectory(receiptRoot);
            var receiptPath = Path.Combine(receiptRoot, $"{receiptNumber}.pdf");
            await File.WriteAllBytesAsync(receiptPath, receiptBytes, cancellationToken);
            payment.ReceiptPdfPath = receiptPath.Replace("\\", "/");
            await dbContext.SaveChangesAsync(cancellationToken);
            filePath = ResolvePdfPath(payment.ReceiptPdfPath);
        }

        if (filePath is null || !File.Exists(filePath))
        {
            return null;
        }

        var fileName = Path.GetFileName(filePath);
        return (await File.ReadAllBytesAsync(filePath, cancellationToken), string.IsNullOrWhiteSpace(fileName) ? $"{invoice.InvoiceNumber}-receipt.pdf" : fileName, "application/pdf");
    }

    public Task<int> CountDueInvoicesForCurrentCompanyAsync(CancellationToken cancellationToken = default)
        => CountDueInvoicesAsync(GetCompanyId(), cancellationToken);

    public Task<int> GenerateDueInvoicesForCurrentCompanyAsync(CancellationToken cancellationToken = default)
        => GenerateDueInvoicesInternalAsync(GetCompanyId(), cancellationToken);

    public Task<int> GenerateDueInvoicesAsync(CancellationToken cancellationToken = default)
        => GenerateDueInvoicesInternalAsync(null, cancellationToken);

    private async Task<int> GenerateDueInvoicesInternalAsync(Guid? companyId, CancellationToken cancellationToken)
    {
        var activeRulesQuery = dbContext.DunningRules.Where(x => x.IsActive);
        if (companyId.HasValue)
        {
            activeRulesQuery = activeRulesQuery.Where(x => x.CompanyId == companyId.Value);
        }

        var activeRules = await activeRulesQuery.ToListAsync(cancellationToken);
        var rulesByCompany = activeRules.GroupBy(x => x.CompanyId).ToDictionary(x => x.Key, x => x.OrderBy(r => r.OffsetDays).ToList());

        var subscriptionsQuery = dbContext.Subscriptions
            .Include(x => x.Customer)
            .Include(x => x.Items).ThenInclude(x => x.ProductPlan)
            .Where(x => x.Status != SubscriptionStatus.Cancelled
                && x.Status != SubscriptionStatus.Paused
                && x.Items.Any(i =>
                    (i.BillingType == BillingType.OneTime && !i.EndedAtUtc.HasValue && i.CurrentPeriodStartUtc != null && i.CurrentPeriodStartUtc <= DateTime.UtcNow)
                    || 
                    (i.NextBillingUtc != null && i.NextBillingUtc <= DateTime.UtcNow && !i.EndedAtUtc.HasValue)
                    || (i.CurrentPeriodEndUtc != null && i.CurrentPeriodEndUtc <= DateTime.UtcNow && !i.AutoRenew && !i.EndedAtUtc.HasValue)));

        if (companyId.HasValue)
        {
            subscriptionsQuery = subscriptionsQuery.Where(x => x.CompanyId == companyId.Value);
        }

        var subscriptions = await subscriptionsQuery.ToListAsync(cancellationToken);

        var created = 0;
        var createdInvoices = new List<Invoice>();
        var readinessCache = new Dictionary<Guid, bool>();
        var recurringFeatureCache = new Dictionary<Guid, bool>();
        foreach (var subscription in subscriptions)
        {
            if (!await CanGenerateDueInvoicesForCompanyAsync(subscription.CompanyId, requireAutoGeneration: companyId is null, readinessCache, recurringFeatureCache, cancellationToken))
            {
                continue;
            }

            var company = await dbContext.Companies.Include(x => x.Addresses).FirstAsync(x => x.Id == subscription.CompanyId, cancellationToken);
            var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(subscription.CompanyId, cancellationToken);
            var companyAddress = ResolveDefaultCompanyAddress(company);

            while (true)
            {
                var nowUtc = DateTime.UtcNow;
                var itemsEndingWithoutRenewal = subscription.Items
                    .Where(item => SubscriptionService.ShouldEndWithoutRenewal(item, nowUtc))
                    .ToList();

                foreach (var item in itemsEndingWithoutRenewal)
                {
                    item.EndedAtUtc = item.CurrentPeriodEndUtc ?? nowUtc;
                }

                SubscriptionService.SyncAggregateSnapshot(subscription);

                var dueItems = subscription.Items
                    .Where(item => SubscriptionService.IsItemDue(item, nowUtc)
                        || SubscriptionService.IsOneTimeItemReadyForBilling(item, nowUtc))
                    .ToList();

                if (dueItems.Count == 0)
                {
                    break;
                }

                var eligibleDueItems = await GetEligibleDueItemsAsync(dueItems, cancellationToken);

                if (eligibleDueItems.Count == 0)
                {
                    break;
                }

                var dueItemCycles = eligibleDueItems
                    .Select(dueItem => new
                    {
                        Item = dueItem,
                        InvoicePeriod = ResolveInvoicePeriod(dueItem)
                    })
                    .ToList();

                var lineItems = dueItemCycles.Select(entry => new InvoiceLineItem
                {
                    CompanyId = subscription.CompanyId,
                    SubscriptionItemId = entry.Item.Id,
                    Description = BuildSubscriptionLineDescription(entry.Item),
                    Quantity = entry.Item.Quantity,
                    UnitAmount = entry.Item.UnitAmount,
                    TotalAmount = entry.Item.Quantity * entry.Item.UnitAmount
                }).ToList();
                var total = lineItems.Sum(x => x.TotalAmount);
                var taxProfile = ResolveTaxProfile(invoiceSettings);
                var taxAmount = CalculateTaxAmount(total, taxProfile);
                var grandTotal = total + taxAmount;
                var periodStartUtc = dueItemCycles.Where(x => x.InvoicePeriod.PeriodStartUtc.HasValue).Min(x => x.InvoicePeriod.PeriodStartUtc);
                var periodEndUtc = dueItemCycles.Where(x => x.InvoicePeriod.PeriodEndUtc.HasValue).Max(x => x.InvoicePeriod.PeriodEndUtc);
                var invoiceNumber = await GenerateInvoiceNumberAsync(subscription.CompanyId, cancellationToken);
                var issueDateUtc = periodStartUtc ?? nowUtc;
                var dueDateUtc = issueDateUtc.AddDays(invoiceSettings?.PaymentDueDays ?? 7);

                var invoice = new Invoice
                {
                    CompanyId = subscription.CompanyId,
                    CustomerId = subscription.CustomerId,
                    SubscriptionId = subscription.Id,
                    InvoiceNumber = invoiceNumber,
                    Status = InvoiceStatus.Open,
                    IssueDateUtc = issueDateUtc,
                    DueDateUtc = dueDateUtc,
                    PeriodStartUtc = periodStartUtc,
                    PeriodEndUtc = periodEndUtc,
                    SourceType = InvoiceSourceType.Subscription,
                    Subtotal = total,
                    TaxAmount = taxAmount,
                    IsTaxEnabled = taxProfile.IsEnabled,
                    TaxName = taxProfile.IsEnabled ? taxProfile.Name : null,
                    TaxRate = taxProfile.IsEnabled ? taxProfile.Rate : null,
                    TaxRegistrationNo = taxProfile.IsEnabled ? taxProfile.RegistrationNo : null,
                    Total = grandTotal,
                    AmountDue = grandTotal,
                    AmountPaid = 0,
                    Currency = eligibleDueItems.First().Currency,
                    CompanyAddressSnapshot = companyAddress,
                    LineItems = lineItems
                };

                var pdf = LocalInvoiceStorage.CreatePdf(
                    company.Name,
                    company.RegistrationNumber,
                    company.Email,
                    company.Phone,
                    companyAddress,
                    invoiceSettings?.ShowCompanyAddressOnInvoice ?? true,
                    await ReadCompanyLogoAsync(company.LogoPath, cancellationToken),
                    invoiceSettings?.BankName,
                    invoiceSettings?.BankAccountName,
                    invoiceSettings?.BankAccount,
                    null,
                    await ReadCompanyPaymentQrAsync(invoiceSettings?.PaymentQrPath, cancellationToken),
                    taxProfile.IsEnabled,
                    taxProfile.Name,
                    taxProfile.Rate,
                    taxProfile.RegistrationNo,
                    subscription.Customer?.Name ?? string.Empty,
                    subscription.Customer?.Email,
                    subscription.Customer?.BillingAddress,
                    invoiceNumber,
                    invoice.IssueDateUtc,
                    invoice.DueDateUtc,
                    periodStartUtc,
                    periodEndUtc,
                    lineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
                    total,
                    invoice.Currency);
                invoice.PdfPath = await invoiceStorage.SaveInvoicePdfAsync(invoice.CompanyId, invoiceNumber, pdf, cancellationToken);

                dbContext.Invoices.Add(invoice);
                createdInvoices.Add(invoice);
                if (rulesByCompany.TryGetValue(subscription.CompanyId, out var rules))
                {
                    foreach (var rule in rules)
                    {
                        dbContext.ReminderSchedules.Add(new ReminderSchedule
                        {
                            CompanyId = subscription.CompanyId,
                            Invoice = invoice,
                            DunningRuleId = rule.Id,
                            ReminderName = rule.Name,
                            OffsetDays = rule.OffsetDays,
                            ScheduledAtUtc = invoice.DueDateUtc.Date.AddDays(rule.OffsetDays)
                        });
                    }
                }

                await dbContext.SaveChangesAsync(cancellationToken);

                foreach (var recurringItem in dueItemCycles.Where(x => x.Item.BillingType == BillingType.Recurring))
                {
                    AdvanceRecurringItemAfterInvoice(recurringItem.Item, recurringItem.InvoicePeriod.PeriodStartUtc, recurringItem.InvoicePeriod.PeriodEndUtc);
                }

                foreach (var oneTimeItem in eligibleDueItems.Where(x => x.BillingType == BillingType.OneTime))
                {
                    oneTimeItem.AutoRenew = false;
                    oneTimeItem.NextBillingUtc = null;
                    oneTimeItem.EndedAtUtc = invoice.IssueDateUtc;
                }

                SubscriptionService.SyncAggregateSnapshot(subscription);
                await dbContext.SaveChangesAsync(cancellationToken);

                created++;
            }
        }
        foreach (var createdInvoice in createdInvoices.Where(x => x.Id != Guid.Empty))
        {
            await auditService.WriteAsync("invoice.created", nameof(Invoice), createdInvoice.Id.ToString(), createdInvoice.CompanyId, createdInvoice.InvoiceNumber, cancellationToken);
            var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(createdInvoice.CompanyId, cancellationToken);
            var customer = createdInvoice.CustomerId == Guid.Empty
                ? null
                : await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == createdInvoice.CompanyId && x.Id == createdInvoice.CustomerId, cancellationToken);
            if (invoiceSettings?.AutoSendInvoices == true
                && customer is not null
                && await featureEntitlementService.CompanyHasFeatureAsync(createdInvoice.CompanyId, PlatformFeatureKeys.EmailReminders, cancellationToken))
            {
                await SendInvoiceEmailAsync(createdInvoice, customer, cancellationToken);
                await auditService.WriteAsync("invoice.auto-sent", nameof(Invoice), createdInvoice.Id.ToString(), createdInvoice.CompanyId, createdInvoice.InvoiceNumber, cancellationToken);
            }

            if (customer is not null)
            {
                await TrySendInvoiceWhatsAppAsync(createdInvoice, customer, cancellationToken);
            }
        }

        return created;
    }

    private async Task<int> CountDueInvoicesAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var readinessCache = new Dictionary<Guid, bool>();
        var recurringFeatureCache = new Dictionary<Guid, bool>();
        if (!await CanGenerateDueInvoicesForCompanyAsync(companyId, requireAutoGeneration: false, readinessCache, recurringFeatureCache, cancellationToken))
        {
            return 0;
        }

        var subscriptions = await dbContext.Subscriptions
            .Include(x => x.Items)
            .Where(x => x.CompanyId == companyId
                && x.Status != SubscriptionStatus.Cancelled
                && x.Status != SubscriptionStatus.Paused
                && x.Items.Any(i =>
                    (i.BillingType == BillingType.OneTime && !i.EndedAtUtc.HasValue && i.CurrentPeriodStartUtc != null && i.CurrentPeriodStartUtc <= DateTime.UtcNow)
                    ||
                    (i.NextBillingUtc != null && i.NextBillingUtc <= DateTime.UtcNow && !i.EndedAtUtc.HasValue)
                    || (i.CurrentPeriodEndUtc != null && i.CurrentPeriodEndUtc <= DateTime.UtcNow && !i.AutoRenew && !i.EndedAtUtc.HasValue)))
            .ToListAsync(cancellationToken);

        var count = 0;
        foreach (var subscription in subscriptions)
        {
            while (true)
            {
                var nowUtc = DateTime.UtcNow;
                var itemsEndingWithoutRenewal = subscription.Items
                    .Where(item => SubscriptionService.ShouldEndWithoutRenewal(item, nowUtc))
                    .ToList();

                foreach (var item in itemsEndingWithoutRenewal)
                {
                    item.EndedAtUtc = item.CurrentPeriodEndUtc ?? nowUtc;
                }

                SubscriptionService.SyncAggregateSnapshot(subscription);

                var dueItems = subscription.Items
                    .Where(item => SubscriptionService.IsItemDue(item, nowUtc)
                        || SubscriptionService.IsOneTimeItemReadyForBilling(item, nowUtc))
                    .ToList();

                if (dueItems.Count == 0)
                {
                    break;
                }

                var eligibleDueItems = await GetEligibleDueItemsAsync(dueItems, cancellationToken);
                if (eligibleDueItems.Count == 0)
                {
                    break;
                }

                count++;

                var dueItemCycles = eligibleDueItems
                    .Select(dueItem => new
                    {
                        Item = dueItem,
                        InvoicePeriod = ResolveInvoicePeriod(dueItem)
                    })
                    .ToList();

                foreach (var recurringItem in dueItemCycles.Where(x => x.Item.BillingType == BillingType.Recurring))
                {
                    AdvanceRecurringItemAfterInvoice(recurringItem.Item, recurringItem.InvoicePeriod.PeriodStartUtc, recurringItem.InvoicePeriod.PeriodEndUtc);
                }

                foreach (var oneTimeItem in eligibleDueItems.Where(x => x.BillingType == BillingType.OneTime))
                {
                    oneTimeItem.AutoRenew = false;
                    oneTimeItem.NextBillingUtc = null;
                    oneTimeItem.EndedAtUtc = oneTimeItem.CurrentPeriodStartUtc ?? nowUtc;
                }

                SubscriptionService.SyncAggregateSnapshot(subscription);
            }
        }

        return count;
    }

    private async Task<bool> CanGenerateDueInvoicesForCompanyAsync(
        Guid companyId,
        bool requireAutoGeneration,
        IDictionary<Guid, bool> readinessCache,
        IDictionary<Guid, bool> recurringFeatureCache,
        CancellationToken cancellationToken)
    {
        if (!recurringFeatureCache.TryGetValue(companyId, out var recurringEnabled))
        {
            recurringEnabled = await featureEntitlementService.CompanyHasFeatureAsync(companyId, PlatformFeatureKeys.RecurringInvoices, cancellationToken);
            recurringFeatureCache[companyId] = recurringEnabled;
        }

        if (!recurringEnabled)
        {
            return false;
        }

        if (requireAutoGeneration
            && !await featureEntitlementService.CompanyHasFeatureAsync(companyId, PlatformFeatureKeys.AutoInvoiceGeneration, cancellationToken))
        {
            return false;
        }

        if (!readinessCache.TryGetValue(companyId, out var companyReady))
        {
            companyReady = (await billingReadinessService.GetForCompanyAsync(companyId, cancellationToken)).IsReady;
            readinessCache[companyId] = companyReady;
        }

        return companyReady;
    }

    private async Task<List<SubscriptionItem>> GetEligibleDueItemsAsync(
        IEnumerable<SubscriptionItem> dueItems,
        CancellationToken cancellationToken)
    {
        var eligibleDueItems = new List<SubscriptionItem>();
        foreach (var dueItem in dueItems)
        {
            var invoicePeriod = ResolveInvoicePeriod(dueItem);
            var cycleAlreadyInvoiced = await dbContext.InvoiceLineItems
                .Include(x => x.Invoice)
                .AnyAsync(x =>
                    x.SubscriptionItemId == dueItem.Id
                    && x.Invoice != null
                    && x.Invoice.Status != InvoiceStatus.Voided
                    && (dueItem.BillingType == BillingType.OneTime
                        ? true
                        : x.Invoice.PeriodStartUtc == invoicePeriod.PeriodStartUtc
                          && x.Invoice.PeriodEndUtc == invoicePeriod.PeriodEndUtc),
                    cancellationToken);

            if (!cycleAlreadyInvoiced)
            {
                eligibleDueItems.Add(dueItem);
            }
        }

        return eligibleDueItems;
    }

    private static (DateTime? PeriodStartUtc, DateTime? PeriodEndUtc) ResolveInvoicePeriod(SubscriptionItem item)
    {
        if (item.BillingType == BillingType.OneTime)
        {
            return (item.CurrentPeriodStartUtc, item.CurrentPeriodEndUtc);
        }

        var periodStartUtc = item.NextBillingUtc ?? item.CurrentPeriodStartUtc;
        if (!periodStartUtc.HasValue)
        {
            return (null, null);
        }

        var periodEndUtc = BillingCalculator.ComputePeriodEnd(periodStartUtc.Value, item.IntervalUnit, item.IntervalCount);
        return (periodStartUtc, periodEndUtc);
    }

    private static string BuildSubscriptionLineDescription(SubscriptionItem item)
    {
        var planName = item.ProductPlan?.PlanName ?? "Subscription";
        var billingLabel = item.BillingType == BillingType.OneTime
            ? "One-time"
            : $"{item.IntervalCount} {item.IntervalUnit}";

        return $"{planName} ({billingLabel})";
    }

    private static void AdvanceRecurringItemAfterInvoice(SubscriptionItem item, DateTime? periodStartUtc, DateTime? periodEndUtc)
    {
        if (item.BillingType != BillingType.Recurring || !periodStartUtc.HasValue || !periodEndUtc.HasValue)
        {
            return;
        }

        item.CurrentPeriodStartUtc = periodStartUtc;
        item.CurrentPeriodEndUtc = periodEndUtc;
        item.NextBillingUtc = item.AutoRenew
            ? BillingCalculator.ComputeNextBillingUtc(periodEndUtc.Value)
            : null;
    }

    private static DateTime? ResolveNextManualInvoiceEligibilityUtc(SubscriptionItem item)
    {
        if (item.EndedAtUtc.HasValue)
        {
            return null;
        }

        if (item.BillingType == BillingType.OneTime)
        {
            return item.CurrentPeriodStartUtc;
        }

        return item.NextBillingUtc ?? item.CurrentPeriodStartUtc;
    }

    private static string BuildFutureInvoiceGenerationMessage(DateTime eligibleAtUtc)
    {
        return $"This invoice cannot be generated yet. The next service period starts on {eligibleAtUtc:dd/MM/yyyy}.";
    }

    public async Task<int> SendRemindersAsync(CancellationToken cancellationToken = default)
    {
        var dueSchedules = await dbContext.ReminderSchedules
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Include(x => x.DunningRule)
            .Where(x => !x.Cancelled && x.SentAtUtc == null && x.ScheduledAtUtc <= DateTime.UtcNow)
            .ToListAsync(cancellationToken);

        var emailReminderCache = new Dictionary<Guid, bool>();
        var subscriberWhatsAppEnabledCache = new Dictionary<Guid, bool>();
        var subscriberWhatsAppTemplateCache = new Dictionary<Guid, string?>();
        var whatsAppLimitCache = new Dictionary<Guid, int>();
        var whatsAppUsageCache = new Dictionary<Guid, int>();
        var emailedInvoiceIds = new HashSet<Guid>();
        var whatsAppInvoiceIds = new HashSet<Guid>();
        foreach (var schedule in dueSchedules.Where(x =>
            x.Invoice?.Customer is not null
            && x.Invoice.Status != InvoiceStatus.Voided
            && x.Invoice.AmountDue > 0))
        {
            var claimed = await dbContext.ReminderSchedules
                .Where(x => x.Id == schedule.Id && x.SentAtUtc == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.SentAtUtc, DateTime.UtcNow), cancellationToken);

            if (claimed == 0)
            {
                continue;
            }

            var sentAny = false;

            try
            {
                if (!emailReminderCache.TryGetValue(schedule.CompanyId, out var emailRemindersEnabled))
                {
                    emailRemindersEnabled = await featureEntitlementService.CompanyHasFeatureAsync(schedule.CompanyId, PlatformFeatureKeys.EmailReminders, cancellationToken);
                    emailReminderCache[schedule.CompanyId] = emailRemindersEnabled;
                }

                if (emailRemindersEnabled && schedule.Invoice is not null)
                {
                    if (emailedInvoiceIds.Contains(schedule.Invoice.Id))
                    {
                        sentAny = true;
                    }
                    else
                    {
                        var company = await dbContext.Companies.FirstAsync(x => x.Id == schedule.CompanyId, cancellationToken);
                        var paymentLink = await ResolveInvoiceEmailActionLinkAsync(schedule.Invoice, cancellationToken);

                        var body = EmailTemplateRenderer.RenderInvoiceEmail(
                            company.Name,
                            schedule.Invoice.Customer!.Name,
                            schedule.Invoice.InvoiceNumber,
                            $"{schedule.Invoice.Currency} {schedule.Invoice.AmountDue:0.00}",
                            schedule.Invoice.DueDateUtc.ToString("dd MMM yyyy"),
                            paymentLink,
                            isReminder: true);

                        await emailSender.SendAsync(
                            schedule.Invoice.Customer.Email,
                            $"Reminder: {schedule.Invoice.InvoiceNumber}",
                            body,
                            cc: await ResolveSubscriberCustomerEmailCcAsync(schedule.CompanyId, cancellationToken),
                            logContext: new EmailLogContext(
                                CompanyId: schedule.CompanyId,
                                NotificationType: "Reminder",
                                InvoiceId: schedule.Invoice.Id,
                                InvoiceNumber: schedule.Invoice.InvoiceNumber,
                                CustomerName: schedule.Invoice.Customer!.Name),
                            cancellationToken: cancellationToken);
                        emailedInvoiceIds.Add(schedule.Invoice.Id);
                        sentAny = true;
                    }
                }

                if (!subscriberWhatsAppEnabledCache.TryGetValue(schedule.CompanyId, out var subscriberWhatsAppEnabled))
                {
                    var subscriberSettings = await dbContext.CompanyInvoiceSettings
                        .Where(x => x.CompanyId == schedule.CompanyId)
                        .Select(x => new { x.WhatsAppEnabled, x.WhatsAppTemplate })
                        .FirstOrDefaultAsync(cancellationToken);
                    subscriberWhatsAppEnabled = subscriberSettings?.WhatsAppEnabled ?? false;
                    subscriberWhatsAppEnabledCache[schedule.CompanyId] = subscriberWhatsAppEnabled;
                    subscriberWhatsAppTemplateCache[schedule.CompanyId] = subscriberSettings?.WhatsAppTemplate;
                }

                var whatsappNotificationsEnabled = await featureEntitlementService.CompanyHasFeatureAsync(schedule.CompanyId, PlatformFeatureKeys.WhatsAppNotifications, cancellationToken);

                if (whatsappNotificationsEnabled
                    && subscriberWhatsAppEnabled
                    && schedule.Invoice is not null
                    && !string.IsNullOrWhiteSpace(schedule.Invoice.Customer!.PhoneNumber))
                {
                    var monthlyLimit = 0;
                    if (whatsAppInvoiceIds.Contains(schedule.Invoice.Id))
                    {
                        sentAny = true;
                    }
                    else if (!whatsAppLimitCache.TryGetValue(schedule.CompanyId, out var cachedMonthlyLimit))
                    {
                        monthlyLimit = await packageLimitService.GetWhatsAppReminderMonthlyLimitAsync(schedule.CompanyId, cancellationToken);
                        whatsAppLimitCache[schedule.CompanyId] = monthlyLimit;
                    }
                    else
                    {
                        monthlyLimit = cachedMonthlyLimit;
                    }

                    if (monthlyLimit > 0)
                    {
                        if (!whatsAppUsageCache.TryGetValue(schedule.CompanyId, out var monthlyUsage))
                        {
                            monthlyUsage = await GetReservedWhatsAppUsageAsync(schedule.CompanyId, cancellationToken);
                            whatsAppUsageCache[schedule.CompanyId] = monthlyUsage;
                        }

                        if (monthlyUsage < monthlyLimit)
                        {
                            var queued = await TryQueuePaymentReminderWhatsAppAsync(
                                schedule,
                                schedule.Invoice,
                                schedule.Invoice.Customer,
                                subscriberWhatsAppTemplateCache.GetValueOrDefault(schedule.CompanyId),
                                cancellationToken);

                            if (queued)
                            {
                                whatsAppUsageCache[schedule.CompanyId] = monthlyUsage + 1;
                                whatsAppInvoiceIds.Add(schedule.Invoice.Id);
                                sentAny = true;
                            }
                        }
                    }
                }
            }
            catch
            {
                await dbContext.ReminderSchedules
                    .Where(x => x.Id == schedule.Id)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.SentAtUtc, (DateTime?)null), cancellationToken);
                throw;
            }

            if (!sentAny)
            {
                await dbContext.ReminderSchedules
                    .Where(x => x.Id == schedule.Id)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.SentAtUtc, (DateTime?)null), cancellationToken);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return dueSchedules.Count;
    }

    public async Task<WhatsAppRetryResultDto> RetryFailedWhatsAppNotificationAsync(Guid notificationId, CancellationToken cancellationToken = default)
    {
        var notification = await dbContext.WhatsAppNotifications
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Include(x => x.ReminderSchedule)
            .FirstOrDefaultAsync(x => x.Id == notificationId, cancellationToken)
            ?? throw new InvalidOperationException("Failed WhatsApp notification could not be found.");

        if (!string.Equals(notification.Status, "Failed", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Only failed WhatsApp notifications can be resent.");
        }

        if (notification.Invoice?.Customer is null)
        {
            throw new InvalidOperationException("The related invoice or customer could not be found.");
        }

        if (string.IsNullOrWhiteSpace(notification.Invoice.Customer.PhoneNumber))
        {
            throw new InvalidOperationException("No customer phone number is saved for this invoice.");
        }

        if (!await featureEntitlementService.CompanyHasFeatureAsync(notification.CompanyId, PlatformFeatureKeys.WhatsAppNotifications, cancellationToken))
        {
            throw new InvalidOperationException("This subscriber package does not include WhatsApp notifications.");
        }

        var subscriberSettings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == notification.CompanyId, cancellationToken);
        if (subscriberSettings?.WhatsAppEnabled != true)
        {
            throw new InvalidOperationException("WhatsApp reminders are not enabled for this company.");
        }

        var platformWhatsAppSettings = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);
        if (platformWhatsAppSettings is null || !PlatformWhatsAppIsReady(platformWhatsAppSettings))
        {
            throw new InvalidOperationException("Platform WhatsApp is not ready.");
        }

        var monthlyLimit = await packageLimitService.GetWhatsAppReminderMonthlyLimitAsync(notification.CompanyId, cancellationToken);
        if (monthlyLimit <= 0)
        {
            throw new InvalidOperationException("This package does not have a WhatsApp reminder quota configured.");
        }

        var monthStartUtc = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthlyUsage = await dbContext.WhatsAppNotifications
            .CountAsync(x => x.CompanyId == notification.CompanyId && x.Status == "Sent" && x.CreatedAtUtc >= monthStartUtc, cancellationToken);
        if (monthlyUsage >= monthlyLimit)
        {
            throw new InvalidOperationException("This company has reached its monthly WhatsApp reminder quota.");
        }

        var company = await dbContext.Companies.FirstAsync(x => x.Id == notification.CompanyId, cancellationToken);
        var paymentGatewayLink = await ResolveGatewayPaymentLinkAsync(notification.Invoice, cancellationToken);
        var paymentConfirmationLink = await ResolvePaymentConfirmationLinkAsync(notification.Invoice, cancellationToken);
        var actionLink = paymentGatewayLink ?? paymentConfirmationLink ?? subscriberSettings?.PaymentLink;
        var message = BuildWhatsAppReminderMessage(
            company.Name,
            notification.Invoice.Customer.Name,
            notification.Invoice.InvoiceNumber,
            notification.Invoice.AmountDue,
            notification.Invoice.Currency,
            notification.Invoice.DueDateUtc,
            actionLink,
            paymentGatewayLink,
            paymentConfirmationLink,
            subscriberSettings?.WhatsAppTemplate);
        var normalizedPhone = NormalizePhoneNumber(notification.Invoice.Customer.PhoneNumber);
        var result = await platformWhatsAppGateway.SendAsync(
            platformWhatsAppSettings.CompanyId,
            new PlatformWhatsAppConfiguration(
                platformWhatsAppSettings.WhatsAppEnabled,
                string.IsNullOrWhiteSpace(platformWhatsAppSettings.WhatsAppProvider) ? "generic_api" : platformWhatsAppSettings.WhatsAppProvider,
                platformWhatsAppSettings.WhatsAppApiUrl,
                platformWhatsAppSettings.WhatsAppAccessToken,
                platformWhatsAppSettings.WhatsAppSenderId,
                platformWhatsAppSettings.WhatsAppTemplate,
                platformWhatsAppSettings.WhatsAppSessionStatus,
                platformWhatsAppSettings.WhatsAppSessionPhone,
                platformWhatsAppSettings.WhatsAppSessionLastSyncedAtUtc),
            normalizedPhone,
            message,
            platformWhatsAppSettings.WhatsAppTemplate,
            notification.Invoice.InvoiceNumber,
            cancellationToken);

        if (!result.Success)
        {
            notification.ExternalMessageId = result.ExternalMessageId;
            notification.ErrorMessage = result.ErrorMessage;
            await dbContext.SaveChangesAsync(cancellationToken);
            return new WhatsAppRetryResultDto(false, result.ErrorMessage ?? "Unable to resend WhatsApp message.", result.ExternalMessageId);
        }

        notification.Status = "Retried";
        notification.ExternalMessageId = result.ExternalMessageId;
        notification.ErrorMessage = null;
        if (notification.ReminderSchedule is not null)
        {
            notification.ReminderSchedule.SentAtUtc = DateTime.UtcNow;
        }

        dbContext.WhatsAppNotifications.Add(new WhatsAppNotification
        {
            CompanyId = notification.CompanyId,
            InvoiceId = notification.InvoiceId,
            ReminderScheduleId = notification.ReminderScheduleId,
            RecipientPhoneNumber = normalizedPhone,
            Status = "Sent",
            ExternalMessageId = result.ExternalMessageId,
            ErrorMessage = null,
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("invoice.whatsapp-resent", nameof(Invoice), notification.Invoice.Id.ToString(), notification.CompanyId, notification.Invoice.InvoiceNumber, cancellationToken);
        return new WhatsAppRetryResultDto(true, "WhatsApp message resent successfully.", result.ExternalMessageId);
    }

    private static string BuildWhatsAppReminderMessage(
        string issuerName,
        string customerName,
        string invoiceNumber,
        decimal amountDue,
        string currency,
        DateTime dueDateUtc,
        string? actionLink,
        string? paymentGatewayLink,
        string? paymentConfirmationLink,
        string? customTemplate)
    {
        var amountText = $"{currency} {amountDue:0.00}";
        var template = string.IsNullOrWhiteSpace(customTemplate)
            ? "Hi {CustomerName},\n\nThis is a friendly reminder from {CompanyName}.\nInvoice {InvoiceNumber} for {AmountDue} is due on {DueDate}.\nPayment confirmation link: {ActionLink}\n\nIf payment has already been made, please ignore this message. Thank you."
            : customTemplate;

        var message = template
            .Replace("{CustomerName}", customerName, StringComparison.Ordinal)
            .Replace("{CompanyName}", issuerName, StringComparison.Ordinal)
            .Replace("{InvoiceNumber}", invoiceNumber, StringComparison.Ordinal)
            .Replace("{AmountDue}", amountText, StringComparison.Ordinal)
            .Replace("{Currency}", currency, StringComparison.Ordinal)
            .Replace("{DueDate}", dueDateUtc.ToString("dd MMM yyyy"), StringComparison.Ordinal)
            .Replace("{ActionLink}", actionLink ?? string.Empty, StringComparison.Ordinal)
            .Replace("{PaymentGatewayLink}", paymentGatewayLink ?? string.Empty, StringComparison.Ordinal)
            .Replace("{PaymentConfirmationLink}", paymentConfirmationLink ?? string.Empty, StringComparison.Ordinal)
            .Replace("{PaymentLink}", actionLink ?? string.Empty, StringComparison.Ordinal);

        if (string.IsNullOrWhiteSpace(actionLink))
        {
            message = Regex.Replace(message, @"(?im)^.*payment\s*\/\s*confirmation link:.*(\r?\n)?", string.Empty);
            message = Regex.Replace(message, @"(?im)^.*payment link:.*(\r?\n)?", string.Empty);
            message = Regex.Replace(message, @"(?im)^.*action link:.*(\r?\n)?", string.Empty);
        }

        if (string.IsNullOrWhiteSpace(paymentGatewayLink))
        {
            message = Regex.Replace(message, @"(?im)^.*payment gateway link:.*(\r?\n)?", string.Empty);
        }

        if (string.IsNullOrWhiteSpace(paymentConfirmationLink))
        {
            message = Regex.Replace(message, @"(?im)^.*payment confirmation link:.*(\r?\n)?", string.Empty);
        }

        return message
            .Replace("\r\n\r\n\r\n", "\r\n\r\n", StringComparison.Ordinal)
            .Replace("\n\n\n", "\n\n", StringComparison.Ordinal)
            .Trim();
    }

    private static string NormalizePhoneNumber(string value)
    {
        var normalized = new string(value.Where(ch => char.IsDigit(ch) || ch == '+').ToArray());
        if (normalized.StartsWith("00", StringComparison.Ordinal))
        {
            normalized = $"+{normalized[2..]}";
        }

        return normalized;
    }

    private static bool PlatformWhatsAppIsReady(CompanyInvoiceSettings settings)
    {
        var provider = string.IsNullOrWhiteSpace(settings.WhatsAppProvider)
            ? "generic_api"
            : settings.WhatsAppProvider.Trim().ToLowerInvariant();

        return provider switch
        {
            "whatsapp_web_js" => settings.WhatsAppEnabled && string.Equals(settings.WhatsAppSessionStatus, "connected", StringComparison.OrdinalIgnoreCase),
            _ => settings.WhatsAppEnabled
                && !string.IsNullOrWhiteSpace(settings.WhatsAppApiUrl)
                && !string.IsNullOrWhiteSpace(settings.WhatsAppAccessToken)
                && !string.IsNullOrWhiteSpace(settings.WhatsAppSenderId),
        };
    }

    private async Task TrySendInvoiceWhatsAppAsync(Invoice invoice, Customer customer, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(customer.PhoneNumber))
        {
            return;
        }

        if (!await featureEntitlementService.CompanyHasFeatureAsync(invoice.CompanyId, PlatformFeatureKeys.WhatsAppNotifications, cancellationToken))
        {
            return;
        }

        var subscriberSettings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == invoice.CompanyId, cancellationToken);
        if (subscriberSettings?.WhatsAppEnabled != true)
        {
            return;
        }

        var monthlyLimit = await packageLimitService.GetWhatsAppReminderMonthlyLimitAsync(invoice.CompanyId, cancellationToken);
        if (monthlyLimit <= 0)
        {
            return;
        }

        var monthlyUsage = await GetReservedWhatsAppUsageAsync(invoice.CompanyId, cancellationToken);
        if (monthlyUsage >= monthlyLimit)
        {
            return;
        }

        await TryQueueInvoiceWhatsAppAsync(invoice, customer, null, subscriberSettings?.WhatsAppTemplate, null, cancellationToken);
    }

    private async Task<bool> TryQueuePaymentReminderWhatsAppAsync(
        ReminderSchedule schedule,
        Invoice invoice,
        Customer customer,
        string? customTemplate,
        CancellationToken cancellationToken)
    {
        var queued = await TryQueueInvoiceWhatsAppAsync(
            invoice,
            customer,
            schedule.Id,
            customTemplate,
            BuildReminderWhatsAppReference(invoice.InvoiceNumber, schedule.OffsetDays),
            cancellationToken);

        if (queued)
        {
            await auditService.WriteAsync(
                "invoice.whatsapp-reminder-queued",
                nameof(Invoice),
                invoice.Id.ToString(),
                invoice.CompanyId,
                $"{invoice.InvoiceNumber}:offset={schedule.OffsetDays}",
                cancellationToken);
        }

        return queued;
    }

    private async Task<bool> TryQueueInvoiceWhatsAppAsync(
        Invoice invoice,
        Customer customer,
        Guid? reminderScheduleId,
        string? customTemplate,
        string? reference,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(customer.PhoneNumber))
        {
            return false;
        }

        var normalizedPhone = NormalizePhoneNumber(customer.PhoneNumber);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return false;
        }

        var existingQueued = await dbContext.WhatsAppOutboundQueues.AnyAsync(
            x => x.CompanyId == invoice.CompanyId
                && x.InvoiceId == invoice.Id
                && x.ReminderScheduleId == reminderScheduleId
                && (x.Status == "Pending" || x.Status == "Deferred" || x.Status == "Sending"),
            cancellationToken);

        if (existingQueued)
        {
            return true;
        }

        var company = await dbContext.Companies.FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(invoice.CompanyId, cancellationToken);
        var paymentGatewayLink = await ResolveGatewayPaymentLinkAsync(invoice, cancellationToken);
        var paymentConfirmationLink = await ResolvePaymentConfirmationLinkAsync(invoice, cancellationToken);
        var actionLink = paymentGatewayLink ?? paymentConfirmationLink ?? invoiceSettings?.PaymentLink;
        var delaySeconds = Random.Shared.Next(20, 91);

        dbContext.WhatsAppOutboundQueues.Add(new WhatsAppOutboundQueue
        {
            CompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            ReminderScheduleId = reminderScheduleId,
            RecipientPhoneNumber = normalizedPhone,
            Message = BuildWhatsAppReminderMessage(
                company.Name,
                customer.Name,
                invoice.InvoiceNumber,
                invoice.AmountDue,
                invoice.Currency,
                invoice.DueDateUtc,
                actionLink,
                paymentGatewayLink,
                paymentConfirmationLink,
                customTemplate),
            Template = customTemplate,
            Reference = string.IsNullOrWhiteSpace(reference) ? invoice.InvoiceNumber : reference,
            Status = "Pending",
            NotBeforeUtc = DateTime.UtcNow.AddSeconds(delaySeconds),
            NextAttemptAtUtc = DateTime.UtcNow.AddSeconds(delaySeconds)
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string BuildReminderWhatsAppReference(string invoiceNumber, int offsetDays)
    {
        var offsetLabel = offsetDays.ToString("+0;-0;0", System.Globalization.CultureInfo.InvariantCulture);
        return $"{invoiceNumber}:reminder:{offsetLabel}";
    }

    private async Task<int> GetReservedWhatsAppUsageAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var monthStartUtc = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var sentCount = await dbContext.WhatsAppNotifications
            .CountAsync(x => x.CompanyId == companyId && x.Status == "Sent" && x.CreatedAtUtc >= monthStartUtc, cancellationToken);
        var queuedCount = await dbContext.WhatsAppOutboundQueues
            .CountAsync(
                x => x.CompanyId == companyId
                    && (x.Status == "Pending" || x.Status == "Deferred" || x.Status == "Sending")
                    && x.CreatedAtUtc >= monthStartUtc,
                cancellationToken);

        return sentCount + queuedCount;
    }

    private async Task SendInvoiceEmailAsync(Invoice invoice, Customer customer, CancellationToken cancellationToken, string? recipientEmailOverride = null, string? message = null)
    {
        var company = await dbContext.Companies.FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
        var link = await ResolveInvoiceEmailActionLinkAsync(invoice, cancellationToken);
        var pdfContent = await RegenerateInvoicePdfAsync(
            invoice,
            customer,
            cancellationToken,
            paymentConfirmationLinkOverride: link is not null && link.Contains("/payment-confirmation", StringComparison.OrdinalIgnoreCase)
                ? link
                : null);
        var pdfFileName = $"{invoice.InvoiceNumber}.pdf";
        var body = EmailTemplateRenderer.RenderInvoiceEmail(
            company.Name,
            customer.Name,
            invoice.InvoiceNumber,
            $"{invoice.Currency} {invoice.AmountDue:0.00}",
            invoice.DueDateUtc.ToString("dd MMM yyyy"),
            link,
            isReminder: false,
            message: message);

        await emailSender.SendAsync(
            recipientEmailOverride ?? customer.Email,
            $"Invoice {invoice.InvoiceNumber}",
            body,
            [new EmailAttachment(pdfFileName, pdfContent, "application/pdf")],
            await ResolveSubscriberCustomerEmailCcAsync(invoice.CompanyId, cancellationToken),
            new EmailLogContext(
                CompanyId: invoice.CompanyId,
                NotificationType: "Invoice",
                InvoiceId: invoice.Id,
                InvoiceNumber: invoice.InvoiceNumber,
                CustomerName: customer.Name),
            cancellationToken);
    }

    private static bool HasValidEmailAddress(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            return new MailAddress(value.Trim()).Address.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private async Task<IReadOnlyCollection<string>?> ResolveSubscriberCustomerEmailCcAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var companyProjection = await dbContext.Companies
            .Where(x => x.Id == companyId && !x.IsPlatformAccount)
            .Select(x => new
            {
                x.SubscriberId,
                CcSubscriberOnCustomerEmails = x.InvoiceSettings != null ? x.InvoiceSettings.CcSubscriberOnCustomerEmails : true
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (companyProjection is null || !companyProjection.CcSubscriberOnCustomerEmails || !companyProjection.SubscriberId.HasValue)
        {
            return null;
        }

        var subscriberEmail = await dbContext.Users
            .Where(x => x.Id == companyProjection.SubscriberId.Value)
            .Select(x => x.Email)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(subscriberEmail) ? null : [subscriberEmail.Trim()];
    }

    private async Task<byte[]> RegenerateInvoicePdfAsync(
        Invoice invoice,
        Customer customer,
        CancellationToken cancellationToken,
        string? paymentConfirmationLinkOverride = null)
    {
        var company = await dbContext.Companies.FirstAsync(x => x.Id == invoice.CompanyId, cancellationToken);
        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(invoice.CompanyId, cancellationToken);
        var paymentGatewayLink = await ResolveGatewayPaymentLinkAsync(invoice, cancellationToken);
        var paymentConfirmationLink = paymentConfirmationLinkOverride;
        if (string.IsNullOrWhiteSpace(paymentConfirmationLink))
        {
            paymentConfirmationLink = await ResolvePaymentConfirmationLinkAsync(invoice, cancellationToken);
        }

        var pdf = LocalInvoiceStorage.CreatePdf(
            company.Name,
            company.RegistrationNumber,
            company.Email,
            company.Phone,
            ResolveInvoiceCompanyAddressSnapshot(invoice, company.Address),
            invoiceSettings?.ShowCompanyAddressOnInvoice ?? true,
            await ReadCompanyLogoAsync(company.LogoPath, cancellationToken),
            invoiceSettings?.BankName,
            invoiceSettings?.BankAccountName,
            invoiceSettings?.BankAccount,
            paymentGatewayLink,
            await ReadCompanyPaymentQrAsync(invoiceSettings?.PaymentQrPath, cancellationToken),
            invoice.IsTaxEnabled,
            invoice.TaxName,
            invoice.TaxRate,
            invoice.TaxRegistrationNo,
            customer.Name,
            customer.Email,
            customer.BillingAddress,
            invoice.InvoiceNumber,
            invoice.IssueDateUtc,
            invoice.DueDateUtc,
            invoice.PeriodStartUtc,
            invoice.PeriodEndUtc,
            invoice.LineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
            invoice.Subtotal,
            invoice.Currency,
            paymentConfirmationLink,
            explicitTaxTotal: invoice.TaxAmount);

        invoice.PdfPath = await invoiceStorage.SaveInvoicePdfAsync(invoice.CompanyId, invoice.InvoiceNumber, pdf, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return pdf;
    }

    private async Task<string?> ResolveInvoiceActionLinkAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        var paymentGatewayLink = await ResolveGatewayPaymentLinkAsync(invoice, cancellationToken);
        if (!string.IsNullOrWhiteSpace(paymentGatewayLink))
        {
            return paymentGatewayLink;
        }

        var paymentConfirmationLink = await ResolvePaymentConfirmationLinkAsync(invoice, cancellationToken);
        if (!string.IsNullOrWhiteSpace(paymentConfirmationLink))
        {
            return paymentConfirmationLink;
        }

        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(invoice.CompanyId, cancellationToken);
        return invoiceSettings?.PaymentLink;
    }

    private async Task<string?> ResolveInvoiceEmailActionLinkAsync(Invoice invoice, CancellationToken cancellationToken)
        => await ResolveInvoiceActionLinkAsync(invoice, cancellationToken);

    private async Task<string?> ResolveGatewayPaymentLinkAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        if (!await CanShowGatewayPaymentLinkAsync(invoice.CompanyId, cancellationToken))
        {
            return null;
        }

        var paymentLink = await dbContext.Payments
            .Where(x => x.InvoiceId == invoice.Id && !string.IsNullOrWhiteSpace(x.PaymentLinkUrl))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => x.PaymentLinkUrl)
            .FirstOrDefaultAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(paymentLink))
        {
            return paymentLink;
        }

        if (invoice.AmountDue > 0)
        {
            return await TryCreateGatewayPaymentLinkAsync(invoice, cancellationToken);
        }

        return null;
    }

    private async Task<string?> ResolvePaymentConfirmationLinkAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        if (invoice.AmountDue > 0)
        {
            return await EnsurePaymentConfirmationLinkAsync(invoice, cancellationToken);
        }

        return null;
    }

    private async Task<string> EnsurePaymentConfirmationLinkAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        var link = await paymentConfirmationService.GetOrCreateLinkAsync(invoice.Id, cancellationToken)
            ?? throw new InvalidOperationException("Unable to create payment confirmation link.");
        return link.Url;
    }

    private async Task<bool> CanShowGatewayPaymentLinkAsync(Guid companyId, CancellationToken cancellationToken)
    {
        if (!await featureEntitlementService.CompanyHasFeatureAsync(companyId, PlatformFeatureKeys.PaymentLinkGeneration, cancellationToken))
        {
            return false;
        }

        var settings = await EnsureCompanyInvoiceSettingsAsync(companyId, cancellationToken);
        if (settings is null
            || !string.Equals(settings.PaymentGatewayProvider, "billplz", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var signatureRequired = settings.SubscriberBillplzRequireSignatureVerification ?? true;
        return !string.IsNullOrWhiteSpace(settings.SubscriberBillplzApiKey)
            && !string.IsNullOrWhiteSpace(settings.SubscriberBillplzCollectionId)
            && !string.IsNullOrWhiteSpace(settings.SubscriberBillplzBaseUrl)
            && (!signatureRequired || !string.IsNullOrWhiteSpace(settings.SubscriberBillplzXSignatureKey));
    }

    private async Task<string?> TryCreateGatewayPaymentLinkAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        var customer = invoice.Customer ?? await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == invoice.CompanyId && x.Id == invoice.CustomerId, cancellationToken);
        if (customer is null)
        {
            return null;
        }

        var subscriberSettings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == invoice.CompanyId, cancellationToken);
        if (subscriberSettings is null
            || string.IsNullOrWhiteSpace(subscriberSettings.PaymentGatewayProvider)
            || string.Equals(subscriberSettings.PaymentGatewayProvider, "none", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!_gateways.TryGetValue(subscriberSettings.PaymentGatewayProvider, out var gateway))
        {
            return null;
        }

        var result = await gateway.CreatePaymentLinkAsync(new CreatePaymentLinkCommand
        {
            CompanyId = invoice.CompanyId,
            GatewayConfigurationCompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNumber,
            Amount = invoice.AmountDue,
            Currency = invoice.Currency,
            CustomerName = customer.Name,
            CustomerEmail = customer.Email,
            CustomerMobile = customer.PhoneNumber,
            Description = $"Invoice {invoice.InvoiceNumber}",
            CallbackUrl = $"{_appUrlOptions.ApiBaseUrl.TrimEnd('/')}/api/webhooks/{gateway.Name.ToLowerInvariant()}",
            RedirectUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/payment-success/{invoice.Id:D}"
        }, cancellationToken);

        var payment = new Payment
        {
            CompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            Amount = invoice.AmountDue,
            Currency = invoice.Currency,
            GatewayName = gateway.Name,
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
        await auditService.WriteAsync("payment.link.created", nameof(Payment), payment.Id.ToString(), payment.ExternalPaymentId, cancellationToken);
        return payment.PaymentLinkUrl;
    }

    private async Task<byte[]> CreateManualInvoicePdfAsync(
        Guid companyId,
        string? companyAddress,
        string customerName,
        string? customerEmail,
        string? customerAddress,
        string invoiceNumber,
        DateTime issueDateUtc,
        DateTime dueDateUtc,
        IEnumerable<(string Description, decimal Quantity, decimal UnitAmount, decimal TotalAmount)> items,
        decimal total,
        CompanyTaxProfile taxProfile,
        decimal? explicitTaxAmount,
        string currency,
        CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.FirstAsync(x => x.Id == companyId, cancellationToken);
        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(companyId, cancellationToken);

        return LocalInvoiceStorage.CreatePdf(
            company.Name,
            company.RegistrationNumber,
            company.Email,
            company.Phone,
            companyAddress,
            invoiceSettings?.ShowCompanyAddressOnInvoice ?? true,
            await ReadCompanyLogoAsync(company.LogoPath, cancellationToken),
            invoiceSettings?.BankName,
            invoiceSettings?.BankAccountName,
            invoiceSettings?.BankAccount,
            null,
            await ReadCompanyPaymentQrAsync(invoiceSettings?.PaymentQrPath, cancellationToken),
            taxProfile.IsEnabled,
            taxProfile.Name,
            taxProfile.Rate,
            taxProfile.RegistrationNo,
            customerName,
            customerEmail,
            customerAddress,
            invoiceNumber,
            issueDateUtc,
            dueDateUtc,
            null,
            null,
            items,
            total,
            currency,
            explicitTaxTotal: explicitTaxAmount);
    }

    private async Task<GeneratedSubscriptionInvoice?> CreateSubscriptionInvoiceAsync(
        Subscription subscription,
        bool persist,
        string? previewInvoiceNumber,
        CancellationToken cancellationToken)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        await billingReadinessService.EnsureReadyAsync(subscription.CompanyId, persist ? "subscription invoice generation" : "subscription invoice preview", cancellationToken);

        if (subscription.Status == SubscriptionStatus.Paused || subscription.EndedAtUtc.HasValue)
        {
            throw new InvalidOperationException("Only active subscriptions can generate renewal invoices.");
        }

        SubscriptionService.SyncAggregateSnapshot(subscription);
        var invoiceSettings = await EnsureCompanyInvoiceSettingsAsync(subscription.CompanyId, cancellationToken);
        var company = subscription.Company ?? await dbContext.Companies.Include(x => x.Addresses).FirstAsync(x => x.Id == subscription.CompanyId, cancellationToken);
        var companyAddress = ResolveDefaultCompanyAddress(company);
        var eligibleItems = new List<SubscriptionItem>();
        var nowUtc = DateTime.UtcNow;
        foreach (var item in subscription.Items.Where(x =>
                     !x.EndedAtUtc.HasValue
                     && (x.BillingType == BillingType.Recurring || x.BillingType == BillingType.OneTime)))
        {
            var invoicePeriod = ResolveInvoicePeriod(item);
            if (!invoicePeriod.PeriodStartUtc.HasValue)
            {
                continue;
            }

            var isDueForInvoicing = !persist
                || SubscriptionService.IsItemDue(item, nowUtc)
                || SubscriptionService.IsOneTimeItemReadyForBilling(item, nowUtc);
            if (!isDueForInvoicing)
            {
                continue;
            }

            var cycleAlreadyInvoiced = await dbContext.InvoiceLineItems
                .Include(x => x.Invoice)
                .AnyAsync(x =>
                    x.SubscriptionItemId == item.Id
                    && x.Invoice != null
                    && x.Invoice.Status != InvoiceStatus.Voided
                    && (item.BillingType == BillingType.OneTime
                        ? true
                        : x.Invoice.PeriodStartUtc == invoicePeriod.PeriodStartUtc
                          && x.Invoice.PeriodEndUtc == invoicePeriod.PeriodEndUtc),
                    cancellationToken);

            if (!cycleAlreadyInvoiced)
            {
                eligibleItems.Add(item);
            }
        }

        if (eligibleItems.Count == 0)
        {
            var nextEligibleUtc = persist
                ? subscription.Items
                    .Select(ResolveNextManualInvoiceEligibilityUtc)
                    .Where(date => date.HasValue && date.Value > nowUtc)
                    .OrderBy(date => date)
                    .Select(date => date!.Value)
                    .FirstOrDefault()
                : (DateTime?)null;

            throw new InvalidOperationException(persist
                ? nextEligibleUtc.HasValue
                    ? BuildFutureInvoiceGenerationMessage(nextEligibleUtc.Value)
                    : "No subscription items are due for invoicing yet."
                : "An invoice already exists for the current billing cycle.");
        }

        var eligibleItemCycles = eligibleItems
            .Select(item => new
            {
                Item = item,
                InvoicePeriod = ResolveInvoicePeriod(item)
            })
            .ToList();

        var lineItems = eligibleItemCycles.Select(entry => new InvoiceLineItem
        {
            CompanyId = subscription.CompanyId,
            SubscriptionItemId = entry.Item.Id,
            Description = BuildSubscriptionLineDescription(entry.Item),
            Quantity = entry.Item.Quantity,
            UnitAmount = entry.Item.UnitAmount,
            TotalAmount = entry.Item.Quantity * entry.Item.UnitAmount
        }).ToList();
        var total = lineItems.Sum(x => x.TotalAmount);
        var taxProfile = ResolveTaxProfile(invoiceSettings);
        var taxAmount = CalculateTaxAmount(total, taxProfile);
        var grandTotal = total + taxAmount;
        var periodStartUtc = eligibleItemCycles.Where(x => x.InvoicePeriod.PeriodStartUtc.HasValue).Min(x => x.InvoicePeriod.PeriodStartUtc);
        var periodEndUtc = eligibleItemCycles.Where(x => x.InvoicePeriod.PeriodEndUtc.HasValue).Max(x => x.InvoicePeriod.PeriodEndUtc);
        var issueDateUtc = periodStartUtc ?? DateTime.UtcNow;
        var dueDateUtc = issueDateUtc.AddDays(invoiceSettings?.PaymentDueDays ?? 7);
        var invoiceNumber = persist ? await GenerateInvoiceNumberAsync(subscription.CompanyId, cancellationToken) : previewInvoiceNumber ?? $"PREVIEW-{issueDateUtc:yyyyMMdd-HHmmss}";
        var pdf = LocalInvoiceStorage.CreatePdf(
            company.Name,
            company.RegistrationNumber,
            company.Email,
            company.Phone,
            companyAddress,
            invoiceSettings?.ShowCompanyAddressOnInvoice ?? true,
            await ReadCompanyLogoAsync(company.LogoPath, cancellationToken),
            invoiceSettings?.BankName,
            invoiceSettings?.BankAccountName,
            invoiceSettings?.BankAccount,
            null,
            await ReadCompanyPaymentQrAsync(invoiceSettings?.PaymentQrPath, cancellationToken),
            taxProfile.IsEnabled,
            taxProfile.Name,
            taxProfile.Rate,
            taxProfile.RegistrationNo,
            subscription.Customer?.Name ?? string.Empty,
            subscription.Customer?.Email,
            subscription.Customer?.BillingAddress,
            invoiceNumber,
            issueDateUtc,
            dueDateUtc,
            periodStartUtc,
            periodEndUtc,
            lineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
            total,
            subscription.Currency);

        if (!persist)
        {
            return new GeneratedSubscriptionInvoice(null, pdf);
        }

        var invoice = new Invoice
        {
            CompanyId = subscription.CompanyId,
            CustomerId = subscription.CustomerId,
            SubscriptionId = subscription.Id,
            InvoiceNumber = invoiceNumber,
            Status = InvoiceStatus.Open,
            IssueDateUtc = issueDateUtc,
            DueDateUtc = dueDateUtc,
            PeriodStartUtc = periodStartUtc,
            PeriodEndUtc = periodEndUtc,
            SourceType = InvoiceSourceType.Subscription,
            Subtotal = total,
            TaxAmount = taxAmount,
            IsTaxEnabled = taxProfile.IsEnabled,
            TaxName = taxProfile.IsEnabled ? taxProfile.Name : null,
            TaxRate = taxProfile.IsEnabled ? taxProfile.Rate : null,
            TaxRegistrationNo = taxProfile.IsEnabled ? taxProfile.RegistrationNo : null,
            Total = grandTotal,
            AmountDue = grandTotal,
            AmountPaid = 0,
            Currency = subscription.Currency,
            CompanyAddressSnapshot = companyAddress,
            LineItems = lineItems
        };

        invoice.PdfPath = await invoiceStorage.SaveInvoicePdfAsync(invoice.CompanyId, invoiceNumber, pdf, cancellationToken);
        dbContext.Invoices.Add(invoice);
        var rules = await dbContext.DunningRules.Where(x => x.CompanyId == subscription.CompanyId && x.IsActive).ToListAsync(cancellationToken);
        foreach (var rule in rules)
        {
            dbContext.ReminderSchedules.Add(new ReminderSchedule
            {
                CompanyId = subscription.CompanyId,
                Invoice = invoice,
                DunningRuleId = rule.Id,
                ReminderName = rule.Name,
                OffsetDays = rule.OffsetDays,
                ScheduledAtUtc = invoice.DueDateUtc.Date.AddDays(rule.OffsetDays)
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("invoice.created", nameof(Invoice), invoice.Id.ToString(), invoice.CompanyId, invoice.InvoiceNumber, cancellationToken);

        var subscriptionCustomer = subscription.Customer
            ?? await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyId == subscription.CompanyId && x.Id == invoice.CustomerId, cancellationToken);
        if (invoiceSettings?.AutoSendInvoices == true
            && subscriptionCustomer is not null
            && await featureEntitlementService.CompanyHasFeatureAsync(subscription.CompanyId, PlatformFeatureKeys.EmailReminders, cancellationToken))
        {
            await SendInvoiceEmailAsync(invoice, subscriptionCustomer, cancellationToken);
            await auditService.WriteAsync("invoice.auto-sent", nameof(Invoice), invoice.Id.ToString(), invoice.CompanyId, invoice.InvoiceNumber, cancellationToken);
        }

        if (subscriptionCustomer is not null)
        {
            await TrySendInvoiceWhatsAppAsync(invoice, subscriptionCustomer, cancellationToken);
        }

        foreach (var recurringItem in eligibleItemCycles.Where(x => x.Item.BillingType == BillingType.Recurring))
        {
            AdvanceRecurringItemAfterInvoice(recurringItem.Item, recurringItem.InvoicePeriod.PeriodStartUtc, recurringItem.InvoicePeriod.PeriodEndUtc);
        }

        foreach (var oneTimeItem in eligibleItems.Where(x => x.BillingType == BillingType.OneTime))
        {
            oneTimeItem.AutoRenew = false;
            oneTimeItem.NextBillingUtc = null;
            oneTimeItem.EndedAtUtc = issueDateUtc;
        }

        SubscriptionService.SyncAggregateSnapshot(subscription);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new GeneratedSubscriptionInvoice(invoice, pdf);
    }

    private async Task<Subscription?> GetSubscriptionForInvoiceGenerationAsync(Guid subscriptionId, CancellationToken cancellationToken)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken);
        var activeCompanyId = GetCompanyId();

        return await dbContext.Subscriptions
            .Include(x => x.Company)
            .Include(x => x.Customer)
            .Include(x => x.Items).ThenInclude(x => x.ProductPlan)
            .FirstOrDefaultAsync(x => x.CompanyId == activeCompanyId && x.Id == subscriptionId, cancellationToken);
    }

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

    private async Task<string?> ResolveCompanyInvoiceAddressAsync(Guid companyId, Guid? companyAddressId, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstAsync(x => x.Id == companyId, cancellationToken);

        if (companyAddressId.HasValue)
        {
            var selectedAddress = company.Addresses.FirstOrDefault(x => x.Id == companyAddressId.Value)
                ?? throw new InvalidOperationException("Selected company address could not be found.");
            return FormatCompanyAddress(selectedAddress);
        }

        return ResolveDefaultCompanyAddress(company);
    }

    private async Task<string> ResolveCompanyCurrencyAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var companyCurrency = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => x.Currency)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(companyCurrency) ? string.Empty : companyCurrency.Trim().ToUpperInvariant();
    }

    private static string ResolveInvoiceCurrency(params string?[] candidates)
    {
        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate))
            {
                return candidate.Trim().ToUpperInvariant();
            }
        }

        return string.Empty;
    }

    private async Task<string> ResolveAndValidateInvoiceCurrencyAsync(Guid companyId, CancellationToken cancellationToken, params string?[] candidates)
    {
        var currency = ResolveInvoiceCurrency(candidates);
        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new InvalidOperationException("Select a valid currency.");
        }

        var exists = await dbContext.CurrencyDefinitions.AnyAsync(
            x => x.CompanyId == companyId && x.IsActive && x.Code == currency,
            cancellationToken);
        if (!exists)
        {
            throw new InvalidOperationException("Select a valid currency.");
        }

        return currency;
    }

    private static string? ResolveDefaultCompanyAddress(Company company)
    {
        var address = company.Addresses.FirstOrDefault(x => x.IsDefaultBilling)
            ?? company.Addresses.OrderBy(x => x.CreatedAtUtc).FirstOrDefault();
        return address is null ? company.Address : FormatCompanyAddress(address);
    }

    private static string? ResolveInvoiceCompanyAddressSnapshot(Invoice invoice, string? fallbackAddress) =>
        string.IsNullOrWhiteSpace(invoice.CompanyAddressSnapshot) ? fallbackAddress : invoice.CompanyAddressSnapshot;

    private static string FormatCompanyAddress(CompanyAddress address)
    {
        var cityLine = string.Join(", ", new[]
        {
            NormalizeOptionalText(address.City),
            NormalizeOptionalText(address.State),
            NormalizeOptionalText(address.Postcode),
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return string.Join(
            "\n",
            new[]
            {
                address.AddressLine1.Trim(),
                NormalizeOptionalText(address.AddressLine2),
                NormalizeOptionalText(address.AddressLine3),
                cityLine,
                NormalizeOptionalText(address.Country),
            }.Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    private static string? NormalizeOptionalText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record CompanyTaxProfile(bool IsEnabled, string Name, decimal? Rate, string? RegistrationNo);
    private sealed record InvoiceTaxSnapshot(bool IsTaxEnabled, string? TaxName, decimal? TaxRate, string? TaxRegistrationNo);
    private sealed record GeneratedSubscriptionInvoice(Invoice? Invoice, byte[] PdfContent);

    private async Task<CompanyInvoiceSettings> EnsureCompanyInvoiceSettingsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);
        if (settings is not null)
        {
            return settings;
        }

        var company = await dbContext.Companies.FirstAsync(x => x.Id == companyId, cancellationToken);
        settings = new CompanyInvoiceSettings
        {
            CompanyId = companyId,
            Prefix = DefaultInvoicePrefix,
            NextNumber = 1,
            Padding = 4,
            ResetYearly = false,
            LastResetYear = null,
            ReceiptPrefix = "RCT",
            ReceiptNextNumber = 1,
                ReceiptPadding = 4,
                ReceiptResetYearly = false,
                ReceiptLastResetYear = null,
                AutoSendInvoices = true,
                CcSubscriberOnCustomerEmails = true,
                ShowCompanyAddressOnInvoice = true,
                ShowCompanyAddressOnReceipt = true
            };
        await CompanyInvoiceSettingsCreation.ApplySubscriberPackageDefaultsAsync(dbContext, settings, cancellationToken);
        return await CompanyInvoiceSettingsCreation.AddOrGetExistingAsync(dbContext, settings, cancellationToken);
    }

    private async Task<string> GenerateInvoiceNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await EnsureCompanyInvoiceSettingsAsync(companyId, cancellationToken);

        var currentYear = DateTime.UtcNow.Year;
        if (settings.ResetYearly && settings.LastResetYear != currentYear)
        {
            settings.NextNumber = 1;
            settings.LastResetYear = currentYear;
        }

        var customPattern = settings.Prefix.Contains('{') ? settings.Prefix : null;
        var invoiceNumber = InvoiceNumberFormatter.Format(
            DateTime.UtcNow,
            settings.NextNumber,
            customPattern: customPattern,
            prefix: customPattern is null ? settings.Prefix : "INV",
            padding: settings.Padding);
        settings.NextNumber += 1;
        return invoiceNumber;
    }

    private async Task<string> GenerateReceiptNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await EnsureCompanyInvoiceSettingsAsync(companyId, cancellationToken);

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
        return receiptNumber;
    }

    private IQueryable<Invoice> Query(Guid companyId) =>
        dbContext.Invoices
            .Include(x => x.Customer)
            .Include(x => x.LineItems)
            .Include(x => x.Refunds)
            .Include(x => x.Payments).ThenInclude(x => x.Refunds)
            .Include(x => x.Payments).ThenInclude(x => x.Allocations)
            .Include(x => x.CreditNotes).ThenInclude(x => x.Lines)
            .Where(x => x.CompanyId == companyId);

    private static bool RefreshInvoicePaymentState(Invoice invoice)
    {
        // Preserve legacy invoices that predate transactional records. Any invoice
        // with a refund or issued credit note is reconciled from its source of truth.
        if (!invoice.Refunds.Any(refund => refund.Status == RefundStatus.Succeeded)
            && !invoice.CreditNotes.Any(creditNote => creditNote.Status == CreditNoteStatus.Issued))
        {
            return false;
        }

        var previousPaid = invoice.AmountPaid;
        var previousDue = invoice.AmountDue;
        var previousStatus = invoice.Status;
        InvoicePaymentStateCalculator.Recalculate(invoice, invoice.Payments, invoice.CreditNotes);
        return previousPaid != invoice.AmountPaid || previousDue != invoice.AmountDue || previousStatus != invoice.Status;
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<InvoiceHistoryDto>>> GetHistoryMapAsync(IEnumerable<Guid> invoiceIds, CancellationToken cancellationToken)
    {
        var ids = invoiceIds.Select(x => x.ToString()).ToList();
        var entries = await dbContext.AuditLogs
            .Where(x => x.CompanyId == GetCompanyId() && x.EntityName == nameof(Invoice) && ids.Contains(x.EntityId))
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return entries
            .GroupBy(x => Guid.Parse(x.EntityId))
            .ToDictionary(
                x => x.Key,
                x => (IReadOnlyCollection<InvoiceHistoryDto>)x.Select(entry => new InvoiceHistoryDto(entry.CreatedAtUtc, entry.Action, entry.Metadata ?? entry.Action)).ToList());
    }

    private static void ApplyPayment(Invoice invoice, decimal amount)
    {
        invoice.AmountPaid += amount;
        invoice.AmountDue = Math.Max(0, invoice.Total - invoice.AmountPaid);
        invoice.Status = invoice.AmountDue <= 0 ? InvoiceStatus.Paid : InvoiceStatus.Open;
    }

    private static void RecalculateInvoiceAmounts(Invoice invoice, IReadOnlyCollection<Payment> payments) =>
        InvoicePaymentStateCalculator.Recalculate(invoice, payments);

    private static bool IsReversibleManualPayment(Payment payment) =>
        payment.Status == PaymentStatus.Succeeded
        && payment.Attempts.Count == 0
        && payment.Refunds.All(x => x.Status != RefundStatus.Succeeded)
        && payment.Disputes.Count == 0;

    private static bool IsRefundableManualPayment(Payment payment) =>
        payment.Status == PaymentStatus.Succeeded
        && payment.Attempts.Count == 0
        && payment.Disputes.Count == 0
        && payment.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount) < payment.Amount;

    private async Task<(string Path, string FileName, string ContentType)> SavePaymentProofAsync(
        Guid companyId,
        string invoiceNumber,
        PaymentProofUpload proof,
        CancellationToken cancellationToken)
    {
        var maxUploadBytes = await ResolveUploadMaxBytesAsync(cancellationToken);
        if (proof.Content.Length == 0 || proof.Content.Length > maxUploadBytes)
        {
            throw new InvalidOperationException($"Proof upload must be {(maxUploadBytes / 1_000_000d):0.#} MB or smaller.");
        }

        var extension = Path.GetExtension(proof.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedPaymentProofExtensions.Contains(extension))
        {
            throw new InvalidOperationException("Proof upload must be a PNG, JPG, JPEG, or WEBP image.");
        }

        var contentType = string.IsNullOrWhiteSpace(proof.ContentType) ? "application/octet-stream" : proof.ContentType.Trim();
        if (!AllowedPaymentProofContentTypes.Contains(contentType))
        {
            throw new InvalidOperationException("Proof upload content type is not allowed.");
        }

        var proofRoot = StoragePathResolver.Resolve(_environment, _storageOptions.PaymentProofDirectory);
        Directory.CreateDirectory(proofRoot);
        var companyDirectory = Path.Combine(proofRoot, companyId.ToString("N"));
        Directory.CreateDirectory(companyDirectory);

        var safeExtension = extension.ToLowerInvariant();
        var safeBaseName = string.Concat(invoiceNumber.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')).Trim('-');
        if (string.IsNullOrWhiteSpace(safeBaseName))
        {
            safeBaseName = "payment-proof";
        }

        var fileName = $"{safeBaseName}-{Guid.NewGuid():N}{safeExtension}";
        var filePath = Path.Combine(companyDirectory, fileName);
        await File.WriteAllBytesAsync(filePath, proof.Content, cancellationToken);
        return (filePath, proof.FileName, contentType);
    }

    private async Task<int> ResolveUploadMaxBytesAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        return Math.Min(AbsoluteUploadMaxBytes, Math.Max(200_000, settings?.UploadMaxBytes ?? 2_000_000));
    }

    private List<InvoiceLineItem> BuildSalesOrderInvoiceLines(Guid companyId, SalesOrder salesOrder, IReadOnlyCollection<CreateSalesInvoiceLineItemRequest> requests, IReadOnlyDictionary<Guid, decimal> directlyInvoicedByLine)
    {
        var duplicates = requests.Where(x => x.SalesOrderLineId.HasValue).GroupBy(x => x.SalesOrderLineId).Where(x => x.Count() > 1).ToList();
        if (duplicates.Count > 0)
        {
            throw new InvalidOperationException("Each sales order line can only be invoiced once per document.");
        }

        var lines = new List<InvoiceLineItem>();
        foreach (var request in requests)
        {
            if (request.Quantity <= 0m)
            {
                throw new InvalidOperationException("Invoice quantity must be greater than zero.");
            }
            if (!request.SalesOrderLineId.HasValue)
            {
                throw new InvalidOperationException("Sales order line is required.");
            }

            var sourceLine = salesOrder.Lines.FirstOrDefault(x => x.Id == request.SalesOrderLineId.Value)
                ?? throw new InvalidOperationException("Selected sales order line was not found.");
            var remainingQuantity = Math.Max(0m, sourceLine.Quantity - sourceLine.DeliveredQuantity - directlyInvoicedByLine.GetValueOrDefault(sourceLine.Id));
            if (request.Quantity > remainingQuantity)
            {
                throw new InvalidOperationException($"Invoice quantity for '{sourceLine.Description}' exceeds the directly invoiceable quantity ({remainingQuantity}). Delivered quantities must be invoiced from their delivery order.");
            }

            var lineSubtotal = Math.Round(request.Quantity * sourceLine.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (sourceLine.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);

            lines.Add(new InvoiceLineItem
            {
                CompanyId = companyId,
                SalesOrderLineId = sourceLine.Id,
                TaxCodeId = sourceLine.TaxCodeId,
                Description = sourceLine.Description,
                Quantity = request.Quantity,
                UnitAmount = sourceLine.UnitPrice,
                TaxRate = sourceLine.TaxRate,
                TaxAmount = lineTax,
                TotalAmount = lineSubtotal,
                LineTotal = lineSubtotal + lineTax,
            });
        }

        return lines;
    }

    private List<InvoiceLineItem> BuildDeliveryOrderInvoiceLines(Guid companyId, DeliveryOrder deliveryOrder, SalesOrder? salesOrder, IReadOnlyCollection<CreateSalesInvoiceLineItemRequest> requests)
    {
        var duplicates = requests.Where(x => x.DeliveryOrderLineId.HasValue).GroupBy(x => x.DeliveryOrderLineId).Where(x => x.Count() > 1).ToList();
        if (duplicates.Count > 0)
        {
            throw new InvalidOperationException("Each delivery order line can only be invoiced once per document.");
        }

        var lines = new List<InvoiceLineItem>();
        foreach (var request in requests)
        {
            if (request.Quantity <= 0m)
            {
                throw new InvalidOperationException("Invoice quantity must be greater than zero.");
            }
            if (!request.DeliveryOrderLineId.HasValue)
            {
                throw new InvalidOperationException("Delivery order line is required.");
            }

            var deliveryLine = deliveryOrder.Lines.FirstOrDefault(x => x.Id == request.DeliveryOrderLineId.Value)
                ?? throw new InvalidOperationException("Selected delivery order line was not found.");
            var sourceLine = salesOrder is not null && deliveryLine.SalesOrderLineId.HasValue
                ? salesOrder.Lines.FirstOrDefault(x => x.Id == deliveryLine.SalesOrderLineId.Value)
                    ?? throw new InvalidOperationException("Selected sales order line was not found.")
                : null;
            var deliveryRemainingQuantity = Math.Max(0m, deliveryLine.Quantity - deliveryLine.InvoicedQuantity);
            var salesOrderRemainingQuantity = sourceLine is null ? deliveryRemainingQuantity : Math.Max(0m, sourceLine.Quantity - sourceLine.InvoicedQuantity);
            var availableQuantity = Math.Min(deliveryRemainingQuantity, salesOrderRemainingQuantity);
            if (request.Quantity > availableQuantity)
            {
                throw new InvalidOperationException($"Invoice quantity for '{deliveryLine.Description}' exceeds the available quantity ({availableQuantity}). The sales order may have been invoiced from another source.");
            }

            var lineSubtotal = Math.Round(request.Quantity * deliveryLine.UnitPrice, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (deliveryLine.TaxRate / 100m), 2, MidpointRounding.AwayFromZero);

            lines.Add(new InvoiceLineItem
            {
                CompanyId = companyId,
                SalesOrderLineId = sourceLine?.Id,
                DeliveryOrderLineId = deliveryLine.Id,
                TaxCodeId = deliveryLine.TaxCodeId ?? sourceLine?.TaxCodeId,
                Description = deliveryLine.Description,
                Quantity = request.Quantity,
                UnitAmount = deliveryLine.UnitPrice,
                TaxRate = deliveryLine.TaxRate,
                TaxAmount = lineTax,
                TotalAmount = lineSubtotal,
                LineTotal = lineSubtotal + lineTax,
            });
        }

        return lines;
    }

    private async Task<Invoice> CreateSalesInvoiceRecordAsync(
        Guid companyId,
        Customer customer,
        string currency,
        DateTime dueDateUtc,
        Guid? paymentTermId,
        bool usePaymentTermDueDate,
        List<InvoiceLineItem> lineItems,
        Guid? salesOrderId,
        Guid? deliveryOrderId,
        CancellationToken cancellationToken)
    {
        var invoiceNumber = await GenerateInvoiceNumberAsync(companyId, cancellationToken);
        var companyAddress = await ResolveCompanyInvoiceAddressAsync(companyId, null, cancellationToken);
        var subtotal = lineItems.Sum(x => x.TotalAmount);
        var taxAmount = lineItems.Sum(x => x.TaxAmount);
        var grandTotal = lineItems.Sum(x => x.LineTotal);
        var issueDateUtc = DateTime.UtcNow;
        var resolvedDueDateUtc = await ResolveDueDateAsync(companyId, paymentTermId, usePaymentTermDueDate, issueDateUtc, dueDateUtc, cancellationToken);
        var taxSnapshot = await ResolveInvoiceTaxSnapshotAsync(companyId, lineItems, cancellationToken);
        var invoice = new Invoice
        {
            CompanyId = companyId,
            CustomerId = customer.Id,
            SalesOrderId = salesOrderId,
            DeliveryOrderId = deliveryOrderId,
            InvoiceNumber = invoiceNumber,
            Status = InvoiceStatus.Open,
            IssueDateUtc = issueDateUtc,
            DueDateUtc = resolvedDueDateUtc,
            SourceType = InvoiceSourceType.Manual,
            Subtotal = subtotal,
            TaxAmount = taxAmount,
            IsTaxEnabled = taxSnapshot.IsTaxEnabled,
            TaxName = taxSnapshot.TaxName,
            TaxRate = taxSnapshot.TaxRate,
            TaxRegistrationNo = taxSnapshot.TaxRegistrationNo,
            Total = grandTotal,
            AmountDue = grandTotal,
            AmountPaid = 0,
            Currency = await ResolveAndValidateInvoiceCurrencyAsync(
                companyId,
                cancellationToken,
                currency,
                customer.Currency,
                await ResolveCompanyCurrencyAsync(companyId, cancellationToken)),
            CompanyAddressSnapshot = companyAddress,
            LineItems = lineItems,
        };

        var pdf = await CreateManualInvoicePdfAsync(
            companyId,
            companyAddress,
            customer.Name,
            customer.Email,
            customer.BillingAddress,
            invoiceNumber,
            invoice.IssueDateUtc,
            invoice.DueDateUtc,
            lineItems.Select(x => (x.Description, x.Quantity, x.UnitAmount, x.TotalAmount)),
            subtotal,
            new CompanyTaxProfile(invoice.IsTaxEnabled, invoice.TaxName ?? "Tax", invoice.TaxRate, invoice.TaxRegistrationNo),
            taxAmount,
            invoice.Currency,
            cancellationToken);
        invoice.PdfPath = await invoiceStorage.SaveInvoicePdfAsync(companyId, invoiceNumber, pdf, cancellationToken);

        dbContext.Invoices.Add(invoice);
        var rules = await dbContext.DunningRules
            .Where(x => x.CompanyId == companyId && x.IsActive)
            .ToListAsync(cancellationToken);
        foreach (var rule in rules)
        {
            dbContext.ReminderSchedules.Add(new ReminderSchedule
            {
                CompanyId = companyId,
                Invoice = invoice,
                DunningRuleId = rule.Id,
                ReminderName = rule.Name,
                OffsetDays = rule.OffsetDays,
                ScheduledAtUtc = invoice.DueDateUtc.Date.AddDays(rule.OffsetDays)
            });
        }

        return invoice;
    }

    private async Task<DateTime> ResolveDueDateAsync(Guid companyId, Guid? paymentTermId, bool usePaymentTermDueDate, DateTime issueDateUtc, DateTime requestedDueDateUtc, CancellationToken cancellationToken)
    {
        if (!paymentTermId.HasValue || paymentTermId == Guid.Empty || !usePaymentTermDueDate)
        {
            return requestedDueDateUtc.ToUniversalTime();
        }

        var paymentTerm = await dbContext.PaymentTerms.FirstOrDefaultAsync(
            x => x.CompanyId == companyId && x.Id == paymentTermId.Value && x.IsActive,
            cancellationToken)
            ?? throw new InvalidOperationException("Select a valid payment term.");

        return issueDateUtc.Date.AddDays(paymentTerm.Days);
    }

    private static void ApplySalesOrderInvoiceQuantities(SalesOrder salesOrder, IEnumerable<InvoiceLineItem> invoiceLines, decimal direction)
    {
        foreach (var invoiceLine in invoiceLines)
        {
            if (!invoiceLine.SalesOrderLineId.HasValue)
            {
                continue;
            }

            var sourceLine = salesOrder.Lines.FirstOrDefault(x => x.Id == invoiceLine.SalesOrderLineId.Value);
            if (sourceLine is null)
            {
                continue;
            }

            sourceLine.InvoicedQuantity = Math.Max(0m, sourceLine.InvoicedQuantity + (invoiceLine.Quantity * direction));
        }
    }

    private static void ApplyDeliveryOrderInvoiceQuantities(DeliveryOrder deliveryOrder, SalesOrder? salesOrder, IEnumerable<InvoiceLineItem> invoiceLines, decimal direction)
    {
        foreach (var invoiceLine in invoiceLines)
        {
            if (invoiceLine.DeliveryOrderLineId.HasValue)
            {
                var deliveryLine = deliveryOrder.Lines.FirstOrDefault(x => x.Id == invoiceLine.DeliveryOrderLineId.Value);
                if (deliveryLine is not null)
                {
                    deliveryLine.InvoicedQuantity = Math.Max(0m, deliveryLine.InvoicedQuantity + (invoiceLine.Quantity * direction));
                }
            }

            if (salesOrder is not null && invoiceLine.SalesOrderLineId.HasValue)
            {
                var sourceLine = salesOrder.Lines.FirstOrDefault(x => x.Id == invoiceLine.SalesOrderLineId.Value);
                if (sourceLine is not null)
                {
                    sourceLine.InvoicedQuantity = Math.Max(0m, sourceLine.InvoicedQuantity + (invoiceLine.Quantity * direction));
                }
            }
        }
    }

    private static void RecomputeSalesOrderCompletion(SalesOrder salesOrder)
    {
        if (salesOrder.Status is SalesOrderStatus.Closed or SalesOrderStatus.Cancelled)
            return;
        if (salesOrder.Lines.Count > 0 && salesOrder.Lines.All(line => line.InvoicedQuantity >= line.Quantity))
            salesOrder.Status = SalesOrderStatus.Closed;
    }

    private async Task ReverseSalesInvoiceQuantitiesAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        if (invoice.DeliveryOrderId.HasValue)
        {
            var deliveryOrder = await dbContext.DeliveryOrders.Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == invoice.DeliveryOrderId.Value, cancellationToken);
            var salesOrder = invoice.SalesOrderId.HasValue
                ? await dbContext.SalesOrders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == invoice.SalesOrderId.Value, cancellationToken)
                : null;

            if (deliveryOrder is not null && salesOrder is not null)
            {
                ApplyDeliveryOrderInvoiceQuantities(deliveryOrder, salesOrder, invoice.LineItems, -1m);
                deliveryOrder.UpdatedAtUtc = DateTime.UtcNow;
                salesOrder.UpdatedAtUtc = DateTime.UtcNow;
            }

            return;
        }

        if (invoice.SalesOrderId.HasValue)
        {
            var salesOrder = await dbContext.SalesOrders.Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == invoice.SalesOrderId.Value, cancellationToken);
            if (salesOrder is not null)
            {
                ApplySalesOrderInvoiceQuantities(salesOrder, invoice.LineItems, -1m);
                salesOrder.UpdatedAtUtc = DateTime.UtcNow;
            }
        }
    }

    private static string ResolveStatus(Invoice invoice, DateTime nowUtc)
    {
        if (invoice.Status == InvoiceStatus.Paid)
        {
            return "Paid";
        }

        if (invoice.Status == InvoiceStatus.Refunded)
        {
            return "Refunded";
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            return "Void";
        }

        if (invoice.Status == InvoiceStatus.Draft)
        {
            return "Draft";
        }

        if (invoice.AmountDue > 0 && invoice.DueDateUtc.Date < nowUtc.Date)
        {
            return "Overdue";
        }

        return "Open";
    }

    private static InvoiceDto Map(Invoice invoice, IReadOnlyDictionary<Guid, IReadOnlyCollection<InvoiceHistoryDto>> history) =>
        new(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.CustomerId,
            invoice.Customer?.Name ?? string.Empty,
            invoice.Customer?.PhoneNumber,
            invoice.SubscriptionId,
            invoice.Status,
            ResolveStatus(invoice, DateTime.UtcNow),
            invoice.IssueDateUtc,
            invoice.DueDateUtc,
            invoice.PeriodStartUtc,
            invoice.PeriodEndUtc,
            invoice.SourceType,
            invoice.Subtotal,
            invoice.TaxAmount,
            invoice.IsTaxEnabled,
            invoice.TaxName,
            invoice.TaxRate,
            invoice.TaxRegistrationNo,
            invoice.Total,
            invoice.AmountPaid,
            invoice.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount),
            invoice.AmountDue,
            invoice.Currency,
            invoice.CompanyAddressSnapshot,
            invoice.PdfPath,
            invoice.LineItems.Select(x => new InvoiceLineItemDto(x.Id, x.TaxCodeId, x.Description, x.Quantity, x.UnitAmount, x.TaxRate, x.TaxAmount, x.TotalAmount, x.LineTotal)).ToList(),
            history.TryGetValue(invoice.Id, out var entries) ? entries : Array.Empty<InvoiceHistoryDto>(),
            invoice.CreditNotes.OrderByDescending(x => x.IssuedAtUtc).Select(creditNote => CreditNoteService.Map(creditNote)).ToList(),
            invoice.Refunds.OrderByDescending(x => x.CreatedAtUtc).Select(refund => RefundService.Map(refund)).ToList(),
            invoice.CreditNotes.Where(x => x.Status == CreditNoteStatus.Issued).Sum(x => x.TotalReduction),
            Math.Max(0, invoice.Total - invoice.CreditNotes.Where(x => x.Status == CreditNoteStatus.Issued).Sum(x => x.TotalReduction)),
            invoice.SalesOrderId,
            invoice.DeliveryOrderId);

    private async Task<List<InvoiceLineItem>> BuildManualInvoiceLinesAsync(Guid companyId, IReadOnlyCollection<CreateInvoiceLineItemRequest> requests, CancellationToken cancellationToken)
    {
        var lines = new List<InvoiceLineItem>();
        foreach (var request in requests)
        {
            if (string.IsNullOrWhiteSpace(request.Description))
            {
                throw new InvalidOperationException("Each line requires a description.");
            }

            var taxCode = await LoadSalesTaxCodeAsync(companyId, request.TaxCodeId, cancellationToken)
                ?? throw new InvalidOperationException("Select a tax code for each line.");
            var lineSubtotal = Math.Round(request.Quantity * request.UnitAmount, 2, MidpointRounding.AwayFromZero);
            var lineTax = Math.Round(lineSubtotal * (taxCode.Rate / 100m), 2, MidpointRounding.AwayFromZero);

            lines.Add(new InvoiceLineItem
            {
                CompanyId = companyId,
                Description = request.Description.Trim(),
                Quantity = request.Quantity,
                UnitAmount = request.UnitAmount,
                TaxCodeId = taxCode.Id,
                TaxRate = taxCode.Rate,
                TaxAmount = lineTax,
                TotalAmount = lineSubtotal,
                LineTotal = lineSubtotal + lineTax,
            });
        }

        return lines;
    }

    private async Task<InvoiceTaxSnapshot> ResolveInvoiceTaxSnapshotAsync(Guid companyId, IReadOnlyCollection<InvoiceLineItem> lineItems, CancellationToken cancellationToken)
    {
        var taxLines = lineItems
            .Where(x => x.TaxCodeId.HasValue || x.TaxRate != 0m || x.TaxAmount != 0m)
            .ToList();
        if (taxLines.Count == 0)
        {
            return new InvoiceTaxSnapshot(false, null, null, null);
        }

        var distinctTaxIds = taxLines
            .Where(x => x.TaxCodeId.HasValue)
            .Select(x => x.TaxCodeId!.Value)
            .Distinct()
            .ToList();
        var taxCodes = distinctTaxIds.Count == 0
            ? new Dictionary<Guid, TaxCode>()
            : await dbContext.TaxCodes
                .Where(x => x.CompanyId == companyId && distinctTaxIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, cancellationToken);
        var distinctRates = taxLines.Select(x => x.TaxRate).Distinct().ToList();
        var settings = await EnsureCompanyInvoiceSettingsAsync(companyId, cancellationToken);

        string taxName;
        if (distinctTaxIds.Count == 1
            && taxCodes.TryGetValue(distinctTaxIds[0], out var taxCode)
            && !string.IsNullOrWhiteSpace(taxCode.Name))
        {
            taxName = taxCode.Name.Trim();
        }
        else if (distinctRates.Count == 1)
        {
            taxName = "Tax";
        }
        else
        {
            taxName = "Mixed Tax";
        }

        return new InvoiceTaxSnapshot(
            true,
            taxName,
            distinctRates.Count == 1 ? distinctRates[0] : null,
            string.IsNullOrWhiteSpace(settings?.TaxRegistrationNo) ? null : settings.TaxRegistrationNo.Trim());
    }

    private async Task<TaxCode?> LoadSalesTaxCodeAsync(Guid companyId, Guid? taxCodeId, CancellationToken cancellationToken)
    {
        if (!taxCodeId.HasValue || taxCodeId == Guid.Empty)
        {
            return null;
        }

        return await dbContext.TaxCodes.FirstOrDefaultAsync(
                   x => x.CompanyId == companyId
                     && x.Id == taxCodeId.Value
                     && x.IsActive
                     && (x.Scope == TaxScope.Sales || x.Scope == TaxScope.Both),
                   cancellationToken)
               ?? throw new InvalidOperationException("Select a valid tax code.");
    }

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

    private string? ResolvePdfPath(string? pdfPath)
    {
        if (string.IsNullOrWhiteSpace(pdfPath))
        {
            return null;
        }

        if (Path.IsPathRooted(pdfPath))
        {
            return pdfPath;
        }

        var normalized = pdfPath.Replace('/', Path.DirectorySeparatorChar);
        var candidates = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), normalized),
            Path.Combine(AppContext.BaseDirectory, normalized),
            Path.Combine(StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory), Path.GetFileName(normalized)),
        };

        return candidates.FirstOrDefault(File.Exists) ?? Path.Combine(Directory.GetCurrentDirectory(), normalized);
    }

    private static async Task<byte[]?> ReadCompanyLogoAsync(string? logoPath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(logoPath) || !File.Exists(logoPath))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(logoPath, cancellationToken);
    }

    private static async Task<byte[]?> ReadCompanyPaymentQrAsync(string? paymentQrPath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(paymentQrPath) || !File.Exists(paymentQrPath))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(paymentQrPath, cancellationToken);
    }
}
