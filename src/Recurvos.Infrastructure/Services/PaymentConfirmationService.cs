using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Features;
using Recurvos.Application.Invoices;
using Recurvos.Application.Payments;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PaymentConfirmationService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService,
    PlatformOwnerNotificationService platformOwnerNotificationService,
    IOptions<AppUrlOptions> appUrlOptions,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : IPaymentConfirmationService
{
    private const int PublicTokenLifetimeDays = 30;
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private static readonly HashSet<string> AllowedProofExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    };

    private static readonly HashSet<string> AllowedProofContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpeg",
        "image/webp",
    };

    private readonly AppUrlOptions _appUrlOptions = appUrlOptions.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<PaymentConfirmationLinkDto?> GetOrCreateLinkAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PublicPaymentConfirmation, cancellationToken);
        var invoice = await dbContext.Invoices
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == invoiceId, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var rawToken = EnsureInvoiceToken(invoice);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new PaymentConfirmationLinkDto(
            invoice.Id,
            invoice.InvoiceNumber,
            $"{_appUrlOptions.WebBaseUrl.TrimEnd('/')}/payment-confirmation?token={Uri.EscapeDataString(rawToken)}");
    }

    public async Task<IReadOnlyCollection<PendingPaymentConfirmationDto>> GetPendingAsync(CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PublicPaymentConfirmation, cancellationToken);
        var items = await dbContext.PaymentConfirmationSubmissions
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Where(x => x.CompanyId == GetCompanyId())
            .OrderBy(x => x.Status)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return items.Select(Map).ToList();
    }

    public async Task<PendingPaymentConfirmationDto?> ApproveAsync(Guid id, ReviewPaymentConfirmationRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PublicPaymentConfirmation, cancellationToken);
        var submission = await dbContext.PaymentConfirmationSubmissions
            .Include(x => x.Invoice)
            .ThenInclude(x => x!.Customer)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (submission?.Invoice is null)
        {
            return null;
        }

        if (submission.Status != PaymentConfirmationStatus.Pending)
        {
            throw new InvalidOperationException("Only pending confirmations can be approved.");
        }

        if (submission.Invoice.Status == InvoiceStatus.Voided)
        {
            throw new InvalidOperationException("Voided invoices cannot receive confirmations.");
        }

        if (submission.Amount > submission.Invoice.AmountDue)
        {
            throw new InvalidOperationException("Confirmation amount cannot exceed the current invoice balance.");
        }

        submission.Status = PaymentConfirmationStatus.Approved;
        submission.ReviewedAtUtc = DateTime.UtcNow;
        submission.ReviewedByUserId = currentUserService.UserId;
        submission.ReviewNote = string.IsNullOrWhiteSpace(request.ReviewNote) ? null : request.ReviewNote.Trim();

        submission.Invoice.AmountPaid += submission.Amount;
        submission.Invoice.AmountDue = Math.Max(0, submission.Invoice.Total - submission.Invoice.AmountPaid);
        submission.Invoice.Status = submission.Invoice.AmountDue <= 0 ? InvoiceStatus.Paid : InvoiceStatus.Open;

        var payment = new Payment
        {
            CompanyId = submission.CompanyId,
            InvoiceId = submission.InvoiceId,
            Amount = submission.Amount,
            Currency = submission.Invoice.Currency,
            GatewayName = "Customer confirmation",
            Status = PaymentStatus.Succeeded,
            ExternalPaymentId = submission.TransactionReference,
            ProofFilePath = submission.ProofFilePath,
            ProofFileName = submission.ProofFileName,
            ProofContentType = submission.ProofContentType,
            PaidAtUtc = submission.PaidAtUtc
        };
        dbContext.Payments.Add(payment);

        await dbContext.SaveChangesAsync(cancellationToken);
        await platformOwnerNotificationService.TryNotifyNewPaymentAsync(payment.Id, cancellationToken);
        await auditService.WriteAsync("payment.confirmation.approved", nameof(PaymentConfirmationSubmission), submission.Id.ToString(), submission.Invoice.InvoiceNumber, cancellationToken);
        await auditService.WriteAsync("invoice.payment-recorded", nameof(Invoice), submission.InvoiceId.ToString(), $"customer-confirmation:{submission.Amount:0.00}", cancellationToken);
        return Map(submission);
    }

    public async Task<PendingPaymentConfirmationDto?> RejectAsync(Guid id, ReviewPaymentConfirmationRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PublicPaymentConfirmation, cancellationToken);
        var submission = await dbContext.PaymentConfirmationSubmissions
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (submission is null)
        {
            return null;
        }

        if (submission.Status != PaymentConfirmationStatus.Pending)
        {
            throw new InvalidOperationException("Only pending confirmations can be rejected.");
        }

        submission.Status = PaymentConfirmationStatus.Rejected;
        submission.ReviewedAtUtc = DateTime.UtcNow;
        submission.ReviewedByUserId = currentUserService.UserId;
        submission.ReviewNote = string.IsNullOrWhiteSpace(request.ReviewNote) ? null : request.ReviewNote.Trim();

        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("payment.confirmation.rejected", nameof(PaymentConfirmationSubmission), submission.Id.ToString(), submission.InvoiceId.ToString(), cancellationToken);
        return Map(submission);
    }

    public async Task<(byte[] Content, string FileName, string ContentType)?> DownloadProofAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.PublicPaymentConfirmation, cancellationToken);
        var submission = await dbContext.PaymentConfirmationSubmissions
            .FirstOrDefaultAsync(x => x.CompanyId == GetCompanyId() && x.Id == id, cancellationToken);
        if (submission is null || string.IsNullOrWhiteSpace(submission.ProofFilePath))
        {
            return null;
        }

        var filePath = ResolveProofPath(submission.ProofFilePath);
        if (filePath is null || !File.Exists(filePath))
        {
            return null;
        }

        return (
            await File.ReadAllBytesAsync(filePath, cancellationToken),
            submission.ProofFileName ?? Path.GetFileName(filePath),
            submission.ProofContentType ?? "application/octet-stream");
    }

    public async Task<PublicPaymentConfirmationInvoiceDto?> GetPublicInvoiceAsync(string token, CancellationToken cancellationToken = default)
    {
        var invoice = await ResolvePublicInvoiceAsync(token, cancellationToken);
        if (invoice?.Customer is null)
        {
            return null;
        }
        var policy = await ResolveUploadPolicyAsync(cancellationToken);

        var latestPaymentLink = await dbContext.Payments
            .Where(x => x.InvoiceId == invoice.Id && !string.IsNullOrWhiteSpace(x.PaymentLinkUrl))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => x.PaymentLinkUrl)
            .FirstOrDefaultAsync(cancellationToken);

        return new PublicPaymentConfirmationInvoiceDto(
            invoice.InvoiceNumber,
            invoice.Customer.Name,
            invoice.AmountDue,
            invoice.Currency,
            invoice.DueDateUtc,
            latestPaymentLink,
            policy.UploadMaxBytes,
            policy.AutoCompressUploads,
            policy.UploadImageMaxDimension,
            policy.UploadImageQuality);
    }

    public async Task SubmitPublicAsync(SubmitPublicPaymentConfirmationRequest request, PaymentProofUpload? proof, CancellationToken cancellationToken = default)
    {
        var invoice = await ResolvePublicInvoiceAsync(request.Token, cancellationToken)
            ?? throw new InvalidOperationException("This payment confirmation link is invalid.");
        var uploadPolicy = await ResolveUploadPolicyAsync(cancellationToken);

        if (invoice.Customer is null)
        {
            throw new InvalidOperationException("Invoice customer could not be resolved.");
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            throw new InvalidOperationException("This invoice is no longer available for payment confirmation.");
        }

        if (invoice.AmountDue <= 0)
        {
            throw new InvalidOperationException("This invoice is already fully paid.");
        }

        var alreadyPending = await dbContext.PaymentConfirmationSubmissions.AnyAsync(
            x => x.InvoiceId == invoice.Id && x.Status == PaymentConfirmationStatus.Pending,
            cancellationToken);
        if (alreadyPending)
        {
            throw new InvalidOperationException("A payment confirmation is already under review for this invoice.");
        }

        var paidAtUtc = request.PaidAtUtc.Kind == DateTimeKind.Utc
            ? request.PaidAtUtc
            : request.PaidAtUtc.ToUniversalTime();
        if (paidAtUtc > DateTime.UtcNow.AddMinutes(5))
        {
            throw new InvalidOperationException("Paid date cannot be in the future.");
        }

        if (paidAtUtc < DateTime.UtcNow.AddDays(-180))
        {
            throw new InvalidOperationException("Paid date is too old for online confirmation.");
        }

        if (request.Amount > invoice.AmountDue)
        {
            throw new InvalidOperationException("The confirmed amount cannot exceed the invoice balance.");
        }

        var submission = new PaymentConfirmationSubmission
        {
            CompanyId = invoice.CompanyId,
            InvoiceId = invoice.Id,
            PayerName = request.PayerName.Trim(),
            Amount = request.Amount,
            PaidAtUtc = paidAtUtc,
            TransactionReference = string.IsNullOrWhiteSpace(request.TransactionReference) ? null : request.TransactionReference.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Status = PaymentConfirmationStatus.Pending,
        };

        if (proof is not null)
        {
            var savedProof = await SaveSubmissionProofAsync(invoice.CompanyId, invoice.InvoiceNumber, proof, uploadPolicy.UploadMaxBytes, cancellationToken);
            submission.ProofFilePath = savedProof.Path;
            submission.ProofFileName = savedProof.FileName;
            submission.ProofContentType = savedProof.ContentType;
        }

        dbContext.PaymentConfirmationSubmissions.Add(submission);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("payment.confirmation.submitted", nameof(PaymentConfirmationSubmission), submission.Id.ToString(), invoice.InvoiceNumber, cancellationToken);
    }

    private async Task<Invoice?> ResolvePublicInvoiceAsync(string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token)
            || token.Length != 48
            || token.Any(ch => !Uri.IsHexDigit(ch)))
        {
            return null;
        }

        var tokenHash = HashToken(token);
        var invoice = await dbContext.Invoices
            .Include(x => x.Customer)
            .FirstOrDefaultAsync(x => x.PaymentConfirmationTokenHash == tokenHash, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        if (!invoice.PaymentConfirmationTokenIssuedAtUtc.HasValue
            || invoice.PaymentConfirmationTokenIssuedAtUtc.Value < DateTime.UtcNow.AddDays(-PublicTokenLifetimeDays))
        {
            return null;
        }

        return invoice;
    }

    private string EnsureInvoiceToken(Invoice invoice)
    {
        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        invoice.PaymentConfirmationTokenHash = HashToken(rawToken);
        invoice.PaymentConfirmationTokenIssuedAtUtc = DateTime.UtcNow;
        return rawToken;
    }

    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static PendingPaymentConfirmationDto Map(PaymentConfirmationSubmission submission) =>
        new(
            submission.Id,
            submission.InvoiceId,
            submission.Invoice?.InvoiceNumber ?? string.Empty,
            submission.Invoice?.Customer?.Name ?? string.Empty,
            submission.Amount,
            submission.Invoice?.Currency ?? "MYR",
            submission.PaidAtUtc,
            submission.PayerName,
            submission.TransactionReference,
            submission.Notes,
            !string.IsNullOrWhiteSpace(submission.ProofFilePath),
            submission.ProofFileName,
            submission.CreatedAtUtc,
            submission.Status.ToString(),
            submission.ReviewNote);

    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

    private async Task<(string Path, string FileName, string ContentType)> SaveSubmissionProofAsync(
        Guid companyId,
        string invoiceNumber,
        PaymentProofUpload proof,
        int maxUploadBytes,
        CancellationToken cancellationToken)
    {
        if (proof.Content.Length == 0 || proof.Content.Length > maxUploadBytes)
        {
            throw new InvalidOperationException($"Proof upload must be {(maxUploadBytes / 1_000_000d):0.#} MB or smaller.");
        }

        var extension = Path.GetExtension(proof.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedProofExtensions.Contains(extension))
        {
            throw new InvalidOperationException("Proof upload must be a PNG, JPG, JPEG, or WEBP image.");
        }

        var contentType = string.IsNullOrWhiteSpace(proof.ContentType) ? "application/octet-stream" : proof.ContentType.Trim();
        if (!AllowedProofContentTypes.Contains(contentType))
        {
            throw new InvalidOperationException("Proof upload content type is not allowed.");
        }

        var proofRoot = StoragePathResolver.Resolve(_environment, _storageOptions.PaymentProofDirectory);
        Directory.CreateDirectory(proofRoot);
        var companyDirectory = Path.Combine(proofRoot, companyId.ToString("N"), "confirmations");
        Directory.CreateDirectory(companyDirectory);

        var safeExtension = extension.ToLowerInvariant();
        var safeInvoice = string.Concat(invoiceNumber.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')).Trim('-');
        if (string.IsNullOrWhiteSpace(safeInvoice))
        {
            safeInvoice = "invoice";
        }

        var fileName = $"{safeInvoice}-confirmation-{Guid.NewGuid():N}{safeExtension}";
        var filePath = Path.Combine(companyDirectory, fileName);
        await File.WriteAllBytesAsync(filePath, proof.Content, cancellationToken);
        return (filePath, proof.FileName, contentType);
    }

    private async Task<(bool AutoCompressUploads, int UploadMaxBytes, int UploadImageMaxDimension, int UploadImageQuality)> ResolveUploadPolicyAsync(CancellationToken cancellationToken)
    {
        var policy = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        return (
            policy?.AutoCompressUploads ?? true,
            Math.Min(AbsoluteUploadMaxBytes, Math.Max(200_000, policy?.UploadMaxBytes ?? 2_000_000)),
            Math.Max(600, policy?.UploadImageMaxDimension ?? 1600),
            Math.Max(50, Math.Min(95, policy?.UploadImageQuality ?? 80)));
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
}
