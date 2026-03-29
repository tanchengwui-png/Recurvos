using Microsoft.EntityFrameworkCore;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class LegacySchemaRepairService(AppDbContext dbContext)
{
    public async Task EnsureAsync(CancellationToken cancellationToken = default)
    {
        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Subscriptions"
            ADD COLUMN IF NOT EXISTS "CancellationReason" character varying(1000) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "PaymentQrResponsibilityAcceptedAtUtc" timestamp with time zone NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "PaymentQrResponsibilityStatement" character varying(1000) NULL;
            """, cancellationToken);
    }
}
