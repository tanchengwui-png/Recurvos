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
    IOptions<AppUrlOptions> appUrlOptions,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : IPaymentService
{
    private readonly IPaymentGateway _gateway = gateways.First(x => x.Name == "Billplz");
    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<PaymentDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payments = await Query(GetCompanyId()).OrderByDescending(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        return payments.Select(Map).ToList();
    }

    public async Task<PaymentDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PaymentTracking, cancellationToken);
        var payment = await Query(GetCompanyId()).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return payment is null ? null : Map(payment);
    }

    public async Task<PublicPaymentStatusDto?> GetPublicStatusAsync(string? externalPaymentId, Guid? invoiceId, CancellationToken cancellationToken = default)
    {
        var query = dbContext.Payments
            .Include(x => x.Invoice)
            .AsQueryable();

        Payment? payment = null;
        if (!string.IsNullOrWhiteSpace(externalPaymentId))
        {
            payment = await query
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken);
        }

        if (payment is null && invoiceId.HasValue)
        {
            payment = await query
                .Where(x => x.InvoiceId == invoiceId.Value)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
        }

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
            Description = $"Invoice {invoice.InvoiceNumber}",
            CallbackUrl = $"{_appUrlOptions.ApiBaseUrl.TrimEnd('/')}/api/webhooks/billplz",
            RedirectUrl = $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/payment-success/{invoice.Id:D}"
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
        await auditService.WriteAsync("payment.link.created", nameof(Payment), payment.Id.ToString(), payment.ExternalPaymentId, cancellationToken);
        payment.Invoice = invoice;
        return Map(payment);
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
        var payment = await dbContext.Payments
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Include(x => x.Invoice).ThenInclude(x => x!.LineItems)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (payment?.Invoice?.Customer is null || payment.Status != PaymentStatus.Succeeded || !payment.PaidAtUtc.HasValue)
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

            var result = await _gateway.CreatePaymentLinkAsync(new CreatePaymentLinkCommand
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
                CallbackUrl = $"{_appUrlOptions.ApiBaseUrl.TrimEnd('/')}/api/webhooks/billplz",
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

    internal async Task MarkPaymentAsync(string externalPaymentId, bool succeeded, string rawPayload, CancellationToken cancellationToken = default)
    {
        var payment = await dbContext.Payments.Include(x => x.Invoice).ThenInclude(x => x!.Subscription)
            .ThenInclude(x => x!.Items).ThenInclude(x => x.ProductPlan)
            .Include(x => x.Invoice).ThenInclude(x => x!.LineItems).ThenInclude(x => x.SubscriptionItem)
            .Include(x => x.Attempts)
            .FirstOrDefaultAsync(x => x.ExternalPaymentId == externalPaymentId, cancellationToken)
            ?? throw new InvalidOperationException("Payment not found.");

            payment.Status = succeeded ? PaymentStatus.Succeeded : PaymentStatus.Failed;
        payment.PaidAtUtc = succeeded ? DateTime.UtcNow : null;
        if (!succeeded)
        {
            payment.ReceiptPdfPath = null;
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
                    if (subscriberCompany?.SubscriberId is Guid subscriberId)
                    {
                        var paidAtUtc = payment.PaidAtUtc ?? DateTime.UtcNow;
                        var isUpgradePayment = !string.IsNullOrWhiteSpace(subscriberCompany.PendingPackageCode)
                            || payment.Invoice.PeriodEndUtc.HasValue;

                        if (!string.IsNullOrWhiteSpace(subscriberCompany.PendingPackageCode))
                        {
                            subscriberCompany.SelectedPackage = subscriberCompany.PendingPackageCode;
                            subscriberCompany.PendingPackageCode = null;
                        }

                        var subscriberCompanies = await dbContext.Companies
                            .Where(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount)
                            .ToListAsync(cancellationToken);
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
        if (succeeded)
        {
            await platformOwnerNotificationService.TryNotifyNewPaymentAsync(payment.Id, cancellationToken);
        }
    }

    private IQueryable<Payment> Query(Guid companyId) =>
        dbContext.Payments
            .Include(x => x.Invoice)
            .Include(x => x.Attempts)
            .Include(x => x.Refunds)
            .Include(x => x.Disputes)
            .Where(x => x.CompanyId == companyId);

    private static PaymentDto Map(Payment payment) =>
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
            payment.Attempts.OrderBy(x => x.AttemptNumber).Select(x => new PaymentAttemptDto(x.AttemptNumber, x.Status, x.FailureCode, x.FailureMessage)).ToList(),
            payment.Refunds.OrderByDescending(x => x.CreatedAtUtc).Select(RefundService.Map).ToList(),
            payment.Disputes.OrderByDescending(x => x.OpenedAtUtc).Select(x => new PaymentDisputeDto(x.Id, x.ExternalDisputeId, x.Amount, x.Reason, x.Status.ToString(), x.OpenedAtUtc, x.ResolvedAtUtc)).ToList());

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

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
