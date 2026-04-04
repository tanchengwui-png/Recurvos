using Microsoft.EntityFrameworkCore;
using Npgsql;
using Recurvos.Application.Features;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

internal static class CompanyInvoiceSettingsCreation
{
    private const string PrimaryKeyConstraintName = "PK_company_invoice_settings";

    internal static async Task ApplySubscriberPackageDefaultsAsync(
        AppDbContext dbContext,
        CompanyInvoiceSettings settings,
        CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies
            .AsNoTracking()
            .Where(x => x.Id == settings.CompanyId)
            .Select(x => new
            {
                x.IsPlatformAccount,
                x.SelectedPackage
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (company is null || company.IsPlatformAccount || string.IsNullOrWhiteSpace(company.SelectedPackage))
        {
            return;
        }

        var packageCode = company.SelectedPackage.Trim().ToLowerInvariant();
        var package = await dbContext.PlatformPackages
            .AsNoTracking()
            .Include(x => x.Features)
            .FirstOrDefaultAsync(x => x.Code == packageCode, cancellationToken);

        var featureTexts = package?.Features.Select(x => x.Text).ToList();
        var featureKeys = FeatureEntitlementService.ResolvePackageFeatureKeysForConfiguration(packageCode, featureTexts);
        settings.WhatsAppEnabled = featureKeys.Contains(PlatformFeatureKeys.ConfigurableWhatsApp, StringComparer.OrdinalIgnoreCase);
    }

    internal static async Task<CompanyInvoiceSettings> AddOrGetExistingAsync(
        AppDbContext dbContext,
        CompanyInvoiceSettings settings,
        CancellationToken cancellationToken)
    {
        dbContext.CompanyInvoiceSettings.Add(settings);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return settings;
        }
        catch (DbUpdateException exception) when (IsPrimaryKeyConflict(exception))
        {
            dbContext.Entry(settings).State = EntityState.Detached;
            return await dbContext.CompanyInvoiceSettings.FirstAsync(
                x => x.CompanyId == settings.CompanyId,
                cancellationToken);
        }
    }

    private static bool IsPrimaryKeyConflict(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: PrimaryKeyConstraintName
        };
}
