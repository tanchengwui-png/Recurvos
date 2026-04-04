using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Companies;
using Recurvos.Application.Platform;
using Recurvos.Application.ProductPlans;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class CompanyService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IPackageLimitService packageLimitService,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : ICompanyService
{
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<CompanyLookupDto>> GetOwnedAsync(CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();

        return await dbContext.Companies
            .Where(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount)
            .OrderBy(x => x.Name)
            .Select(x => MapLookup(x))
            .ToListAsync(cancellationToken);
    }

    public async Task<CompanyLookupDto> CreateAsync(CompanyUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        await packageLimitService.EnsureCanCreateCompanyAsync(cancellationToken);
        var subscriberPackage = await dbContext.Companies
            .Where(x => x.Id == (currentUserService.CompanyId ?? Guid.Empty))
            .Select(x => new { x.SelectedPackage, x.PackageStatus, x.PackageGracePeriodEndsAtUtc, x.TrialEndsAtUtc })
            .FirstOrDefaultAsync(cancellationToken);
        var company = new Domain.Entities.Company
        {
            SubscriberId = subscriberId,
            Name = request.Name.Trim(),
            RegistrationNumber = request.RegistrationNumber.Trim(),
            Email = request.Email.Trim(),
            Phone = request.Phone.Trim(),
            Address = request.Address.Trim(),
            Industry = string.IsNullOrWhiteSpace(request.Industry) ? null : request.Industry.Trim(),
            NatureOfBusiness = string.IsNullOrWhiteSpace(request.NatureOfBusiness) ? null : request.NatureOfBusiness.Trim(),
            IsActive = request.IsActive,
            IsPlatformAccount = false,
            SelectedPackage = subscriberPackage?.SelectedPackage,
            PackageStatus = subscriberPackage?.PackageStatus,
            PackageGracePeriodEndsAtUtc = subscriberPackage?.PackageGracePeriodEndsAtUtc,
            TrialEndsAtUtc = subscriberPackage?.TrialEndsAtUtc
        };

        dbContext.Companies.Add(company);
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task<CompanyLookupDto?> UpdateAsync(Guid id, CompanyUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(
            x => x.Id == id && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);
        if (company is null)
        {
            return null;
        }

        company.Name = request.Name.Trim();
        company.RegistrationNumber = request.RegistrationNumber.Trim();
        company.Email = request.Email.Trim();
        company.Phone = request.Phone.Trim();
        company.Address = request.Address.Trim();
        company.Industry = string.IsNullOrWhiteSpace(request.Industry) ? null : request.Industry.Trim();
        company.NatureOfBusiness = string.IsNullOrWhiteSpace(request.NatureOfBusiness) ? null : request.NatureOfBusiness.Trim();
        company.IsActive = request.IsActive;
        company.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task<CompanyLookupDto?> UploadLogoAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(
            x => x.Id == id && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);
        if (company is null)
        {
            return null;
        }

        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension) || !new[] { ".png", ".jpg", ".jpeg", ".webp" }.Contains(extension, StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Logo must be a PNG, JPG, JPEG, or WEBP image.");
        }

        var policy = await ResolveUploadPolicyAsync(cancellationToken);
        if (content.CanSeek && content.Length > policy.UploadMaxBytes)
        {
            throw new InvalidOperationException($"Logo must be {(policy.UploadMaxBytes / 1_000_000d):0.#} MB or smaller.");
        }

        var logoRoot = StoragePathResolver.Resolve(_environment, _storageOptions.CompanyLogoDirectory);
        Directory.CreateDirectory(logoRoot);
        var companyDirectory = Path.Combine(logoRoot, company.Id.ToString("N"));
        Directory.CreateDirectory(companyDirectory);

        foreach (var existing in Directory.GetFiles(companyDirectory))
        {
            File.Delete(existing);
        }

        var filePath = Path.Combine(companyDirectory, $"logo{extension.ToLowerInvariant()}");
        await using var fileStream = File.Create(filePath);
        await content.CopyToAsync(fileStream, cancellationToken);

        company.LogoPath = filePath.Replace("\\", "/");
        company.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task<CompanyLogoFile?> GetLogoAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies.FirstOrDefaultAsync(
            x => x.Id == id && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);
        if (company is null || string.IsNullOrWhiteSpace(company.LogoPath) || !File.Exists(company.LogoPath))
        {
            return null;
        }

        var content = await File.ReadAllBytesAsync(company.LogoPath, cancellationToken);
        var extension = Path.GetExtension(company.LogoPath).ToLowerInvariant();
        var contentType = extension switch
        {
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };

        return new CompanyLogoFile(Path.GetFileName(company.LogoPath), content, contentType);
    }

    private async Task<(int UploadMaxBytes, bool AutoCompressUploads, int UploadImageMaxDimension, int UploadImageQuality)> ResolveUploadPolicyAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        return (
            Math.Min(AbsoluteUploadMaxBytes, Math.Max(200_000, settings?.UploadMaxBytes ?? 2_000_000)),
            settings?.AutoCompressUploads ?? true,
            Math.Max(600, settings?.UploadImageMaxDimension ?? 1600),
            Math.Max(50, Math.Min(95, settings?.UploadImageQuality ?? 80)));
    }

    public async Task<IReadOnlyCollection<ProductPlanDto>> GetRecurringPlansAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var hasAccess = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.SubscriberId == subscriberId, cancellationToken);
        if (!hasAccess)
        {
            throw new UnauthorizedAccessException();
        }

        return await dbContext.ProductPlans
            .Include(x => x.Product)
            .Where(x => x.CompanyId == companyId && x.IsActive)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.PlanName)
            .Select(x => new ProductPlanDto(
                x.Id,
                x.ProductId,
                x.Product != null ? x.Product.Name : string.Empty,
                x.PlanName,
                x.PlanCode,
                x.BillingType,
                x.IntervalUnit,
                x.IntervalCount,
                ProductPlanService.FormatBillingLabel(x.BillingType, x.IntervalUnit, x.IntervalCount),
                x.Currency,
                x.UnitAmount,
                x.TaxBehavior,
                x.IsDefault,
                x.IsActive,
                false,
                x.SortOrder,
                x.CreatedAtUtc,
                x.UpdatedAtUtc))
            .ToListAsync(cancellationToken);
    }

    private static CompanyLookupDto MapLookup(Domain.Entities.Company company) =>
        new(
            company.Id,
            company.Name,
            company.RegistrationNumber,
            company.Email,
            company.Phone,
            company.Address,
            company.Industry,
            company.NatureOfBusiness,
            company.IsActive,
            !string.IsNullOrWhiteSpace(company.LogoPath));
}
