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
            ALTER TABLE "Customers"
            ADD COLUMN IF NOT EXISTS "ContactType" character varying(30) NOT NULL DEFAULT 'Customer';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Customers"
            ADD COLUMN IF NOT EXISTS "Status" character varying(30) NOT NULL DEFAULT 'Active';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers"
            SET "ContactType" = 'Customer'
            WHERE "ContactType" IS NULL OR TRIM("ContactType") = '';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers"
            SET "Status" = 'Active'
            WHERE "Status" IS NULL OR TRIM("Status") = '';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Customers"
            ADD COLUMN IF NOT EXISTS "EntityType" character varying(50) NOT NULL DEFAULT 'Company';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Customers"
            ADD COLUMN IF NOT EXISTS "LegalName" character varying(200) NULL,
            ADD COLUMN IF NOT EXISTS "OtherName" character varying(200) NULL,
            ADD COLUMN IF NOT EXISTS "RegistrationNumberType" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "RegistrationNumber" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "OldRegistrationNumber" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "Tin" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "SstRegistrationNumber" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "ContactPersonsJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "PhoneNumbersJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "EmailAddressesJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "AddressesJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "ReceivableAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "CreditLimit" numeric(18,2) NULL,
            ADD COLUMN IF NOT EXISTS "PayableAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "GroupsJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "PriceLevel" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "Currency" character varying(20) NULL,
            ADD COLUMN IF NOT EXISTS "PaymentTerm" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "IncomeAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "ExpenseAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "Location" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "TagsJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "MyInvoisControl" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers"
            SET "LegalName" = COALESCE(NULLIF(TRIM("Name"), ''), "LegalName")
            WHERE "LegalName" IS NULL OR TRIM("LegalName") = '';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers"
            SET "PhoneNumbersJson" = CASE
                    WHEN COALESCE(NULLIF(TRIM("PhoneNumber"), ''), '') = '' THEN '[]'
                    ELSE json_build_array("PhoneNumber")::text
                END,
                "EmailAddressesJson" = CASE
                    WHEN COALESCE(NULLIF(TRIM("Email"), ''), '') = '' THEN '[]'
                    ELSE json_build_array("Email")::text
                END,
                "AddressesJson" = CASE
                    WHEN COALESCE(NULLIF(TRIM("BillingAddress"), ''), '') = '' THEN '[]'
                    ELSE json_build_array(
                        json_build_object(
                            'AddressName', 'Primary',
                            'StreetAddress', "BillingAddress",
                            'City', '',
                            'Postcode', '',
                            'Country', '',
                            'State', '',
                            'IsDefaultBilling', true,
                            'IsDefaultShipping', true
                        )
                    )::text
                END
            WHERE "PhoneNumbersJson" = '[]'
               OR "EmailAddressesJson" = '[]'
               OR "AddressesJson" = '[]';
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
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "AutoCompressUploads" boolean NOT NULL DEFAULT TRUE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UploadMaxBytes" integer NOT NULL DEFAULT 2097152;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UploadImageMaxDimension" integer NOT NULL DEFAULT 1600;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UploadImageQuality" integer NOT NULL DEFAULT 80;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS company_addresses (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "AddressLine1" character varying(250) NOT NULL,
                "AddressLine2" character varying(250) NULL,
                "AddressLine3" character varying(250) NULL,
                "Postcode" character varying(50) NULL,
                "City" character varying(150) NULL,
                "State" character varying(150) NULL,
                "Country" character varying(100) NOT NULL,
                "IsDefault" boolean NOT NULL DEFAULT FALSE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_company_addresses" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_company_addresses_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_company_addresses_CompanyId"
            ON company_addresses ("CompanyId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_addresses
            ADD COLUMN IF NOT EXISTS "IsDefaultBilling" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_addresses
            ADD COLUMN IF NOT EXISTS "IsDefaultShipping" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE company_addresses
            SET "IsDefaultBilling" = COALESCE("IsDefaultBilling", FALSE) OR COALESCE("IsDefault", FALSE),
                "IsDefaultShipping" = COALESCE("IsDefaultShipping", FALSE) OR COALESCE("IsDefault", FALSE);
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            WITH company_first_addresses AS (
                SELECT DISTINCT ON ("CompanyId") "Id", "CompanyId"
                FROM company_addresses
                ORDER BY "CompanyId", "CreatedAtUtc", "Id"
            )
            UPDATE company_addresses addresses
            SET "IsDefaultBilling" = TRUE
            FROM company_first_addresses first_addresses
            WHERE addresses."Id" = first_addresses."Id"
              AND NOT EXISTS (
                  SELECT 1
                  FROM company_addresses existing
                  WHERE existing."CompanyId" = first_addresses."CompanyId"
                    AND existing."IsDefaultBilling" = TRUE
              );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            WITH company_first_addresses AS (
                SELECT DISTINCT ON ("CompanyId") "Id", "CompanyId"
                FROM company_addresses
                ORDER BY "CompanyId", "CreatedAtUtc", "Id"
            )
            UPDATE company_addresses addresses
            SET "IsDefaultShipping" = TRUE
            FROM company_first_addresses first_addresses
            WHERE addresses."Id" = first_addresses."Id"
              AND NOT EXISTS (
                  SELECT 1
                  FROM company_addresses existing
                  WHERE existing."CompanyId" = first_addresses."CompanyId"
                    AND existing."IsDefaultShipping" = TRUE
              );
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

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "ContactGroups" (
                "Id" uuid NOT NULL,
                "SubscriberId" uuid NOT NULL,
                "Name" character varying(150) NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_ContactGroups" PRIMARY KEY ("Id")
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_ContactGroups_SubscriberId"
            ON "ContactGroups" ("SubscriberId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ContactGroups_SubscriberId_Name"
            ON "ContactGroups" ("SubscriberId", "Name");
            """, cancellationToken);
    }
}
