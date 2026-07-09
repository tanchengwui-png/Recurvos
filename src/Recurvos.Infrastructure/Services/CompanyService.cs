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
    private const string FactoryResetConfirmationText = "RESET COMPANY DATA";
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<CompanyLookupDto>> GetOwnedAsync(CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();

        var companies = await dbContext.Companies
            .Include(x => x.Addresses)
            .Where(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return companies.Select(MapLookup).ToList();
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
            LegalName = NormalizeOptional(request.LegalName) ?? request.Name.Trim(),
            RegistrationNumberType = NormalizeOptional(request.RegistrationNumberType),
            RegistrationNumber = request.RegistrationNumber.Trim(),
            OldRegistrationNumber = NormalizeOptional(request.OldRegistrationNumber),
            Tin = NormalizeOptional(request.Tin),
            MsicCode = NormalizeOptional(request.MsicCode),
            TourismTaxRegistrationNumber = NormalizeOptional(request.TourismTaxRegistrationNumber),
            HomeCountry = NormalizeOptional(request.HomeCountry),
            Email = request.Email.Trim(),
            Phone = request.Phone.Trim(),
            Address = request.Address.Trim(),
            Industry = string.IsNullOrWhiteSpace(request.Industry) ? null : request.Industry.Trim(),
            NatureOfBusiness = string.IsNullOrWhiteSpace(request.NatureOfBusiness) ? null : request.NatureOfBusiness.Trim(),
            IsActive = request.IsActive,
            IsPlatformAccount = false,
            Currency = NormalizeCurrency(request.HomeCurrency),
            SelectedPackage = subscriberPackage?.SelectedPackage,
            PackageStatus = subscriberPackage?.PackageStatus,
            PackageGracePeriodEndsAtUtc = subscriberPackage?.PackageGracePeriodEndsAtUtc,
            TrialEndsAtUtc = subscriberPackage?.TrialEndsAtUtc
        };

        ApplyAddresses(company, request.Addresses, allowLegacyFallback: true);

        dbContext.Companies.Add(company);
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task<CompanyLookupDto?> UpdateAsync(Guid id, CompanyUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstOrDefaultAsync(
            x => x.Id == id && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);
        if (company is null)
        {
            return null;
        }

        company.Name = request.Name.Trim();
        company.LegalName = NormalizeOptional(request.LegalName) ?? request.Name.Trim();
        company.RegistrationNumberType = NormalizeOptional(request.RegistrationNumberType);
        company.RegistrationNumber = request.RegistrationNumber.Trim();
        company.OldRegistrationNumber = NormalizeOptional(request.OldRegistrationNumber);
        company.Tin = NormalizeOptional(request.Tin);
        company.MsicCode = NormalizeOptional(request.MsicCode);
        company.TourismTaxRegistrationNumber = NormalizeOptional(request.TourismTaxRegistrationNumber);
        company.HomeCountry = NormalizeOptional(request.HomeCountry);
        company.Currency = NormalizeCurrency(request.HomeCurrency);
        company.Email = request.Email.Trim();
        company.Phone = request.Phone.Trim();
        company.Address = request.Address.Trim();
        company.Industry = string.IsNullOrWhiteSpace(request.Industry) ? null : request.Industry.Trim();
        company.NatureOfBusiness = string.IsNullOrWhiteSpace(request.NatureOfBusiness) ? null : request.NatureOfBusiness.Trim();
        company.IsActive = request.IsActive;
        company.UpdatedAtUtc = DateTime.UtcNow;
        ApplyAddresses(company, request.Addresses, allowLegacyFallback: true);

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task FactoryResetAsync(Guid id, CompanyFactoryResetRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        if (!string.Equals(currentUserService.Role, "Owner", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(currentUserService.Role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Only administrators can factory reset company data.");
        }

        if (!string.Equals(request.ConfirmationText?.Trim(), FactoryResetConfirmationText, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Type {FactoryResetConfirmationText} to continue.");
        }

        var ownedCompanies = await dbContext.Companies
            .Where(x => x.SubscriberId == subscriberId && !x.IsPlatformAccount)
            .Select(x => new
            {
                x.Id,
                x.LogoPath,
                PaymentQrPath = x.InvoiceSettings != null ? x.InvoiceSettings.PaymentQrPath : null,
            })
            .ToListAsync(cancellationToken);

        if (!ownedCompanies.Any(x => x.Id == id))
        {
            throw new KeyNotFoundException("Company not found.");
        }

        if (ownedCompanies.Count == 0)
        {
            return;
        }

        var ownedCompanyIds = ownedCompanies.Select(x => x.Id).ToArray();
        var preservedCompanyId = currentUserService.CompanyId;
        if (!preservedCompanyId.HasValue || !ownedCompanyIds.Contains(preservedCompanyId.Value))
        {
            preservedCompanyId = ownedCompanyIds[0];
        }

        var companyIdsToDelete = ownedCompanyIds.Where(companyId => companyId != preservedCompanyId.Value).ToArray();
        var filePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var company in ownedCompanies)
        {
            AddFilePath(filePaths, company.LogoPath);
            AddFilePath(filePaths, company.PaymentQrPath);
        }

        foreach (var path in await dbContext.Invoices
                     .Where(x => ownedCompanyIds.Contains(x.CompanyId) && x.PdfPath != null)
                     .Select(x => x.PdfPath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        foreach (var path in await dbContext.Payments
                     .Where(x => ownedCompanyIds.Contains(x.CompanyId) && x.ProofFilePath != null)
                     .Select(x => x.ProofFilePath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        foreach (var path in await dbContext.PaymentConfirmationSubmissions
                     .Where(x => ownedCompanyIds.Contains(x.CompanyId) && x.ProofFilePath != null)
                     .Select(x => x.ProofFilePath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        foreach (var path in await dbContext.CreditNotes
                     .Where(x => ownedCompanyIds.Contains(x.CompanyId) && x.PdfPath != null)
                     .Select(x => x.PdfPath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        await dbContext.ReconciliationResults.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.LedgerPostings.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.SettlementLines.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.PayoutBatches.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Disputes.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CustomerBalanceTransactions.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CreditNoteLines.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CreditNotes.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Refunds.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.PaymentAttempts.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.PaymentConfirmationSubmissions.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Payments.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.WhatsAppNotifications.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.ReminderSchedules.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.DunningRules.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CompanyAddresses.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.InvoiceLineItems.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.WebhookEvents.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.AuditLogs.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.FeedbackItems.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.WhatsAppOutboundQueues.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.EmailDispatchLogs.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Invoices.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.SubscriptionItems.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Subscriptions.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.ProductPlans.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Products.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CompanyInvoiceSettings.Where(x => ownedCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);

        if (companyIdsToDelete.Length > 0)
        {
            await dbContext.Companies.Where(x => companyIdsToDelete.Contains(x.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        var preservedCompany = await dbContext.Companies.FirstOrDefaultAsync(x => x.Id == preservedCompanyId.Value, cancellationToken)
            ?? throw new KeyNotFoundException("Company not found.");

        preservedCompany.SubscriberId = null;
        preservedCompany.Name = string.Empty;
        preservedCompany.LegalName = null;
        preservedCompany.RegistrationNumberType = null;
        preservedCompany.RegistrationNumber = string.Empty;
        preservedCompany.OldRegistrationNumber = null;
        preservedCompany.Tin = null;
        preservedCompany.MsicCode = null;
        preservedCompany.TourismTaxRegistrationNumber = null;
        preservedCompany.HomeCountry = null;
        preservedCompany.Email = string.Empty;
        preservedCompany.Phone = string.Empty;
        preservedCompany.Address = string.Empty;
        preservedCompany.Industry = null;
        preservedCompany.NatureOfBusiness = null;
        preservedCompany.LogoPath = null;
        preservedCompany.IsActive = true;
        preservedCompany.Currency = "MYR";
        preservedCompany.InvoiceSequence = 1000;
        preservedCompany.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        ClearCompanyStorageArtifacts(ownedCompanyIds, filePaths);
    }

    public async Task<CompanyLookupDto?> UploadLogoAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstOrDefaultAsync(
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
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstOrDefaultAsync(
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

    public async Task<CompanyLookupDto?> RemoveLogoAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstOrDefaultAsync(
            x => x.Id == id && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);
        if (company is null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(company.LogoPath) && File.Exists(company.LogoPath))
        {
            File.Delete(company.LogoPath);
            var companyDirectory = Path.GetDirectoryName(company.LogoPath);
            if (!string.IsNullOrWhiteSpace(companyDirectory) && Directory.Exists(companyDirectory) && !Directory.EnumerateFileSystemEntries(companyDirectory).Any())
            {
                Directory.Delete(companyDirectory);
            }
        }

        company.LogoPath = null;
        company.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
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
            company.LegalName,
            company.RegistrationNumberType,
            company.RegistrationNumber,
            company.OldRegistrationNumber,
            company.Tin,
            company.MsicCode,
            company.TourismTaxRegistrationNumber,
            company.HomeCountry,
            company.Currency,
            company.Email,
            company.Phone,
            company.Address,
            company.Addresses
                .OrderByDescending(x => x.IsDefault)
                .ThenBy(x => x.CreatedAtUtc)
                .Select(MapAddress)
                .ToList(),
            company.Industry,
            company.NatureOfBusiness,
            company.IsActive,
            !string.IsNullOrWhiteSpace(company.LogoPath));

    private static CompanyAddressDto MapAddress(Domain.Entities.CompanyAddress address) =>
        new(
            address.Id,
            address.AddressLine1,
            address.AddressLine2,
            address.AddressLine3,
            address.Postcode,
            address.City,
            address.State,
            address.Country,
            address.IsDefault);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void ApplyAddresses(Domain.Entities.Company company, IReadOnlyCollection<CompanyAddressUpsertRequest> requests, bool allowLegacyFallback)
    {
        var normalizedRequests = NormalizeAddresses(requests);
        if (normalizedRequests.Count == 0)
        {
            if (allowLegacyFallback && !string.IsNullOrWhiteSpace(company.Address))
            {
                normalizedRequests.Add(new CompanyAddressUpsertRequest
                {
                    AddressLine1 = company.Address.Trim(),
                    Country = string.Empty,
                    IsDefault = true,
                });
            }
            else
            {
                throw new InvalidOperationException("Add at least one company address.");
            }
        }

        var defaultIndex = normalizedRequests.FindIndex(x => x.IsDefault);
        if (defaultIndex < 0)
        {
            defaultIndex = 0;
        }

        for (var index = 0; index < normalizedRequests.Count; index += 1)
        {
            normalizedRequests[index].IsDefault = index == defaultIndex;
        }

        var existingById = company.Addresses.ToDictionary(x => x.Id);
        var keptIds = new HashSet<Guid>();

        foreach (var request in normalizedRequests)
        {
            Domain.Entities.CompanyAddress address;
            if (request.Id.HasValue && existingById.TryGetValue(request.Id.Value, out var existing))
            {
                address = existing;
                keptIds.Add(existing.Id);
            }
            else
            {
                address = new Domain.Entities.CompanyAddress
                {
                    CompanyId = company.Id,
                };
                company.Addresses.Add(address);
            }

            address.AddressLine1 = request.AddressLine1.Trim();
            address.AddressLine2 = NormalizeOptional(request.AddressLine2);
            address.AddressLine3 = NormalizeOptional(request.AddressLine3);
            address.Postcode = NormalizeOptional(request.Postcode);
            address.City = NormalizeOptional(request.City);
            address.State = NormalizeOptional(request.State);
            address.Country = request.Country.Trim();
            address.IsDefault = request.IsDefault;
        }

        var addressesToRemove = company.Addresses
            .Where(x => x.Id != Guid.Empty && !keptIds.Contains(x.Id) && normalizedRequests.All(request => request.Id != x.Id))
            .ToList();

        foreach (var address in addressesToRemove)
        {
            company.Addresses.Remove(address);
        }

        if (company.Addresses.Count == 0)
        {
            throw new InvalidOperationException("Add at least one company address.");
        }

        var defaultAddress = company.Addresses.FirstOrDefault(x => x.IsDefault) ?? company.Addresses.First();
        foreach (var address in company.Addresses)
        {
            address.IsDefault = address == defaultAddress;
        }

        company.Address = FormatAddress(defaultAddress);
    }

    private static List<CompanyAddressUpsertRequest> NormalizeAddresses(IReadOnlyCollection<CompanyAddressUpsertRequest> requests) =>
        requests
            .Where(request =>
                !string.IsNullOrWhiteSpace(request.AddressLine1)
                || !string.IsNullOrWhiteSpace(request.AddressLine2)
                || !string.IsNullOrWhiteSpace(request.AddressLine3)
                || !string.IsNullOrWhiteSpace(request.Postcode)
                || !string.IsNullOrWhiteSpace(request.City)
                || !string.IsNullOrWhiteSpace(request.State)
                || !string.IsNullOrWhiteSpace(request.Country))
            .Select(request => new CompanyAddressUpsertRequest
            {
                Id = request.Id,
                AddressLine1 = request.AddressLine1,
                AddressLine2 = request.AddressLine2,
                AddressLine3 = request.AddressLine3,
                Postcode = request.Postcode,
                City = request.City,
                State = request.State,
                Country = request.Country,
                IsDefault = request.IsDefault,
            })
            .ToList();

    private static string FormatAddress(Domain.Entities.CompanyAddress address)
    {
        var cityLine = string.Join(", ", new[]
        {
            NormalizeOptional(address.City),
            NormalizeOptional(address.State),
            NormalizeOptional(address.Postcode),
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return string.Join(
            "\n",
            new[]
            {
                address.AddressLine1.Trim(),
                NormalizeOptional(address.AddressLine2),
                NormalizeOptional(address.AddressLine3),
                cityLine,
                NormalizeOptional(address.Country),
            }.Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    private void ClearCompanyStorageArtifacts(IReadOnlyCollection<Guid> companyIds, IEnumerable<string> filePaths)
    {
        foreach (var filePath in filePaths)
        {
            TryDeleteFile(filePath);
        }

        var logoRoot = StoragePathResolver.Resolve(_environment, _storageOptions.CompanyLogoDirectory);
        var invoiceRoot = StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory);
        var proofRoot = StoragePathResolver.Resolve(_environment, _storageOptions.PaymentProofDirectory);
        var qrRoot = StoragePathResolver.Resolve(_environment, _storageOptions.PaymentQrDirectory);

        foreach (var companyId in companyIds)
        {
            var companyKey = companyId.ToString("N");
            TryDeleteDirectory(Path.Combine(logoRoot, companyKey));
            TryDeleteDirectory(Path.Combine(invoiceRoot, companyKey));
            TryDeleteDirectory(Path.Combine(proofRoot, companyKey));
            TryDeleteDirectory(Path.Combine(qrRoot, companyKey));
            TryDeleteDirectory(Path.Combine(proofRoot, companyKey, "confirmations"));
        }
    }

    private static void AddFilePath(ISet<string> filePaths, string? path)
    {
        if (!string.IsNullOrWhiteSpace(path))
        {
            filePaths.Add(path);
        }
    }

    private static void TryDeleteFile(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return;
        }

        File.Delete(path);
    }

    private static void TryDeleteDirectory(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
        {
            return;
        }

        Directory.Delete(path, recursive: true);
    }

    private static string NormalizeCurrency(string? value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? "MYR" : value.Trim().ToUpperInvariant();
        return normalized.Length > 3 ? normalized[..3] : normalized;
    }
}
