using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Companies;
using Recurvos.Application.Platform;
using Recurvos.Application.ProductPlans;
using Recurvos.Application.SubscriberAccounts;
using Recurvos.Domain.Enums;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using System.Text.RegularExpressions;

namespace Recurvos.Infrastructure.Services;

public sealed class CompanyService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IPackageLimitService packageLimitService,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment,
    ISubscriberAccountBillingReadService subscriberAccountBillingReadService) : ICompanyService
{
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private const string FactoryResetConfirmationText = "RESET COMPANY DATA";
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<CompanyLookupDto>> GetOwnedAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? throw new UnauthorizedAccessException();

        var companies = await dbContext.Companies
            .AsNoTracking()
            .Include(x => x.Addresses)
            .Where(x => x.Memberships.Any(m => m.UserId == userId && m.IsActive) && !x.IsPlatformAccount)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return companies.Select(MapLookup).ToList();
    }

    public async Task<CompanyLookupDto> CreateAsync(CompanyUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        await packageLimitService.EnsureCanCreateCompanyAsync(cancellationToken);
        var subscriberPackage = await subscriberAccountBillingReadService.GetCurrentUserStateAsync(cancellationToken);
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
            Address = string.Empty,
            Industry = string.IsNullOrWhiteSpace(request.Industry) ? null : request.Industry.Trim(),
            NatureOfBusiness = string.IsNullOrWhiteSpace(request.NatureOfBusiness) ? null : request.NatureOfBusiness.Trim(),
            IsActive = request.IsActive,
            IsPlatformAccount = false,
            Currency = NormalizeCurrency(request.HomeCurrency),
            SelectedPackage = subscriberPackage?.PackageCode,
            PackageStatus = subscriberPackage?.Status,
            PackageGracePeriodEndsAtUtc = subscriberPackage?.GracePeriodEndsAtUtc,
            TrialEndsAtUtc = subscriberPackage?.TrialEndsAtUtc
        };

        ApplyAddresses(company, request.Addresses, allowLegacyFallback: true, legacyFallbackAddress: request.Address);

        dbContext.Companies.Add(company);
        dbContext.CompanyMemberships.Add(new CompanyMembership
        {
            Company = company,
            UserId = subscriberId,
            Role = CompanyMembershipRole.Owner,
            IsActive = true,
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task<CompanyLookupDto?> UpdateAsync(Guid id, CompanyUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstOrDefaultAsync(
            x => x.Id == id && x.Memberships.Any(m => m.UserId == userId && m.IsActive && (m.Role == CompanyMembershipRole.Owner || m.Role == CompanyMembershipRole.Admin)) && !x.IsPlatformAccount,
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
        var existingAddress = company.Address;
        company.Address = string.Empty;
        company.Industry = string.IsNullOrWhiteSpace(request.Industry) ? null : request.Industry.Trim();
        company.NatureOfBusiness = string.IsNullOrWhiteSpace(request.NatureOfBusiness) ? null : request.NatureOfBusiness.Trim();
        company.IsActive = request.IsActive;
        company.UpdatedAtUtc = DateTime.UtcNow;
        ApplyAddresses(
            company,
            request.Addresses,
            allowLegacyFallback: true,
            legacyFallbackAddress: string.IsNullOrWhiteSpace(request.Address) ? existingAddress : request.Address);

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapLookup(company);
    }

    public async Task FactoryResetAsync(Guid id, CompanyFactoryResetRequest request, CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        if (!string.Equals(currentUserService.Role, "Owner", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(currentUserService.Role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Only administrators can factory reset company data.");
        }

        if (!string.Equals(request.ConfirmationText?.Trim(), FactoryResetConfirmationText, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Type {FactoryResetConfirmationText} to continue.");
        }

        var targetCompany = await dbContext.Companies
            .Where(x => x.Id == id && x.Memberships.Any(m => m.UserId == userId && m.IsActive && (m.Role == CompanyMembershipRole.Owner || m.Role == CompanyMembershipRole.Admin)) && !x.IsPlatformAccount)
            .Select(x => new
            {
                x.Id,
                x.LogoPath,
                PaymentQrPath = x.InvoiceSettings != null ? x.InvoiceSettings.PaymentQrPath : null,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (targetCompany is null)
        {
            throw new KeyNotFoundException("Company not found.");
        }

        if (await dbContext.Users.AnyAsync(x => x.CompanyId == id, cancellationToken))
        {
            throw new InvalidOperationException("This company is the primary workspace for one or more user accounts and cannot be removed from Factory Reset.");
        }

        var targetCompanyIds = new[] { id };
        var filePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddFilePath(filePaths, targetCompany.LogoPath);
        AddFilePath(filePaths, targetCompany.PaymentQrPath);

        foreach (var path in await dbContext.Invoices
                     .Where(x => targetCompanyIds.Contains(x.CompanyId) && x.PdfPath != null)
                     .Select(x => x.PdfPath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        foreach (var path in await dbContext.Payments
                     .Where(x => targetCompanyIds.Contains(x.CompanyId) && x.ProofFilePath != null)
                     .Select(x => x.ProofFilePath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        foreach (var path in await dbContext.PaymentConfirmationSubmissions
                     .Where(x => targetCompanyIds.Contains(x.CompanyId) && x.ProofFilePath != null)
                     .Select(x => x.ProofFilePath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        foreach (var path in await dbContext.CreditNotes
                     .Where(x => targetCompanyIds.Contains(x.CompanyId) && x.PdfPath != null)
                     .Select(x => x.PdfPath!)
                     .ToListAsync(cancellationToken))
        {
            AddFilePath(filePaths, path);
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        await dbContext.ReconciliationResults.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.LedgerPostings.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.SettlementLines.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.PayoutBatches.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Disputes.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CustomerBalanceTransactions.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CreditNoteLines.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CreditNotes.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Refunds.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.PaymentAttempts.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.PaymentConfirmationSubmissions.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Payments.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.WhatsAppNotifications.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.ReminderSchedules.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.DunningRules.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CompanyAddresses.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.InvoiceLineItems.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.WebhookEvents.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.AuditLogs.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.FeedbackItems.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.WhatsAppOutboundQueues.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.EmailDispatchLogs.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Invoices.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.SubscriptionItems.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Subscriptions.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.ProductPlans.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.Products.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CompanyInvoiceSettings.Where(x => targetCompanyIds.Contains(x.CompanyId)).ExecuteDeleteAsync(cancellationToken);

        var deleted = await dbContext.Companies
            .Where(x => x.Id == id && !x.IsPlatformAccount)
            .ExecuteDeleteAsync(cancellationToken);
        if (deleted != 1)
        {
            throw new KeyNotFoundException("Company not found.");
        }

        await transaction.CommitAsync(cancellationToken);

        ClearCompanyStorageArtifacts(targetCompanyIds, filePaths);
    }

    public async Task<CompanyLookupDto?> UploadLogoAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var company = await dbContext.Companies
            .Include(x => x.Addresses)
            .FirstOrDefaultAsync(
            x => x.Id == id && x.Memberships.Any(m => m.UserId == subscriberId && m.IsActive && (m.Role == CompanyMembershipRole.Owner || m.Role == CompanyMembershipRole.Admin)) && !x.IsPlatformAccount,
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
            x => x.Id == id && x.Memberships.Any(m => m.UserId == subscriberId && m.IsActive) && !x.IsPlatformAccount,
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
            x => x.Id == id && x.Memberships.Any(m => m.UserId == subscriberId && m.IsActive && (m.Role == CompanyMembershipRole.Owner || m.Role == CompanyMembershipRole.Admin)) && !x.IsPlatformAccount,
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
        var hasAccess = await dbContext.CompanyMemberships.AnyAsync(x => x.CompanyId == companyId && x.UserId == subscriberId && x.IsActive, cancellationToken);
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

    public async Task GrantMembershipAsync(Guid companyId, CompanyMembershipUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var currentUserId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var canManage = await dbContext.CompanyMemberships.AnyAsync(x => x.CompanyId == companyId && x.UserId == currentUserId && x.IsActive
            && (x.Role == CompanyMembershipRole.Owner || x.Role == CompanyMembershipRole.Admin), cancellationToken);
        if (!canManage)
        {
            throw new UnauthorizedAccessException();
        }

        var normalizedEmail = request.UserEmail.Trim().ToLowerInvariant();
        var user = await dbContext.Users.FirstOrDefaultAsync(x => x.Email.ToLower() == normalizedEmail && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("No active user exists with that email address.");
        if (!Enum.TryParse<CompanyMembershipRole>(request.Role, true, out var role))
        {
            throw new InvalidOperationException("Select a valid company role.");
        }

        var membership = await dbContext.CompanyMemberships.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.UserId == user.Id, cancellationToken);
        if (membership is null)
        {
            dbContext.CompanyMemberships.Add(new CompanyMembership { CompanyId = companyId, UserId = user.Id, Role = role, IsActive = true });
        }
        else
        {
            membership.Role = role;
            membership.IsActive = true;
            membership.UpdatedAtUtc = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
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
                .OrderByDescending(x => x.IsDefaultBilling)
                .ThenByDescending(x => x.IsDefaultShipping)
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
            address.AddressName,
            address.AddressLine1,
            address.AddressLine2,
            address.AddressLine3,
            address.Postcode,
            address.City,
            address.State,
            address.Country,
            address.IsDefault,
            address.IsDefaultBilling,
            address.IsDefaultShipping);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private void ApplyAddresses(
        Domain.Entities.Company company,
        IReadOnlyCollection<CompanyAddressUpsertRequest> requests,
        bool allowLegacyFallback,
        string? legacyFallbackAddress = null)
    {
        var normalizedRequests = NormalizeAddresses(requests);
        if (normalizedRequests.Count == 0)
        {
            if (allowLegacyFallback && !string.IsNullOrWhiteSpace(legacyFallbackAddress))
            {
                normalizedRequests.Add(ParseLegacyAddress(legacyFallbackAddress));
            }
            else
            {
                company.Addresses.Clear();
                company.Address = string.Empty;
                return;
            }
        }

        var billingDefaultIndex = normalizedRequests.FindIndex(x => x.IsDefaultBilling);
        if (billingDefaultIndex < 0)
        {
            billingDefaultIndex = 0;
        }

        for (var index = 0; index < normalizedRequests.Count; index += 1)
        {
            normalizedRequests[index].IsDefaultBilling = index == billingDefaultIndex;
        }

        var shippingDefaultIndex = normalizedRequests.FindIndex(x => x.IsDefaultShipping);
        if (shippingDefaultIndex < 0)
        {
            shippingDefaultIndex = 0;
        }

        for (var index = 0; index < normalizedRequests.Count; index += 1)
        {
            normalizedRequests[index].IsDefaultShipping = index == shippingDefaultIndex;
            normalizedRequests[index].IsDefault = normalizedRequests[index].IsDefaultBilling;
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
                dbContext.Entry(address).State = EntityState.Added;
                keptIds.Add(address.Id);
            }

            address.AddressName = (request.AddressName ?? string.Empty).Trim();
            address.AddressLine1 = (request.AddressLine1 ?? string.Empty).Trim();
            address.AddressLine2 = NormalizeOptional(request.AddressLine2);
            address.AddressLine3 = NormalizeOptional(request.AddressLine3);
            address.Postcode = NormalizeOptional(request.Postcode);
            address.City = NormalizeOptional(request.City);
            address.State = NormalizeOptional(request.State);
            address.Country = (request.Country ?? string.Empty).Trim();
            address.IsDefault = request.IsDefault;
            address.IsDefaultBilling = request.IsDefaultBilling;
            address.IsDefaultShipping = request.IsDefaultShipping;
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
            company.Address = string.Empty;
            return;
        }

        var defaultAddress = company.Addresses.FirstOrDefault(x => x.IsDefaultBilling) ?? company.Addresses.First();
        foreach (var address in company.Addresses)
        {
            address.IsDefaultBilling = address == defaultAddress;
            address.IsDefault = address.IsDefaultBilling;
        }

        var shippingDefaultAddress = company.Addresses.FirstOrDefault(x => x.IsDefaultShipping) ?? company.Addresses.First();
        foreach (var address in company.Addresses)
        {
            address.IsDefaultShipping = address == shippingDefaultAddress;
        }

        company.Address = FormatAddress(defaultAddress);
    }

    private static List<CompanyAddressUpsertRequest> NormalizeAddresses(IReadOnlyCollection<CompanyAddressUpsertRequest> requests)
    {
        var requestList = requests.ToList();
        var hasExplicitBillingDefault = requestList.Any(request => request.IsDefaultBilling);
        var hasExplicitShippingDefault = requestList.Any(request => request.IsDefaultShipping);

        var normalized = requestList
            .Where(ShouldPersistAddress)
            .Select(request => new CompanyAddressUpsertRequest
            {
                Id = request.Id,
                AddressName = (request.AddressName ?? string.Empty).Trim(),
                AddressLine1 = (request.AddressLine1 ?? string.Empty).Trim(),
                AddressLine2 = NormalizeOptional(request.AddressLine2),
                AddressLine3 = NormalizeOptional(request.AddressLine3),
                Postcode = NormalizeOptional(request.Postcode),
                City = NormalizeOptional(request.City),
                State = NormalizeOptional(request.State),
                Country = (request.Country ?? string.Empty).Trim(),
                IsDefault = request.IsDefault,
                IsDefaultBilling = request.IsDefaultBilling || (!hasExplicitBillingDefault && request.IsDefault),
                IsDefaultShipping = request.IsDefaultShipping || (!hasExplicitShippingDefault && request.IsDefault),
            })
            .ToList();

        ValidateNormalizedAddresses(normalized);
        return normalized;
    }

    private static bool ShouldPersistAddress(CompanyAddressUpsertRequest request) =>
        !string.IsNullOrWhiteSpace(request.AddressName)
        || HasAddressBodyContent(request)
        || (!string.IsNullOrWhiteSpace(request.AddressLine1) && !string.IsNullOrWhiteSpace(request.Country));

    private static bool HasAddressBodyContent(CompanyAddressUpsertRequest request) =>
        !string.IsNullOrWhiteSpace(request.AddressLine1)
        || !string.IsNullOrWhiteSpace(request.AddressLine2)
        || !string.IsNullOrWhiteSpace(request.AddressLine3)
        || !string.IsNullOrWhiteSpace(request.Postcode)
        || !string.IsNullOrWhiteSpace(request.City)
        || !string.IsNullOrWhiteSpace(request.State);

    private static void ValidateNormalizedAddresses(IReadOnlyCollection<CompanyAddressUpsertRequest> addresses)
    {
        var duplicateIds = addresses
            .Where(address => address.Id.HasValue)
            .GroupBy(address => address.Id!.Value)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();
        if (duplicateIds.Count > 0)
        {
            throw new InvalidOperationException("Each company address can only be submitted once per save request.");
        }

        var invalidAddressIndex = addresses
            .Select((address, index) => new { address, index })
            .FirstOrDefault(item =>
                string.IsNullOrWhiteSpace(item.address.AddressLine1)
                || string.IsNullOrWhiteSpace(item.address.AddressName)
                || string.IsNullOrWhiteSpace(item.address.Country));
        if (invalidAddressIndex is not null)
        {
            throw new InvalidOperationException($"Address {invalidAddressIndex.index + 1} must include Address Name, Address Line 1, and Country.");
        }
    }

    private static CompanyAddressUpsertRequest ParseLegacyAddress(string address)
    {
        var parts = address
            .Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .ToList();

        var addressLine1 = parts.ElementAtOrDefault(0) ?? address.Trim();
        var addressLine2 = parts.ElementAtOrDefault(1);
        var addressLine3 = parts.ElementAtOrDefault(2);
        var cityStatePostcode = parts.ElementAtOrDefault(3);
        var country = parts.ElementAtOrDefault(4) ?? string.Empty;
        string? city = null;
        string? state = null;
        string? postcode = null;

        if (!string.IsNullOrWhiteSpace(cityStatePostcode))
        {
            var lineParts = cityStatePostcode
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .ToList();

            if (lineParts.Count >= 3)
            {
                city = lineParts[0];
                state = lineParts[1];
                postcode = string.Join(", ", lineParts.Skip(2));
            }
            else
            {
                var postcodeMatch = Regex.Match(cityStatePostcode, @"^(\d{4,10})\s+(.*)$");
                if (postcodeMatch.Success)
                {
                    postcode = postcodeMatch.Groups[1].Value;
                    var remainderParts = postcodeMatch.Groups[2].Value
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Where(part => !string.IsNullOrWhiteSpace(part))
                        .ToList();
                    city = remainderParts.ElementAtOrDefault(0);
                    state = remainderParts.Count > 1 ? string.Join(", ", remainderParts.Skip(1)) : null;
                }
                else
                {
                    city = lineParts.ElementAtOrDefault(0);
                    state = lineParts.Count > 1 ? string.Join(", ", lineParts.Skip(1)) : null;
                }
            }
        }

        return new CompanyAddressUpsertRequest
        {
            AddressName = "Primary",
            AddressLine1 = addressLine1,
            AddressLine2 = addressLine2,
            AddressLine3 = addressLine3,
            Postcode = postcode,
            City = city,
            State = state,
            Country = country,
            IsDefault = true,
            IsDefaultBilling = true,
            IsDefaultShipping = true,
        };
    }

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
