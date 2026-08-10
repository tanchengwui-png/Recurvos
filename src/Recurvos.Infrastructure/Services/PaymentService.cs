using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Features;
using Recurvos.Application.Payments;
using Recurvos.Application.Refunds;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Templates;
using Microsoft.Extensions.Hosting;

namespace Recurvos.Infrastructure.Services;

public sealed class PaymentService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IEnumerable<IPaymentGateway> gateways,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService,
    PlatformOwnerNotificationService platformOwnerNotificationService,
    IEmailSender emailSender,
    IOptions<AppUrlOptions> appUrlOptions,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment,
    SubscriberAccountBillingMigrationService subscriberAccountBillingMigrationService) : IPaymentService
{
    private readonly IReadOnlyDictionary<string, IPaymentGateway> _gateways = gateways.ToDictionary(x => x.Name, StringComparer.OrdinalIgnoreCase);
    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<PaymentDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payments = await Query(GetCompanyId()).OrderByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        var historyMap = await GetHistoryMapAsync(payments.Select(x => x.Id), cancellationToken);
        return payments.Select(payment => Map(payment, historyMap.GetValueOrDefault(payment.Id, Array.Empty<PaymentHistoryDto>()))).ToList();
    }

    public async Task<PaymentDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payment = await Query(GetCompanyId()).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payment is null)
        {
            return null;
        }

        var historyMap = await GetHistoryMapAsync([payment.Id], cancellationToken);
        return Map(payment, historyMap.GetValueOrDefault(payment.Id, Array.Empty<PaymentHistoryDto>()));
    }

    public async Task<PublicPaymentStatusDto?> GetPublicStatusAsync(string externalPaymentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(externalPaymentId))
        {
            throw new InvalidOperationException("Public payment lookup requires a payment reference.");
        }

        var payment = await dbContext.Payments
            .Include(x => x.Invoice)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken);

        if (payment?.Invoice is null)
        {
            return null;
        }

        return new PublicPaymentStatusDto(
            payment.ExternalPaymentId ?? string.Empty,
            payment.Invoice.InvoiceNumber,
            payment.Status.ToString(),
            payment.Invoice.Status.ToString(),
            payment.Status == PaymentStatus.Succeeded && payment.PaidAtUtc.HasValue,
            payment.Amount,
            payment.Currency,
            payment.PaidAtUtc);
    }

    public async Task<PaymentDto?> CreatePaymentLinkAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentLinkGeneration, cancellationToken);
        var invoice = await dbContext.Invoices.Include(x => x.Customer).Include(x => x.Payments).ThenInclude(x => x.Attempts)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == invoiceId, cancellationToken);
        if (invoice?.Customer is null)
        {
            return null;
        }

        var gateway = await ResolveGatewayAsync(invoice.CompanyId, cancellationToken);
        var result = await gateway.CreatePaymentLinkAsync(new CreatePaymentLinkCommand
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
            Description = $"Invoice {invoice.InvoiceNumber}",
            CallbackUrl = BuildWebhookUrl(gateway),
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
        payment.Invoice = invoice;
        var historyMap = await GetHistoryMapAsync([payment.Id], cancellationToken);
        return Map(payment, historyMap.GetValueOrDefault(payment.Id, Array.Empty<PaymentHistoryDto>()));
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadProofAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payment = await Query(GetCompanyId()).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payment is null || string.IsNullOrWhiteSpace(payment.ProofFilePath))
        {
            return null;
        }

        var filePath = ResolveProofPath(payment.ProofFilePath);
        if (filePath is null || !File.Exists(filePath))
        {
            return null;
        }

        return (
            await File.ReadAllBytesAsync(filePath, cancellationToken),
            payment.ProofFileName ?? Path.GetFileName(filePath),
            payment.ProofContentType ?? "application/octet-stream");
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadReceiptAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payment = await LoadReceiptEmailPaymentAsync(id, GetCompanyId(), cancellationToken);
        if (payment is null)
        {
            return null;
        }

        var receiptFile = await EnsureReceiptFileAsync(payment, cancellationToken);
        if (receiptFile is null)
        {
            return null;
        }

        return receiptFile;
    }

    public async Task<bool> SendReceiptAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payment = await LoadReceiptEmailPaymentAsync(id, GetCompanyId(), cancellationToken);
        if (payment is null)
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(payment.Invoice!.Customer!.Email))
        {
            throw new InvalidOperationException("This customer does not have an email address.");
        }

        var receiptFile = await EnsureReceiptFileAsync(payment, cancellationToken)
            ?? throw new InvalidOperationException("Receipt PDF could not be generated.");

        var receiptNumber = Path.GetFileNameWithoutExtension(receiptFile.FileName);
        var company = await dbContext.Companies.FirstAsync(x => x.Id == payment.CompanyId, cancellationToken);
        var body = EmailTemplateRenderer.RenderReceiptEmail(
            company.Name,
            payment.Invoice.Customer.Name,
            payment.Invoice.InvoiceNumber,
            receiptNumber,
            $"{payment.Currency} {payment.Amount:0.00}",
            payment.PaidAtUtc!.Value.ToString("dd MMM yyyy"));

        await emailSender.SendAsync(
            payment.Invoice.Customer.Email.Trim(),
            $"Receipt {receiptNumber} for {payment.Invoice.InvoiceNumber}",
            body,
            [new EmailAttachment(receiptFile.FileName, receiptFile.Content, receiptFile.ContentType)],
            await ResolveSubscriberCustomerEmailCcAsync(payment.CompanyId, cancellationToken),
            new EmailLogContext(
                CompanyId: payment.CompanyId,
                NotificationType: "Receipt",
                InvoiceId: payment.InvoiceId,
                InvoiceNumber: payment.Invoice.InvoiceNumber,
                CustomerName: payment.Invoice.Customer.Name),
            cancellationToken);

        payment.ReceiptEmailedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("payment.receipt-sent", nameof(Payment), payment.Id.ToString(), payment.Invoice.InvoiceNumber, cancellationToken);
        return true;
    }

    public async Task TryAutoSendReceiptIfEligibleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var payment = await LoadReceiptEmailPaymentAsync(id, cancellationToken: cancellationToken);
        if (payment?.Invoice?.Customer is null
            || string.IsNullOrWhiteSpace(payment.Invoice.Customer.Email)
            || payment.ReceiptEmailedAtUtc.HasValue
            || !await IsAutoReceiptEmailEligibleAsync(payment.CompanyId, cancellationToken))
        {
            return;
        }

        try
        {
            var receiptFile = await EnsureReceiptFileAsync(payment, cancellationToken);
            if (receiptFile is null)
            {
                return;
            }

            var file = receiptFile.Value;
            var receiptNumber = Path.GetFileNameWithoutExtension(file.FileName);
            var company = await dbContext.Companies.FirstAsync(x => x.Id == payment.CompanyId, cancellationToken);
            var body = EmailTemplateRenderer.RenderReceiptEmail(
                company.Name,
                payment.Invoice.Customer.Name,
                payment.Invoice.InvoiceNumber,
                receiptNumber,
                $"{payment.Currency} {payment.Amount:0.00}",
                payment.PaidAtUtc!.Value.ToString("dd MMM yyyy"));

            await emailSender.SendAsync(
                payment.Invoice.Customer.Email.Trim(),
                $"Receipt {receiptNumber} for {payment.Invoice.InvoiceNumber}",
                body,
                [new EmailAttachment(file.FileName, file.Content, file.ContentType)],
                await ResolveSubscriberCustomerEmailCcAsync(payment.CompanyId, cancellationToken),
                new EmailLogContext(
                    CompanyId: payment.CompanyId,
                    NotificationType: "Receipt",
                    InvoiceId: payment.InvoiceId,
                    InvoiceNumber: payment.Invoice.InvoiceNumber,
                    CustomerName: payment.Invoice.Customer.Name),
                cancellationToken);

            payment.ReceiptEmailedAtUtc = DateTime.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
            await auditService.WriteAsync("payment.receipt-auto-sent", nameof(Payment), payment.Id.ToString(), payment.Invoice.InvoiceNumber, cancellationToken);
        }
        catch (Exception exception)
        {
            await auditService.WriteAsync("payment.receipt-auto-send-failed", nameof(Payment), payment.Id.ToString(), exception.Message, cancellationToken);
        }
    }

    public async Task<int> RecoverMissedReceiptEmailsAsync(CancellationToken cancellationToken = default)
    {
        var candidateIds = await dbContext.Payments
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Where(x =>
                x.Status == PaymentStatus.Succeeded
                && x.PaidAtUtc.HasValue
                && !x.ReceiptEmailedAtUtc.HasValue
                && x.Invoice != null
                && x.Invoice.Customer != null
                && !string.IsNullOrWhiteSpace(x.Invoice.Customer.Email))
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);

        var sent = 0;
        foreach (var candidateId in candidateIds)
        {
            var emailedAtUtc = await dbContext.Payments
                .Where(x => x.Id == candidateId)
                .Select(x => x.ReceiptEmailedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
            if (emailedAtUtc.HasValue)
            {
                continue;
            }

            await TryAutoSendReceiptIfEligibleAsync(candidateId, cancellationToken);

            emailedAtUtc = await dbContext.Payments
                .Where(x => x.Id == candidateId)
                .Select(x => x.ReceiptEmailedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
            if (emailedAtUtc.HasValue)
            {
                sent++;
            }
        }

        return sent;
    }

    public async Task<int> RetryFailedPaymentsAsync(CancellationToken cancellationToken = default)
    {
        var failed = await dbContext.Payments.Include(x => x.Invoice).ThenInclude(x => x!.Customer).Include(x => x.Attempts)
            .Where(x => x.Status == PaymentStatus.Failed && x.Attempts.Count < 3)
            .ToListAsync(cancellationToken);

        var paymentTrackingCache = new Dictionary<Guid, bool>();
        foreach (var payment in failed)
        {
            if (!paymentTrackingCache.TryGetValue(payment.CompanyId, out var paymentTrackingEnabled))
            {
                paymentTrackingEnabled = await featureEntitlementService.CompanyHasFeatureAsync(payment.CompanyId, PlatformFeatureKeys.PaymentTracking, cancellationToken);
                paymentTrackingCache[payment.CompanyId] = paymentTrackingEnabled;
            }

            if (!paymentTrackingEnabled)
            {
                continue;
            }

            var gateway = await ResolveGatewayAsync(payment.CompanyId, cancellationToken);
            var result = await gateway.CreatePaymentLinkAsync(new CreatePaymentLinkCommand
            {
                CompanyId = payment.CompanyId,
                GatewayConfigurationCompanyId = payment.CompanyId,
                InvoiceId = payment.InvoiceId,
                InvoiceNumber = payment.Invoice?.InvoiceNumber ?? string.Empty,
                Amount = payment.Amount,
                Currency = payment.Currency,
                CustomerName = payment.Invoice?.Customer?.Name ?? string.Empty,
                CustomerEmail = payment.Invoice?.Customer?.Email ?? string.Empty,
                CustomerMobile = payment.Invoice?.Customer?.PhoneNumber,
                Description = $"Invoice {payment.Invoice?.InvoiceNumber}",
                CallbackUrl = BuildWebhookUrl(gateway),
                RedirectUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/payment-success/{payment.InvoiceId:D}"
            }, cancellationToken);

            payment.ExternalPaymentId = result.ExternalPaymentId;
            payment.PaymentLinkUrl = result.PaymentUrl;
            payment.Status = PaymentStatus.Pending;
            dbContext.PaymentAttempts.Add(new PaymentAttempt
            {
                CompanyId = payment.CompanyId,
                PaymentId = payment.Id,
                AttemptNumber = payment.Attempts.Count + 1,
                Status = PaymentStatus.Pending,
                RawResponse = result.RawResponse
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return failed.Count;
    }

    private async Task<IPaymentGateway> ResolveGatewayAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var provider = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => x.InvoiceSettings != null ? x.InvoiceSettings.PaymentGatewayProvider : null)
            .FirstOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(provider) || string.Equals(provider, "none", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("No active payment gateway is configured for this company.");
        }

        if (_gateways.TryGetValue(provider, out var gateway))
        {
            return gateway;
        }

        throw new InvalidOperationException($"Payment gateway '{provider}' is not registered.");
    }

    private string BuildWebhookUrl(IPaymentGateway gateway) =>
        $"{_appUrlOptions.ApiBaseUrl.TrimEnd('/')}/api/webhooks/{gateway.Name.ToLowerInvariant()}";

    internal async Task MarkPaymentAsync(string externalPaymentId, bool succeeded, string rawPayload, CancellationToken cancellationToken = default)
    {
        var payment = await dbContext.Payments.Include(x => x.Invoice).ThenInclude(x => x!.Subscription)
            .ThenInclude(x => x!.Items).ThenInclude(x => x.ProductPlan)
            .Include(x => x.Invoice).ThenInclude(x => x!.LineItems).ThenInclude(x => x.SubscriptionItem)
            .Include(x => x.Attempts)
            .FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken)
            ?? throw new InvalidOperationException("Payment not found.");

        var isDuplicatePackagePayment = succeeded
            && payment.Invoice?.SourceType == InvoiceSourceType.PlatformSubscription
            && await dbContext.Payments.AnyAsync(
                x => x.InvoiceId == payment.InvoiceId
                    && x.Id != payment.Id
                    && x.Status == PaymentStatus.Succeeded,
                cancellationToken);

        if (isDuplicatePackagePayment)
        {
            payment.Status = PaymentStatus.Reversed;
            payment.PaidAtUtc = null;
            payment.ReceiptPdfPath = null;
            payment.ReceiptEmailedAtUtc = null;

            dbContext.PaymentAttempts.Add(new PaymentAttempt
            {
                CompanyId = payment.CompanyId,
                PaymentId = payment.Id,
                AttemptNumber = payment.Attempts.Count + 1,
                Status = PaymentStatus.Reversed,
                FailureMessage = "Ignored because this package invoice already has a successful payment.",
                RawResponse = rawPayload
            });

            await dbContext.SaveChangesAsync(cancellationToken);
            await auditService.WriteAsync(
                "payment.duplicate-package-success-ignored",
                nameof(Payment),
                payment.Id.ToString(),
                payment.ExternalPaymentId ?? payment.InvoiceId.ToString(),
                cancellationToken);
            return;
        }

        payment.Status = succeeded ? PaymentStatus.Succeeded : PaymentStatus.Failed;
        payment.PaidAtUtc = succeeded ? DateTime.UtcNow : null;
        if (!succeeded)
        {
            payment.ReceiptPdfPath = null;
            payment.ReceiptEmailedAtUtc = null;
        }
        dbContext.PaymentAttempts.Add(new PaymentAttempt
        {
            CompanyId = payment.CompanyId,
            PaymentId = payment.Id,
            AttemptNumber = payment.Attempts.Count + 1,
            Status = payment.Status,
            FailureMessage = succeeded ? null : "Gateway callback marked payment as failed.",
            RawResponse = rawPayload
        });

        if (payment.Invoice is not null)
        {
            payment.Invoice.AmountPaid = succeeded ? payment.Amount : 0;
            payment.Invoice.AmountDue = succeeded ? 0 : payment.Amount;
            payment.Invoice.Status = succeeded ? InvoiceStatus.Paid : InvoiceStatus.Open;

            if (succeeded)
            {
                var schedules = await dbContext.ReminderSchedules.Where(x => x.InvoiceId == payment.InvoiceId && !x.Cancelled).ToListAsync(cancellationToken);
                foreach (var schedule in schedules)
                {
                    schedule.Cancelled = true;
                }

                if (payment.Invoice.SourceType == InvoiceSourceType.PlatformSubscription && payment.Invoice.SubscriberCompanyId.HasValue)
                {
                    var subscriberCompany = await dbContext.Companies.FirstOrDefaultAsync(
                        x => x.Id == payment.Invoice.SubscriberCompanyId.Value,
                        cancellationToken);
                    if (subscriberCompany is not null)
                    {
                        var paidAtUtc = payment.PaidAtUtc ?? DateTime.UtcNow;
                        var isUpgradePayment = !string.IsNullOrWhiteSpace(subscriberCompany.PendingPackageCode)
                            || payment.Invoice.PeriodEndUtc.HasValue;

                        if (!string.IsNullOrWhiteSpace(subscriberCompany.PendingPackageCode))
                        {
                            subscriberCompany.SelectedPackage = subscriberCompany.PendingPackageCode;
                            subscriberCompany.PendingPackageCode = null;
                        }

                        var subscriberCompaniesQuery = dbContext.Companies
                            .Where(x => !x.IsPlatformAccount);

                        IReadOnlyCollection<Company> subscriberCompanies = subscriberCompany.SubscriberAccountId is Guid subscriberAccountId
                            ? await subscriberCompaniesQuery
                                .Where(x => x.SubscriberAccountId == subscriberAccountId)
                                .ToListAsync(cancellationToken)
                            : subscriberCompany.SubscriberId is Guid subscriberId
                                ? await subscriberCompaniesQuery
                                    .Where(x => x.SubscriberId == subscriberId)
                                    .ToListAsync(cancellationToken)
                                : [subscriberCompany];

                        foreach (var company in subscriberCompanies)
                        {
                            company.PackageStatus = "active";
                            company.PackageGracePeriodEndsAtUtc = null;
                            company.PackageBillingCycleStartUtc = isUpgradePayment
                                ? company.PackageBillingCycleStartUtc ?? paidAtUtc
                                : await ResolveNextPackageCycleStartUtcAsync(company, paidAtUtc, cancellationToken);
                        }
                    }
                }

                if (payment.Invoice.Subscription is { } subscription)
                {
                    var billedItemIds = payment.Invoice.LineItems
                        .Where(x => x.SubscriptionItemId.HasValue)
                        .Select(x => x.SubscriptionItemId!.Value)
                        .ToList();

                    if (billedItemIds.Count > 0)
                    {
                        SubscriptionService.ApplySuccessfulRenewal(subscription, billedItemIds);
                    }
                }
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        if (succeeded && payment.Invoice?.SourceType == InvoiceSourceType.PlatformSubscription && payment.Invoice.SubscriberCompanyId.HasValue)
        {
            await subscriberAccountBillingMigrationService.ReconcileForCompaniesAsync([payment.Invoice.SubscriberCompanyId.Value], cancellationToken);
        }
        if (succeeded)
        {
            await platformOwnerNotificationService.TryNotifyNewPaymentAsync(payment.Id, cancellationToken);
            await TryAutoSendReceiptIfEligibleAsync(payment.Id, cancellationToken);
        }
    }

    private IQueryable<Payment> Query(Guid companyId) =>
        dbContext.Payments
            .Include(x => x.Invoice)
            .Include(x => x.Attempts)
            .Include(x => x.Refunds)
            .Include(x => x.Disputes)
            .Where(x => x.CompanyId == companyId);

    private static PaymentDto Map(Payment payment, IReadOnlyCollection<PaymentHistoryDto> history) =>
        new(
            payment.Id,
            payment.InvoiceId,
            payment.Invoice?.InvoiceNumber ?? string.Empty,
            payment.Amount,
            payment.Currency,
            payment.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount),
            payment.Amount - payment.Refunds.Where(x => x.Status == RefundStatus.Succeeded).Sum(x => x.Amount),
            payment.Status,
            payment.GatewayName,
            payment.ExternalPaymentId,
            payment.PaymentLinkUrl,
            !string.IsNullOrWhiteSpace(payment.ProofFilePath),
            payment.Status == PaymentStatus.Succeeded && payment.PaidAtUtc.HasValue,
            payment.ProofFileName,
            payment.PaidAtUtc,
            history,
            payment.Attempts.OrderBy(x => x.AttemptNumber).Select(x => new PaymentAttemptDto(x.AttemptNumber, x.Status, x.FailureCode, x.FailureMessage)).ToList(),
            payment.Refunds.OrderByDescending(x => x.CreatedAtUtc).Select(RefundService.Map).ToList(),
            payment.Disputes.OrderByDescending(x => x.OpenedAtUtc).Select(x => new PaymentDisputeDto(x.Id, x.ExternalDisputeId, x.Amount, x.Reason, x.Status.ToString(), x.OpenedAtUtc, x.ResolvedAtUtc)).ToList());

    private async Task<Dictionary<Guid, IReadOnlyCollection<PaymentHistoryDto>>> GetHistoryMapAsync(IEnumerable<Guid> paymentIds, CancellationToken cancellationToken)
    {
        var ids = paymentIds.Select(x => x.ToString()).ToList();
        var entries = await dbContext.AuditLogs
            .Where(x => x.CompanyId == GetCompanyId() && x.EntityName == nameof(Payment) && ids.Contains(x.EntityId))
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return entries
            .GroupBy(x => Guid.Parse(x.EntityId))
            .ToDictionary(
                x => x.Key,
                x => (IReadOnlyCollection<PaymentHistoryDto>)x
                    .Select(entry => new PaymentHistoryDto(entry.CreatedAtUtc, entry.Action, entry.Metadata ?? entry.Action))
                    .ToList());
    }

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

    private async Task<Payment?> LoadReceiptEmailPaymentAsync(Guid paymentId, Guid? companyId = null, CancellationToken cancellationToken = default)
        => await dbContext.Payments
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Include(x => x.Invoice).ThenInclude(x => x!.LineItems)
            .FirstOrDefaultAsync(x => x.Id == paymentId && (!companyId.HasValue || x.CompanyId == companyId.Value), cancellationToken);

    private async Task<(byte[] Content, string FileName, string ContentType)?> EnsureReceiptFileAsync(Payment payment, CancellationToken cancellationToken)
    {
        if (payment.Invoice?.Customer is null || payment.Status != PaymentStatus.Succeeded || !payment.PaidAtUtc.HasValue)
        {
            return null;
        }

        var filePath = ResolveReceiptPath(payment.ReceiptPdfPath);
        if (filePath is null || !File.Exists(filePath))
        {
            var issuerCompany = await dbContext.Companies.FirstAsync(x => x.Id == payment.CompanyId, cancellationToken);
            var invoiceSettings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == payment.CompanyId, cancellationToken);
            var receiptNumber = await GenerateReceiptNumberAsync(payment.CompanyId, cancellationToken);
            var description = payment.Invoice.LineItems.FirstOrDefault()?.Description ?? $"Invoice {payment.Invoice.InvoiceNumber}";
            var issuerProfile = PlatformIssuerProfileResolver.Resolve(issuerCompany, invoiceSettings);
            var receiptBytes = ReceiptPdfTemplate.Render(
                issuerProfile.CompanyName,
                issuerProfile.RegistrationNumber,
                issuerProfile.BillingEmail,
                invoiceSettings?.ShowCompanyAddressOnReceipt == true ? issuerProfile.Address : null,
                await ReadLogoBytesIfExistsAsync(issuerCompany.LogoPath, cancellationToken),
                payment.Invoice.Customer.Name,
                payment.Invoice.Customer.BillingAddress,
                receiptNumber,
                payment.Invoice.InvoiceNumber,
                description,
                payment.Amount,
                payment.Currency,
                payment.GatewayName,
                payment.PaidAtUtc.Value,
                payment.ExternalPaymentId ?? payment.GatewayTransactionId ?? payment.GatewaySettlementRef,
                payment.Invoice.AmountDue);

            payment.ReceiptPdfPath = await SaveReceiptPdfAsync(payment.CompanyId, receiptNumber, receiptBytes, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            filePath = ResolveReceiptPath(payment.ReceiptPdfPath);
        }

        if (filePath is null || !File.Exists(filePath))
        {
            return null;
        }

        var fileName = Path.GetFileName(filePath);
        return (await File.ReadAllBytesAsync(filePath, cancellationToken), string.IsNullOrWhiteSpace(fileName) ? $"{payment.Invoice.InvoiceNumber}-receipt.pdf" : fileName, "application/pdf");
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

    private async Task<bool> IsAutoReceiptEmailEligibleAsync(Guid companyId, CancellationToken cancellationToken)
    {
        if (await featureEntitlementService.CompanyHasFeatureAsync(companyId, PlatformFeatureKeys.AutoReceiptEmails, cancellationToken))
        {
            return true;
        }

        var packageCode = await dbContext.Companies
            .Where(x => x.Id == companyId && !x.IsPlatformAccount)
            .Select(x => x.SelectedPackage)
            .FirstOrDefaultAsync(cancellationToken);

        return string.Equals(packageCode, "growth", StringComparison.OrdinalIgnoreCase)
            || string.Equals(packageCode, "premium", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<byte[]?> ReadLogoBytesIfExistsAsync(string? logoPath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(logoPath) || !File.Exists(logoPath))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(logoPath, cancellationToken);
    }

    private string? ResolveProofPath(string? proofPath)
    {
        if (string.IsNullOrWhiteSpace(proofPath))
        {
            return null;
        }

        if (Path.IsPathRooted(proofPath))
        {
            return proofPath;
        }

        var normalized = proofPath.Replace('/', Path.DirectorySeparatorChar);
        var proofRoot = StoragePathResolver.Resolve(_environment, _storageOptions.PaymentProofDirectory);
        var candidates = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), normalized),
            Path.Combine(AppContext.BaseDirectory, normalized),
            Path.Combine(proofRoot, Path.GetFileName(normalized)),
        };

        return candidates.FirstOrDefault(File.Exists) ?? Path.Combine(Directory.GetCurrentDirectory(), normalized);
    }

    private string? ResolveReceiptPath(string? receiptPath)
    {
        if (string.IsNullOrWhiteSpace(receiptPath))
        {
            return null;
        }

        if (Path.IsPathRooted(receiptPath))
        {
            return receiptPath;
        }

        var normalized = receiptPath.Replace('/', Path.DirectorySeparatorChar);
        var receiptRoot = Path.Combine(StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory), "receipts");
        var candidates = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), normalized),
            Path.Combine(AppContext.BaseDirectory, normalized),
            Path.Combine(receiptRoot, Path.GetFileName(normalized)),
        };

        return candidates.FirstOrDefault(File.Exists) ?? Path.Combine(Directory.GetCurrentDirectory(), normalized);
    }

    private async Task<string> SaveReceiptPdfAsync(Guid companyId, string receiptNumber, byte[] pdf, CancellationToken cancellationToken)
    {
        var receiptRoot = Path.Combine(StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory), companyId.ToString("N"), "receipts");
        Directory.CreateDirectory(receiptRoot);
        var path = Path.Combine(receiptRoot, $"{receiptNumber}.pdf");
        await File.WriteAllBytesAsync(path, pdf, cancellationToken);
        return path.Replace("\\", "/");
    }

    private async Task<string> GenerateReceiptNumberAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);
        if (settings is null)
        {
            var company = await dbContext.Companies.FirstAsync(x => x.Id == companyId, cancellationToken);
            settings = new CompanyInvoiceSettings
            {
                CompanyId = companyId,
                Prefix = "INV",
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
            settings = await CompanyInvoiceSettingsCreation.AddOrGetExistingAsync(dbContext, settings, cancellationToken);
        }

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

    private async Task<DateTime> ResolveNextPackageCycleStartUtcAsync(Company company, DateTime paidAtUtc, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(company.SelectedPackage))
        {
            return paidAtUtc;
        }

        var package = await dbContext.PlatformPackages.FirstOrDefaultAsync(x => x.Code == company.SelectedPackage, cancellationToken);
        if (package is null)
        {
            return paidAtUtc;
        }

        if (!company.PackageBillingCycleStartUtc.HasValue)
        {
            return paidAtUtc;
        }

        return AddInterval(company.PackageBillingCycleStartUtc.Value, package.IntervalUnit, package.IntervalCount);
    }

    private static DateTime AddInterval(DateTime startUtc, IntervalUnit intervalUnit, int intervalCount) =>
        intervalUnit switch
        {
            IntervalUnit.Month => startUtc.AddMonths(intervalCount),
            IntervalUnit.Quarter => startUtc.AddMonths(intervalCount * 3),
            IntervalUnit.Year => startUtc.AddYears(intervalCount),
            _ => startUtc
        };
}
