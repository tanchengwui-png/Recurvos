using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Auth;
using Recurvos.Application.Platform;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class PlatformService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    ISubscriberPackageBillingService subscriberPackageBillingService,
    IPasswordHasher passwordHasher,
    IAuthService authService,
    DbSeeder dbSeeder,
    StorageResetService storageResetService) : IPlatformService
{
    public async Task<PlatformDashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var subscriberCompanies = await dbContext.Companies
            .Where(x => !x.IsPlatformAccount)
            .Select(x => new
            {
                x.Id,
                x.PackageStatus,
                x.PackageGracePeriodEndsAtUtc,
                x.TrialEndsAtUtc
            })
            .ToListAsync(cancellationToken);

        var subscriberIds = subscriberCompanies.Select(x => x.Id).ToList();
        var subscriberOwnerIds = await dbContext.Companies
            .Where(x => !x.IsPlatformAccount && x.SubscriberId.HasValue)
            .Select(x => x.SubscriberId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);
        var monthStartUtc = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);

        var totalSubscribers = subscriberCompanies.Count;
        var subscribersPaid = subscriberCompanies.Count(x => ResolvePackageStatus(x.PackageStatus, x.PackageGracePeriodEndsAtUtc) == "active");
        var subscribersPendingPayment = subscriberCompanies.Count(x => ResolvePackageStatus(x.PackageStatus, x.PackageGracePeriodEndsAtUtc) == "pending_payment");
        var subscribersInGracePeriod = subscriberCompanies.Count(x => ResolvePackageStatus(x.PackageStatus, x.PackageGracePeriodEndsAtUtc) == "grace_period");
        var subscribersOnTrial = subscriberCompanies.Count(x => x.TrialEndsAtUtc.HasValue && x.TrialEndsAtUtc.Value >= DateTime.UtcNow);

        var billingProfiles = await dbContext.CompanyInvoiceSettings.CountAsync(x => subscriberIds.Contains(x.CompanyId), cancellationToken);
        var products = await dbContext.Products.CountAsync(x => subscriberIds.Contains(x.CompanyId), cancellationToken);
        var customers = await dbContext.Customers.CountAsync(x => subscriberOwnerIds.Contains(x.SubscriberId), cancellationToken);
        var subscriptions = await dbContext.Subscriptions.CountAsync(x => subscriberIds.Contains(x.CompanyId), cancellationToken);
        var openInvoices = await dbContext.Invoices.CountAsync(x => subscriberIds.Contains(x.CompanyId) && x.AmountDue > 0, cancellationToken);
        var outstandingAmount = await dbContext.Invoices
            .Where(x => subscriberIds.Contains(x.CompanyId) && x.AmountDue > 0)
            .SumAsync(x => (decimal?)x.AmountDue, cancellationToken) ?? 0m;
        var whatsAppSentThisMonth = await dbContext.WhatsAppNotifications
            .CountAsync(x => subscriberIds.Contains(x.CompanyId) && x.Status == "Sent" && x.CreatedAtUtc >= monthStartUtc, cancellationToken);
        var companiesUsingWhatsAppThisMonth = await dbContext.WhatsAppNotifications
            .Where(x => subscriberIds.Contains(x.CompanyId) && x.Status == "Sent" && x.CreatedAtUtc >= monthStartUtc)
            .Select(x => x.CompanyId)
            .Distinct()
            .CountAsync(cancellationToken);

        return new PlatformDashboardSummaryDto(
            totalSubscribers,
            subscribersPaid,
            subscribersPendingPayment,
            subscribersInGracePeriod,
            subscribersOnTrial,
            billingProfiles,
            products,
            customers,
            subscriptions,
            openInvoices,
            outstandingAmount,
            whatsAppSentThisMonth,
            companiesUsingWhatsAppThisMonth);
    }

    public async Task<IReadOnlyCollection<SubscriberCompanyDto>> GetSubscribersAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        return await dbContext.Companies
            .Where(x => !x.IsPlatformAccount)
            .OrderBy(x => x.Name)
            .Select(x => new SubscriberCompanyDto(
                x.Id,
                x.Name,
                x.RegistrationNumber,
                x.Email,
                dbContext.Subscriptions.Where(s => s.CompanyId == x.Id).Select(s => s.CustomerId).Distinct().Count(),
                dbContext.Subscriptions.Count(s => s.CompanyId == x.Id),
                dbContext.Invoices.Count(i => i.CompanyId == x.Id && i.AmountDue > 0),
                x.SelectedPackage,
                dbContext.PlatformPackages.Where(p => p.Code == x.SelectedPackage).Select(p => p.Name).FirstOrDefault(),
                x.PackageStatus,
                x.PackageGracePeriodEndsAtUtc,
                x.TrialEndsAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<SubscriberCompanyDto> AssignSubscriberPackageAsync(Guid companyId, AssignSubscriberPackageRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var packageCode = request.PackageCode.Trim().ToLowerInvariant();
        var package = await dbContext.PlatformPackages
            .FirstOrDefaultAsync(x => x.Code == packageCode && x.IsActive, cancellationToken)
            ?? throw new KeyNotFoundException("Package not found.");

        var company = await dbContext.Companies
            .FirstOrDefaultAsync(x => x.Id == companyId && !x.IsPlatformAccount, cancellationToken)
            ?? throw new KeyNotFoundException("Subscriber company not found.");

        var subscriberCompanies = await dbContext.Companies
            .Where(x => x.SubscriberId == company.SubscriberId && !x.IsPlatformAccount)
            .ToListAsync(cancellationToken);

        foreach (var subscriberCompany in subscriberCompanies)
        {
            subscriberCompany.SelectedPackage = package.Code;
            subscriberCompany.PackageStatus = "pending_payment";
            subscriberCompany.PackageGracePeriodEndsAtUtc = null;
            subscriberCompany.TrialEndsAtUtc = null;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await subscriberPackageBillingService.ProvisionForSubscriberCompanyAsync(companyId, cancellationToken);

        var refreshed = await dbContext.Companies
            .Where(x => x.Id == companyId)
            .Select(x => new SubscriberCompanyDto(
                x.Id,
                x.Name,
                x.RegistrationNumber,
                x.Email,
                dbContext.Subscriptions.Where(s => s.CompanyId == x.Id).Select(s => s.CustomerId).Distinct().Count(),
                dbContext.Subscriptions.Count(s => s.CompanyId == x.Id),
                dbContext.Invoices.Count(i => i.CompanyId == x.Id && i.AmountDue > 0),
                x.SelectedPackage,
                dbContext.PlatformPackages.Where(p => p.Code == x.SelectedPackage).Select(p => p.Name).FirstOrDefault(),
                x.PackageStatus,
                x.PackageGracePeriodEndsAtUtc,
                x.TrialEndsAtUtc))
            .FirstAsync(cancellationToken);

        return refreshed;
    }

    public async Task<IReadOnlyCollection<PlatformUserDto>> GetUsersAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        return await dbContext.Users
            .Include(x => x.Company)
            .OrderByDescending(x => x.IsPlatformOwner)
            .ThenBy(x => x.Company!.Name)
            .ThenBy(x => x.FullName)
            .Select(x => new PlatformUserDto(
                x.Id,
                x.CompanyId,
                x.Company != null ? x.Company.Name : "-",
                x.FullName,
                x.Email,
                x.Role.ToString(),
                x.IsPlatformOwner,
                x.IsActive,
                x.IsEmailVerified,
                x.CreatedAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<PlatformUserDto> CreatePlatformAdminAsync(CreatePlatformAdminRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            throw new InvalidOperationException("Full name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new InvalidOperationException("Email is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Trim().Length < 8)
        {
            throw new InvalidOperationException("Password must be at least 8 characters.");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (await dbContext.Users.AnyAsync(x => x.Email.ToLower() == normalizedEmail, cancellationToken))
        {
            throw new InvalidOperationException("A user with this email already exists.");
        }

        var platformCompany = await dbContext.Companies
            .FirstOrDefaultAsync(x => x.IsPlatformAccount, cancellationToken)
            ?? throw new InvalidOperationException("Platform company could not be found.");

        var user = new User
        {
            CompanyId = platformCompany.Id,
            FullName = request.FullName.Trim(),
            Email = normalizedEmail,
            PasswordHash = passwordHasher.Hash(request.Password),
            IsActive = true,
            IsEmailVerified = true,
            EmailVerifiedAtUtc = DateTime.UtcNow,
            IsOwner = false,
            IsPlatformOwner = true,
            Role = UserRole.Admin
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new PlatformUserDto(
            user.Id,
            platformCompany.Id,
            platformCompany.Name,
            user.FullName,
            user.Email,
            user.Role.ToString(),
            user.IsPlatformOwner,
            user.IsActive,
            user.IsEmailVerified,
            user.CreatedAtUtc);
    }

    public async Task<PlatformUserDto> UpdateUserAsync(Guid userId, UpdatePlatformUserRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        if (!Enum.TryParse<UserRole>(request.Role, true, out var parsedRole))
        {
            throw new InvalidOperationException("User role is invalid.");
        }

        var user = await dbContext.Users
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User could not be found.");

        if (user.IsPlatformOwner && parsedRole == UserRole.Member)
        {
            throw new InvalidOperationException("Platform users must remain Owner or Admin.");
        }

        if (user.Id == currentUserService.UserId && !request.IsActive)
        {
            throw new InvalidOperationException("You cannot deactivate your own account.");
        }

        if (user.IsPlatformOwner)
        {
            var otherActivePlatformOwners = await dbContext.Users
                .CountAsync(x => x.IsPlatformOwner && x.IsActive && x.Id != user.Id, cancellationToken);

            if (!request.IsActive && otherActivePlatformOwners == 0)
            {
                throw new InvalidOperationException("At least one active platform user must remain.");
            }
        }

        user.Role = parsedRole;
        user.IsOwner = parsedRole == UserRole.Owner;
        user.IsActive = request.IsActive;
        user.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        return new PlatformUserDto(
            user.Id,
            user.CompanyId,
            user.Company?.Name ?? "-",
            user.FullName,
            user.Email,
            user.Role.ToString(),
            user.IsPlatformOwner,
            user.IsActive,
            user.IsEmailVerified,
            user.CreatedAtUtc);
    }

    public async Task SendPasswordResetAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User could not be found.");

        await authService.RequestPasswordResetAsync(
            new RequestPasswordResetRequest { Email = user.Email },
            cancellationToken);
    }

    public async Task ResendVerificationAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User could not be found.");

        if (user.IsEmailVerified)
        {
            throw new InvalidOperationException("This user is already verified.");
        }

        await authService.ResendVerificationAsync(
            new ResendVerificationRequest { Email = user.Email },
            cancellationToken);
    }

    public async Task<IReadOnlyCollection<PlatformPackageDto>> GetPackagesAsync(bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var query = dbContext.PlatformPackages
            .Include(x => x.Features)
            .Include(x => x.TrustPoints)
            .AsSplitQuery()
            .AsQueryable();

        if (!includeInactive)
        {
            query = query.Where(x => x.IsActive);
        }

        var packages = await query
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return packages.Select(MapPackage).ToList();
    }

    public async Task<IReadOnlyCollection<EmailDispatchLogDto>> GetEmailLogsAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        var platformCompanyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        return await dbContext.EmailDispatchLogs
            .Where(x => x.CompanyId == platformCompanyId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .Select(x => new EmailDispatchLogDto(
                x.Id,
                x.OriginalRecipient,
                x.EffectiveRecipient,
                x.Subject,
                x.DeliveryMode,
                x.WasRedirected,
                x.RedirectReason,
                x.Succeeded,
                x.ErrorMessage,
                x.CreatedAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<FailedWhatsAppNotificationDto>> GetFailedWhatsAppNotificationsAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        return await dbContext.WhatsAppNotifications
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .Where(x => x.Status == "Failed" && x.Invoice != null)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(100)
            .Select(x => new FailedWhatsAppNotificationDto(
                x.Id,
                x.CompanyId,
                dbContext.Companies.Where(c => c.Id == x.CompanyId).Select(c => c.Name).FirstOrDefault() ?? "-",
                x.InvoiceId,
                x.Invoice != null ? x.Invoice.InvoiceNumber : "-",
                x.Invoice != null && x.Invoice.Customer != null ? x.Invoice.Customer.Name : "-",
                x.RecipientPhoneNumber,
                x.ReminderScheduleId != null,
                x.ErrorMessage,
                x.CreatedAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<AuditLogEntryDto>> GetAuditLogsAsync(int take = 100, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var boundedTake = Math.Clamp(take, 25, 500);

        return await (
            from audit in dbContext.AuditLogs
            join company in dbContext.Companies on audit.CompanyId equals company.Id
            join user in dbContext.Users on audit.UserId equals user.Id into userJoin
            from user in userJoin.DefaultIfEmpty()
            orderby audit.CreatedAtUtc descending
            select new AuditLogEntryDto(
                audit.Id,
                audit.CompanyId,
                company.Name,
                audit.UserId,
                user != null ? user.Email : null,
                audit.Action,
                audit.EntityName,
                audit.EntityId,
                audit.Metadata,
                audit.CreatedAtUtc))
            .Take(boundedTake)
            .ToListAsync(cancellationToken);
    }

    public async Task<PlatformPackageDto> UpdatePackageAsync(Guid id, UpdatePlatformPackageRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new InvalidOperationException("Package name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.PriceLabel))
        {
            throw new InvalidOperationException("Price label is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Description))
        {
            throw new InvalidOperationException("Description is required.");
        }

        if (request.Amount <= 0)
        {
            throw new InvalidOperationException("Billing amount must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(request.Currency))
        {
            throw new InvalidOperationException("Currency is required.");
        }

        var package = await dbContext.PlatformPackages
            .Include(x => x.Features)
            .Include(x => x.TrustPoints)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Package not found.");

        package.Name = request.Name.Trim();
        package.PriceLabel = request.PriceLabel.Trim();
        package.Description = request.Description.Trim();
        package.Amount = request.Amount;
        package.Currency = request.Currency.Trim().ToUpperInvariant();
        package.IntervalUnit = Enum.TryParse<IntervalUnit>(request.IntervalUnit, true, out var intervalUnit)
            ? intervalUnit
            : throw new InvalidOperationException("Billing interval is invalid.");
        package.IntervalCount = request.IntervalCount <= 0 ? 1 : request.IntervalCount;
        package.GracePeriodDays = request.GracePeriodDays < 0 ? 0 : request.GracePeriodDays;
        package.MaxCompanies = Math.Max(0, request.MaxCompanies);
        package.MaxProducts = Math.Max(0, request.MaxProducts);
        package.MaxPlans = Math.Max(0, request.MaxPlans);
        package.MaxCustomers = Math.Max(0, request.MaxCustomers);
        var autoWhatsAppEnabled = request.Features.Any(feature =>
            string.Equals(feature?.Trim(), "Auto invoice notification (WhatsApp)", StringComparison.OrdinalIgnoreCase));
        package.MaxWhatsAppRemindersPerMonth = request.MaxWhatsAppRemindersPerMonth < 0
            ? 0
            : request.MaxWhatsAppRemindersPerMonth;
        if (autoWhatsAppEnabled && package.MaxWhatsAppRemindersPerMonth <= 0)
        {
            package.MaxWhatsAppRemindersPerMonth = package.Code switch
            {
                "premium" => 5000,
                _ => package.MaxWhatsAppRemindersPerMonth,
            };
        }
        package.IsActive = request.IsActive;
        package.DisplayOrder = request.DisplayOrder;

        dbContext.PlatformPackageFeatures.RemoveRange(package.Features);
        dbContext.PlatformPackageTrustPoints.RemoveRange(package.TrustPoints);
        await dbContext.SaveChangesAsync(cancellationToken);

        dbContext.PlatformPackageFeatures.AddRange(CreateFeatures(package.Id, request.Features));
        dbContext.PlatformPackageTrustPoints.AddRange(CreateTrustPoints(package.Id, request.TrustPoints));
        await dbContext.SaveChangesAsync(cancellationToken);

        var refreshed = await dbContext.PlatformPackages
            .Include(x => x.Features)
            .Include(x => x.TrustPoints)
            .AsSplitQuery()
            .FirstAsync(x => x.Id == id, cancellationToken);

        return MapPackage(refreshed);
    }

    public async Task<FactoryResetResult> FactoryResetAsync(FactoryResetRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();

        if (!string.Equals(request.ConfirmationText?.Trim(), "FACTORY RESET", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Type FACTORY RESET to continue.");
        }

        dbContext.ChangeTracker.Clear();
        await dbContext.Database.EnsureDeletedAsync(cancellationToken);
        await dbContext.Database.MigrateAsync(cancellationToken);
        storageResetService.ClearAll();
        await dbSeeder.SeedAsync(cancellationToken);

        return new FactoryResetResult(
            DateTime.UtcNow,
            "Factory reset completed. The database is recreated, file storage is cleared, and demo seed data is loaded.");
    }

    private void EnsurePlatformOwner()
    {
        if (!currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException();
        }
    }

    private static string ResolvePackageStatus(string? rawStatus, DateTime? gracePeriodEndsAtUtc)
    {
        var normalized = (rawStatus ?? "pending_payment").Trim().ToLowerInvariant();

        if (normalized is "pending_payment" or "grace_period")
        {
            if (!gracePeriodEndsAtUtc.HasValue)
            {
                return normalized == "grace_period" ? "past_due" : "pending_payment";
            }

            return gracePeriodEndsAtUtc.Value >= DateTime.UtcNow
                ? "grace_period"
                : "past_due";
        }

        if (normalized == "reactivation_pending_payment")
        {
            if (!gracePeriodEndsAtUtc.HasValue)
            {
                return "past_due";
            }

            return gracePeriodEndsAtUtc.Value >= DateTime.UtcNow
                ? "pending_payment"
                : "past_due";
        }

        return normalized;
    }

    private static IReadOnlyCollection<PlatformPackageFeature> CreateFeatures(Guid packageId, IReadOnlyCollection<string> items) =>
        NormalizeItems(items)
            .Select(item => new PlatformPackageFeature
            {
                PlatformPackageId = packageId,
                Text = item.Text,
                SortOrder = item.SortOrder
            })
            .ToList();

    private static IReadOnlyCollection<PlatformPackageTrustPoint> CreateTrustPoints(Guid packageId, IReadOnlyCollection<string> items) =>
        NormalizeItems(items)
            .Select(item => new PlatformPackageTrustPoint
            {
                PlatformPackageId = packageId,
                Text = item.Text,
                SortOrder = item.SortOrder
            })
            .ToList();

    private static IReadOnlyCollection<(string Text, int SortOrder)> NormalizeItems(IReadOnlyCollection<string> items) =>
        items
            .Select((text, index) => (Text: text.Trim(), SortOrder: index))
            .Where(x => !string.IsNullOrWhiteSpace(x.Text))
            .ToList();

    private static PlatformPackageDto MapPackage(PlatformPackage package) =>
        new(
            package.Id,
            package.Code,
            package.Name,
            package.PriceLabel,
            package.Description,
            package.Amount,
            package.Currency,
            package.IntervalUnit.ToString(),
            package.IntervalCount,
            package.GracePeriodDays,
            package.MaxCompanies,
            package.MaxProducts,
            package.MaxPlans,
            package.MaxCustomers,
            package.MaxWhatsAppRemindersPerMonth,
            package.IsActive,
            package.DisplayOrder,
            package.Features
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.CreatedAtUtc)
                .Select(x => new PlatformPackageItemDto(x.Id, x.Text, x.SortOrder))
                .ToList(),
            package.TrustPoints
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.CreatedAtUtc)
                .Select(x => new PlatformPackageItemDto(x.Id, x.Text, x.SortOrder))
                .ToList());
}
