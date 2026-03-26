using Microsoft.EntityFrameworkCore;
using Npgsql;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

internal static class CompanyInvoiceSettingsCreation
{
    private const string PrimaryKeyConstraintName = "PK_company_invoice_settings";

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
