using Microsoft.EntityFrameworkCore;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class LegacySchemaRepairService(AppDbContext dbContext)
{
    public async Task EnsureAsync(CancellationToken cancellationToken = default)
    {
        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "LegalName" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "RegistrationNumberType" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "OldRegistrationNumber" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "Tin" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "MsicCode" character varying(50) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "TourismTaxRegistrationNumber" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "HomeCountry" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Companies"
            SET "LegalName" = COALESCE(NULLIF(TRIM("Name"), ''), "LegalName")
            WHERE "LegalName" IS NULL OR TRIM("LegalName") = '';
            """, cancellationToken);

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

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppSendWindowStartHourUtc" integer NOT NULL DEFAULT 9;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppSendWindowEndHourUtc" integer NOT NULL DEFAULT 18;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "WhatsAppOutboundQueues" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "InvoiceId" uuid NOT NULL,
                "ReminderScheduleId" uuid NULL,
                "RecipientPhoneNumber" character varying(50) NOT NULL,
                "Message" text NOT NULL,
                "Template" character varying(2000) NULL,
                "Reference" character varying(100) NOT NULL,
                "Status" character varying(40) NOT NULL,
                "NotBeforeUtc" timestamp with time zone NOT NULL,
                "AttemptCount" integer NOT NULL,
                "LastAttemptAtUtc" timestamp with time zone NULL,
                "NextAttemptAtUtc" timestamp with time zone NULL,
                "ExternalMessageId" character varying(200) NULL,
                "ErrorMessage" character varying(1000) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_WhatsAppOutboundQueues" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_WhatsAppOutboundQueues_Invoices_InvoiceId" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_WhatsAppOutboundQueues_ReminderSchedules_ReminderScheduleId" FOREIGN KEY ("ReminderScheduleId") REFERENCES "ReminderSchedules" ("Id") ON DELETE SET NULL
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppOutboundQueues_CompanyId_Status_NextAttemptAtUtc"
            ON "WhatsAppOutboundQueues" ("CompanyId", "Status", "NextAttemptAtUtc");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppOutboundQueues_CompanyId_Status_NotBeforeUtc"
            ON "WhatsAppOutboundQueues" ("CompanyId", "Status", "NotBeforeUtc");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppOutboundQueues_InvoiceId"
            ON "WhatsAppOutboundQueues" ("InvoiceId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppOutboundQueues_ReminderScheduleId"
            ON "WhatsAppOutboundQueues" ("ReminderScheduleId");
            """, cancellationToken);
    }
}
