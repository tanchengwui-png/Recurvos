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
            ALTER TABLE "AuditLogs"
            ADD COLUMN IF NOT EXISTS "OldValue" text NULL,
            ADD COLUMN IF NOT EXISTS "NewValue" text NULL;
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
            ADD COLUMN IF NOT EXISTS "ReceivableAccountId" uuid NULL,
            ADD COLUMN IF NOT EXISTS "ReceivableAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "CreditLimit" numeric(18,2) NULL,
            ADD COLUMN IF NOT EXISTS "PayableAccountId" uuid NULL,
            ADD COLUMN IF NOT EXISTS "PayableAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "GroupsJson" text NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS "PriceLevel" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "Currency" character varying(20) NULL,
            ADD COLUMN IF NOT EXISTS "PaymentTerm" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "IncomeAccountId" uuid NULL,
            ADD COLUMN IF NOT EXISTS "IncomeAccount" character varying(100) NULL,
            ADD COLUMN IF NOT EXISTS "ExpenseAccountId" uuid NULL,
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
            ALTER TABLE "Invoices"
            ADD COLUMN IF NOT EXISTS "SubscriberCompanyId" uuid NULL,
            ADD COLUMN IF NOT EXISTS "SalesOrderId" uuid NULL,
            ADD COLUMN IF NOT EXISTS "DeliveryOrderId" uuid NULL,
            ADD COLUMN IF NOT EXISTS "SourceType" integer NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS "PaymentConfirmationTokenHash" character varying(128) NULL,
            ADD COLUMN IF NOT EXISTS "PaymentConfirmationTokenIssuedAtUtc" timestamp with time zone NULL,
            ADD COLUMN IF NOT EXISTS "AccountingExportedAtUtc" timestamp with time zone NULL;

            CREATE INDEX IF NOT EXISTS "IX_Invoices_SalesOrderId" ON "Invoices" ("SalesOrderId");
            CREATE INDEX IF NOT EXISTS "IX_Invoices_DeliveryOrderId" ON "Invoices" ("DeliveryOrderId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Invoices_PaymentConfirmationTokenHash" ON "Invoices" ("PaymentConfirmationTokenHash");
            CREATE INDEX IF NOT EXISTS "IX_Invoices_SubscriberCompanyId_SourceType" ON "Invoices" ("SubscriberCompanyId", "SourceType");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers"
            SET "OtherName" = COALESCE("OtherName", ''),
                "RegistrationNumberType" = COALESCE("RegistrationNumberType", ''),
                "RegistrationNumber" = COALESCE("RegistrationNumber", ''),
                "OldRegistrationNumber" = COALESCE("OldRegistrationNumber", ''),
                "Tin" = COALESCE("Tin", ''),
                "SstRegistrationNumber" = COALESCE("SstRegistrationNumber", ''),
                "ReceivableAccount" = COALESCE("ReceivableAccount", ''),
                "PayableAccount" = COALESCE("PayableAccount", ''),
                "PriceLevel" = COALESCE("PriceLevel", ''),
                "Currency" = COALESCE("Currency", ''),
                "PaymentTerm" = COALESCE("PaymentTerm", ''),
                "IncomeAccount" = COALESCE("IncomeAccount", ''),
                "ExpenseAccount" = COALESCE("ExpenseAccount", ''),
                "Location" = COALESCE("Location", ''),
                "MyInvoisControl" = COALESCE("MyInvoisControl", '')
            WHERE "OtherName" IS NULL
               OR "RegistrationNumberType" IS NULL
               OR "RegistrationNumber" IS NULL
               OR "OldRegistrationNumber" IS NULL
               OR "Tin" IS NULL
               OR "SstRegistrationNumber" IS NULL
               OR "ReceivableAccount" IS NULL
               OR "PayableAccount" IS NULL
               OR "PriceLevel" IS NULL
               OR "Currency" IS NULL
               OR "PaymentTerm" IS NULL
               OR "IncomeAccount" IS NULL
               OR "ExpenseAccount" IS NULL
               OR "Location" IS NULL
               OR "MyInvoisControl" IS NULL;
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
            CREATE TABLE IF NOT EXISTS "Accounts" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(50) NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Type" integer NOT NULL,
                "CurrencyCode" character varying(20) NOT NULL,
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "AllowManualEntries" boolean NOT NULL DEFAULT TRUE,
                "Description" character varying(500) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_Accounts" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_Accounts_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Accounts_CompanyId_Code" ON "Accounts" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_Accounts_CompanyId_Type_IsActive" ON "Accounts" ("CompanyId", "Type", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers" AS c
            SET "ReceivableAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 0
              AND a."Code" = c."ReceivableAccount"
              AND c."ReceivableAccountId" IS NULL
              AND COALESCE(c."ReceivableAccount", '') <> '';

            UPDATE "Customers" AS c
            SET "PayableAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 1
              AND a."Code" = c."PayableAccount"
              AND c."PayableAccountId" IS NULL
              AND COALESCE(c."PayableAccount", '') <> '';

            UPDATE "Customers" AS c
            SET "IncomeAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 3
              AND a."Code" = c."IncomeAccount"
              AND c."IncomeAccountId" IS NULL
              AND COALESCE(c."IncomeAccount", '') <> '';

            UPDATE "Customers" AS c
            SET "ExpenseAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 4
              AND a."Code" = c."ExpenseAccount"
              AND c."ExpenseAccountId" IS NULL
              AND COALESCE(c."ExpenseAccount", '') <> '';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            UPDATE "Customers" AS c
            SET "ReceivableAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 0
              AND UPPER(TRIM(a."Code")) = UPPER(TRIM(c."ReceivableAccount"))
              AND c."ReceivableAccountId" IS NULL
              AND COALESCE(TRIM(c."ReceivableAccount"), '') <> '';

            UPDATE "Customers" AS c
            SET "PayableAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 1
              AND UPPER(TRIM(a."Code")) = UPPER(TRIM(c."PayableAccount"))
              AND c."PayableAccountId" IS NULL
              AND COALESCE(TRIM(c."PayableAccount"), '') <> '';

            UPDATE "Customers" AS c
            SET "IncomeAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 3
              AND UPPER(TRIM(a."Code")) = UPPER(TRIM(c."IncomeAccount"))
              AND c."IncomeAccountId" IS NULL
              AND COALESCE(TRIM(c."IncomeAccount"), '') <> '';

            UPDATE "Customers" AS c
            SET "ExpenseAccountId" = a."Id"
            FROM "Users" AS u, "Accounts" AS a
            WHERE c."SubscriberId" = u."Id"
              AND a."CompanyId" = u."CompanyId"
              AND a."Type" = 4
              AND UPPER(TRIM(a."Code")) = UPPER(TRIM(c."ExpenseAccount"))
              AND c."ExpenseAccountId" IS NULL
              AND COALESCE(TRIM(c."ExpenseAccount"), '') <> '';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "Warehouses" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(50) NOT NULL,
                "Name" character varying(200) NOT NULL,
                "AddressJson" character varying(2000) NOT NULL DEFAULT '{{}}',
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_Warehouses" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_Warehouses_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Warehouses_CompanyId_Code" ON "Warehouses" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_Warehouses_CompanyId_IsActive" ON "Warehouses" ("CompanyId", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "TaxCodes" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(50) NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Rate" numeric(5,2) NOT NULL,
                "Scope" integer NOT NULL,
                "IsSst" boolean NOT NULL DEFAULT FALSE,
                "MyInvoisTaxTypeCode" character varying(50) NULL,
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_TaxCodes" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_TaxCodes_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_TaxCodes_CompanyId_Code" ON "TaxCodes" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_TaxCodes_CompanyId_Scope_IsActive" ON "TaxCodes" ("CompanyId", "Scope", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PaymentTerms" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(50) NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Days" integer NOT NULL,
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PaymentTerms" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PaymentTerms_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PaymentTerms_CompanyId_Code" ON "PaymentTerms" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_PaymentTerms_CompanyId_IsActive" ON "PaymentTerms" ("CompanyId", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "CurrencyDefinitions" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(20) NOT NULL,
                "Name" character varying(100) NOT NULL,
                "Symbol" character varying(10) NOT NULL,
                "DecimalPlaces" integer NOT NULL DEFAULT 2,
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_CurrencyDefinitions" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_CurrencyDefinitions_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CurrencyDefinitions_CompanyId_Code" ON "CurrencyDefinitions" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_CurrencyDefinitions_CompanyId_IsActive" ON "CurrencyDefinitions" ("CompanyId", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "ProductCategories" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(50) NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Description" character varying(500) NULL,
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_ProductCategories" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_ProductCategories_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ProductCategories_CompanyId_Code" ON "ProductCategories" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_ProductCategories_CompanyId_IsActive" ON "ProductCategories" ("CompanyId", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PriceLevels" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "Code" character varying(50) NOT NULL,
                "Name" character varying(200) NOT NULL,
                "AdjustmentPercent" numeric(8,2) NOT NULL DEFAULT 0,
                "Description" character varying(500) NULL,
                "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PriceLevels" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PriceLevels_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE,
                CONSTRAINT "CK_PriceLevels_AdjustmentPercent" CHECK ("AdjustmentPercent" >= -100 AND "AdjustmentPercent" <= 1000)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PriceLevels_CompanyId_Code" ON "PriceLevels" ("CompanyId", "Code");
            CREATE INDEX IF NOT EXISTS "IX_PriceLevels_CompanyId_IsActive" ON "PriceLevels" ("CompanyId", "IsActive");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "SalesQuotations" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "QuotationNumber" character varying(100) NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "DocumentDateUtc" timestamp with time zone NOT NULL,
                "ExpiryDateUtc" timestamp with time zone NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "ConvertedSalesOrderId" uuid NULL,
                "Subtotal" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_SalesQuotations" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_SalesQuotations_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesQuotations_CompanyId_QuotationNumber" ON "SalesQuotations" ("CompanyId", "QuotationNumber");
            CREATE INDEX IF NOT EXISTS "IX_SalesQuotations_CompanyId_Status" ON "SalesQuotations" ("CompanyId", "Status");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "SalesQuotationLines" (
                "Id" uuid NOT NULL,
                "SalesQuotationId" uuid NOT NULL,
                "SortOrder" integer NOT NULL,
                "ProductId" uuid NULL,
                "TaxCodeId" uuid NULL,
                "ProductNameSnapshot" character varying(200) NOT NULL DEFAULT '',
                "Description" character varying(1000) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitPrice" numeric(18,2) NOT NULL,
                "TaxRate" numeric(9,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_SalesQuotationLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_SalesQuotationLines_SalesQuotations_SalesQuotationId" FOREIGN KEY ("SalesQuotationId") REFERENCES "SalesQuotations" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_SalesQuotationLines_SalesQuotationId_SortOrder" ON "SalesQuotationLines" ("SalesQuotationId", "SortOrder");
            CREATE INDEX IF NOT EXISTS "IX_SalesQuotationLines_TaxCodeId" ON "SalesQuotationLines" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "SalesOrders" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "SalesOrderNumber" character varying(100) NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "DocumentDateUtc" timestamp with time zone NOT NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "SalesQuotationId" uuid NULL,
                "Subtotal" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_SalesOrders" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_SalesOrders_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesOrders_CompanyId_SalesOrderNumber" ON "SalesOrders" ("CompanyId", "SalesOrderNumber");
            CREATE INDEX IF NOT EXISTS "IX_SalesOrders_CompanyId_Status" ON "SalesOrders" ("CompanyId", "Status");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "SalesOrderLines" (
                "Id" uuid NOT NULL,
                "SalesOrderId" uuid NOT NULL,
                "SortOrder" integer NOT NULL,
                "ProductId" uuid NULL,
                "TaxCodeId" uuid NULL,
                "ProductNameSnapshot" character varying(200) NOT NULL DEFAULT '',
                "Description" character varying(1000) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitPrice" numeric(18,2) NOT NULL,
                "TaxRate" numeric(9,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "DeliveredQuantity" numeric(18,2) NOT NULL DEFAULT 0,
                "InvoicedQuantity" numeric(18,2) NOT NULL DEFAULT 0,
                "SourceQuotationLineId" uuid NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_SalesOrderLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_SalesOrderLines_SalesOrders_SalesOrderId" FOREIGN KEY ("SalesOrderId") REFERENCES "SalesOrders" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_SalesOrderLines_SalesOrderId_SortOrder" ON "SalesOrderLines" ("SalesOrderId", "SortOrder");
            CREATE INDEX IF NOT EXISTS "IX_SalesOrderLines_TaxCodeId" ON "SalesOrderLines" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "DeliveryOrders" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "DeliveryOrderNumber" character varying(100) NOT NULL,
                "SalesOrderId" uuid NOT NULL,
                "WarehouseId" uuid NULL,
                "SalesOrderNumber" character varying(100) NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "DocumentDateUtc" timestamp with time zone NOT NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "Subtotal" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_DeliveryOrders" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_DeliveryOrders_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_DeliveryOrders_CompanyId_DeliveryOrderNumber" ON "DeliveryOrders" ("CompanyId", "DeliveryOrderNumber");
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrders_CompanyId_Status" ON "DeliveryOrders" ("CompanyId", "Status");
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrders_CompanyId_SalesOrderId" ON "DeliveryOrders" ("CompanyId", "SalesOrderId");
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrders_WarehouseId" ON "DeliveryOrders" ("WarehouseId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "DeliveryOrderLines" (
                "Id" uuid NOT NULL,
                "DeliveryOrderId" uuid NOT NULL,
                "SortOrder" integer NOT NULL,
                "SalesOrderLineId" uuid NOT NULL,
                "ProductId" uuid NULL,
                "TaxCodeId" uuid NULL,
                "ProductNameSnapshot" character varying(200) NOT NULL DEFAULT '',
                "Description" character varying(1000) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitPrice" numeric(18,2) NOT NULL,
                "TaxRate" numeric(9,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "InvoicedQuantity" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_DeliveryOrderLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_DeliveryOrderLines_DeliveryOrders_DeliveryOrderId" FOREIGN KEY ("DeliveryOrderId") REFERENCES "DeliveryOrders" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrderLines_DeliveryOrderId_SortOrder" ON "DeliveryOrderLines" ("DeliveryOrderId", "SortOrder");
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrderLines_TaxCodeId" ON "DeliveryOrderLines" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseOrders" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "PurchaseOrderNumber" character varying(100) NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "DocumentDateUtc" timestamp with time zone NOT NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "Subtotal" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseOrders" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseOrders_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PurchaseOrders_CompanyId_PurchaseOrderNumber" ON "PurchaseOrders" ("CompanyId", "PurchaseOrderNumber");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseOrders_CompanyId_Status" ON "PurchaseOrders" ("CompanyId", "Status");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseOrderLines" (
                "Id" uuid NOT NULL,
                "PurchaseOrderId" uuid NOT NULL,
                "SortOrder" integer NOT NULL,
                "ProductId" uuid NULL,
                "TaxCodeId" uuid NULL,
                "ProductNameSnapshot" character varying(200) NOT NULL DEFAULT '',
                "Description" character varying(1000) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitPrice" numeric(18,2) NOT NULL,
                "TaxRate" numeric(9,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "ReceivedQuantity" numeric(18,2) NOT NULL DEFAULT 0,
                "BilledQuantity" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseOrderLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseOrderLines_PurchaseOrders_PurchaseOrderId" FOREIGN KEY ("PurchaseOrderId") REFERENCES "PurchaseOrders" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_PurchaseOrderLines_PurchaseOrderId_SortOrder" ON "PurchaseOrderLines" ("PurchaseOrderId", "SortOrder");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseOrderLines_TaxCodeId" ON "PurchaseOrderLines" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "GoodsReceivedNotes" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "GoodsReceivedNoteNumber" character varying(100) NOT NULL,
                "PurchaseOrderId" uuid NOT NULL,
                "WarehouseId" uuid NULL,
                "PurchaseOrderNumber" character varying(100) NOT NULL,
                "CreatedFromDocumentId" uuid NOT NULL,
                "CreatedFromDocumentNumber" character varying(100) NOT NULL,
                "CreatedFromDocumentType" character varying(50) NOT NULL DEFAULT 'PurchaseOrder',
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "DocumentDateUtc" timestamp with time zone NOT NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "Subtotal" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_GoodsReceivedNotes" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_GoodsReceivedNotes_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GoodsReceivedNotes_CompanyId_GoodsReceivedNoteNumber" ON "GoodsReceivedNotes" ("CompanyId", "GoodsReceivedNoteNumber");
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNotes_CompanyId_Status" ON "GoodsReceivedNotes" ("CompanyId", "Status");
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNotes_CompanyId_PurchaseOrderId" ON "GoodsReceivedNotes" ("CompanyId", "PurchaseOrderId");
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNotes_WarehouseId" ON "GoodsReceivedNotes" ("WarehouseId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "GoodsReceivedNoteLines" (
                "Id" uuid NOT NULL,
                "GoodsReceivedNoteId" uuid NOT NULL,
                "SortOrder" integer NOT NULL,
                "PurchaseOrderLineId" uuid NOT NULL,
                "ProductId" uuid NULL,
                "TaxCodeId" uuid NULL,
                "ProductNameSnapshot" character varying(200) NOT NULL DEFAULT '',
                "Description" character varying(1000) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitPrice" numeric(18,2) NOT NULL,
                "TaxRate" numeric(9,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "BilledQuantity" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_GoodsReceivedNoteLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_GoodsReceivedNoteLines_GoodsReceivedNotes_GoodsReceivedNoteId" FOREIGN KEY ("GoodsReceivedNoteId") REFERENCES "GoodsReceivedNotes" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNoteLines_GoodsReceivedNoteId_SortOrder" ON "GoodsReceivedNoteLines" ("GoodsReceivedNoteId", "SortOrder");
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNoteLines_TaxCodeId" ON "GoodsReceivedNoteLines" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseBills" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "PurchaseOrderId" uuid NULL,
                "GoodsReceivedNoteId" uuid NULL,
                "CreatedFromDocumentId" uuid NOT NULL,
                "CreatedFromDocumentNumber" character varying(100) NOT NULL,
                "CreatedFromDocumentType" character varying(50) NOT NULL,
                "PurchaseBillNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "IssueDateUtc" timestamp with time zone NOT NULL,
                "DueDateUtc" timestamp with time zone NOT NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "Subtotal" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "AmountDue" numeric(18,2) NOT NULL DEFAULT 0,
                "AmountPaid" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseBills" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseBills_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PurchaseBills_CompanyId_PurchaseBillNumber" ON "PurchaseBills" ("CompanyId", "PurchaseBillNumber");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseBills_CompanyId_Status" ON "PurchaseBills" ("CompanyId", "Status");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseBills_CompanyId_PurchaseOrderId" ON "PurchaseBills" ("CompanyId", "PurchaseOrderId");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseBills_CompanyId_GoodsReceivedNoteId" ON "PurchaseBills" ("CompanyId", "GoodsReceivedNoteId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseBillLines" (
                "Id" uuid NOT NULL,
                "PurchaseBillId" uuid NOT NULL,
                "PurchaseOrderLineId" uuid NULL,
                "GoodsReceivedNoteLineId" uuid NULL,
                "ProductId" uuid NULL,
                "TaxCodeId" uuid NULL,
                "ProductNameSnapshot" character varying(200) NOT NULL DEFAULT '',
                "Description" character varying(1000) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitPrice" numeric(18,2) NOT NULL,
                "TaxRate" numeric(9,2) NOT NULL DEFAULT 0,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseBillLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseBillLines_PurchaseBills_PurchaseBillId" FOREIGN KEY ("PurchaseBillId") REFERENCES "PurchaseBills" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_PurchaseBillLines_PurchaseBillId" ON "PurchaseBillLines" ("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseBillLines_TaxCodeId" ON "PurchaseBillLines" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "DeliveryOrders" ADD COLUMN IF NOT EXISTS "WarehouseId" uuid NULL;
            ALTER TABLE "GoodsReceivedNotes" ADD COLUMN IF NOT EXISTS "WarehouseId" uuid NULL;
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrders_WarehouseId" ON "DeliveryOrders" ("WarehouseId");
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNotes_WarehouseId" ON "GoodsReceivedNotes" ("WarehouseId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "SalesQuotationLines" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "SalesOrderLines" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "DeliveryOrderLines" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "PurchaseOrderLines" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "GoodsReceivedNoteLines" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "PurchaseBillLines" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "InvoiceLineItems" ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            ALTER TABLE "InvoiceLineItems" ADD COLUMN IF NOT EXISTS "TaxRate" numeric(5,2) NOT NULL DEFAULT 0;
            ALTER TABLE "InvoiceLineItems" ADD COLUMN IF NOT EXISTS "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0;
            ALTER TABLE "InvoiceLineItems" ADD COLUMN IF NOT EXISTS "LineTotal" numeric(18,2) NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS "IX_SalesQuotationLines_TaxCodeId" ON "SalesQuotationLines" ("TaxCodeId");
            CREATE INDEX IF NOT EXISTS "IX_SalesOrderLines_TaxCodeId" ON "SalesOrderLines" ("TaxCodeId");
            CREATE INDEX IF NOT EXISTS "IX_DeliveryOrderLines_TaxCodeId" ON "DeliveryOrderLines" ("TaxCodeId");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseOrderLines_TaxCodeId" ON "PurchaseOrderLines" ("TaxCodeId");
            CREATE INDEX IF NOT EXISTS "IX_GoodsReceivedNoteLines_TaxCodeId" ON "GoodsReceivedNoteLines" ("TaxCodeId");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseBillLines_TaxCodeId" ON "PurchaseBillLines" ("TaxCodeId");
            CREATE INDEX IF NOT EXISTS "IX_InvoiceLineItems_TaxCodeId" ON "InvoiceLineItems" ("TaxCodeId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchasePayments" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "PurchasePaymentNumber" character varying(100) NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "PaymentDateUtc" timestamp with time zone NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "Status" integer NOT NULL DEFAULT 0,
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchasePayments" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchasePayments_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PurchasePayments_CompanyId_PurchasePaymentNumber" ON "PurchasePayments" ("CompanyId", "PurchasePaymentNumber");
            CREATE INDEX IF NOT EXISTS "IX_PurchasePayments_CompanyId_Status" ON "PurchasePayments" ("CompanyId", "Status");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchasePaymentAllocations" (
                "Id" uuid NOT NULL,
                "PurchasePaymentId" uuid NOT NULL,
                "PurchaseBillId" uuid NOT NULL,
                "PurchaseBillNumber" character varying(100) NOT NULL,
                "Amount" numeric(18,2) NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchasePaymentAllocations" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchasePaymentAllocations_PurchasePayments_PurchasePaymentId" FOREIGN KEY ("PurchasePaymentId") REFERENCES "PurchasePayments" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_PurchasePaymentAllocations_PurchasePaymentId" ON "PurchasePaymentAllocations" ("PurchasePaymentId");
            CREATE INDEX IF NOT EXISTS "IX_PurchasePaymentAllocations_PurchaseBillId" ON "PurchasePaymentAllocations" ("PurchaseBillId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseCreditNotes" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "PurchaseBillId" uuid NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "PurchaseCreditNoteNumber" character varying(100) NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "SubtotalReduction" numeric(18,2) NOT NULL DEFAULT 0,
                "TaxReduction" numeric(18,2) NOT NULL DEFAULT 0,
                "TotalReduction" numeric(18,2) NOT NULL DEFAULT 0,
                "Reason" character varying(1000) NOT NULL,
                "Status" integer NOT NULL DEFAULT 0,
                "IssuedAtUtc" timestamp with time zone NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseCreditNotes" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseCreditNotes_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PurchaseCreditNotes_CompanyId_PurchaseCreditNoteNumber" ON "PurchaseCreditNotes" ("CompanyId", "PurchaseCreditNoteNumber");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseCreditNotes_CompanyId_PurchaseBillId" ON "PurchaseCreditNotes" ("CompanyId", "PurchaseBillId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseCreditNoteLines" (
                "Id" uuid NOT NULL,
                "PurchaseCreditNoteId" uuid NOT NULL,
                "Description" character varying(250) NOT NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "UnitAmount" numeric(18,2) NOT NULL,
                "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "LineTotal" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseCreditNoteLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseCreditNoteLines_PurchaseCreditNotes_PurchaseCreditNoteId" FOREIGN KEY ("PurchaseCreditNoteId") REFERENCES "PurchaseCreditNotes" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_PurchaseCreditNoteLines_PurchaseCreditNoteId" ON "PurchaseCreditNoteLines" ("PurchaseCreditNoteId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseRefunds" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "PurchasePaymentId" uuid NOT NULL,
                "ContactId" uuid NOT NULL,
                "ContactName" character varying(200) NOT NULL,
                "ContactEmail" character varying(200) NOT NULL,
                "ContactPhoneNumber" character varying(100) NOT NULL,
                "PurchaseRefundNumber" character varying(100) NOT NULL,
                "RefundDateUtc" timestamp with time zone NOT NULL,
                "Currency" character varying(20) NOT NULL DEFAULT 'MYR',
                "ReferenceNo" character varying(100) NOT NULL DEFAULT '',
                "Notes" character varying(4000) NOT NULL DEFAULT '',
                "TotalAmount" numeric(18,2) NOT NULL DEFAULT 0,
                "Status" integer NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseRefunds" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseRefunds_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PurchaseRefunds_CompanyId_PurchaseRefundNumber" ON "PurchaseRefunds" ("CompanyId", "PurchaseRefundNumber");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseRefunds_CompanyId_PurchasePaymentId" ON "PurchaseRefunds" ("CompanyId", "PurchasePaymentId");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseRefunds_CompanyId_Status" ON "PurchaseRefunds" ("CompanyId", "Status");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PurchaseRefundAllocations" (
                "Id" uuid NOT NULL,
                "PurchaseRefundId" uuid NOT NULL,
                "PurchasePaymentAllocationId" uuid NOT NULL,
                "PurchaseBillId" uuid NOT NULL,
                "PurchaseBillNumber" character varying(100) NOT NULL,
                "Amount" numeric(18,2) NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_PurchaseRefundAllocations" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PurchaseRefundAllocations_PurchaseRefunds_PurchaseRefundId" FOREIGN KEY ("PurchaseRefundId") REFERENCES "PurchaseRefunds" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_PurchaseRefundAllocations_PurchaseRefundId" ON "PurchaseRefundAllocations" ("PurchaseRefundId");
            CREATE INDEX IF NOT EXISTS "IX_PurchaseRefundAllocations_PurchasePaymentAllocationId" ON "PurchaseRefundAllocations" ("PurchasePaymentAllocationId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "InventoryBalances" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "ProductId" uuid NOT NULL,
                "WarehouseId" uuid NULL,
                "QuantityOnHand" numeric(18,2) NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_InventoryBalances" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_InventoryBalances_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_InventoryBalances_CompanyId_ProductId_WarehouseId" ON "InventoryBalances" ("CompanyId", "ProductId", "WarehouseId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "InventoryMovements" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "ProductId" uuid NOT NULL,
                "WarehouseId" uuid NULL,
                "Quantity" numeric(18,2) NOT NULL,
                "MovementType" integer NOT NULL,
                "SourceDocumentType" character varying(50) NOT NULL,
                "SourceDocumentId" uuid NOT NULL,
                "TransactionDateUtc" timestamp with time zone NOT NULL,
                "Notes" character varying(500) NOT NULL DEFAULT '',
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_InventoryMovements" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_InventoryMovements_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_InventoryMovements_CompanyId_ProductId_TransactionDateUtc" ON "InventoryMovements" ("CompanyId", "ProductId", "TransactionDateUtc");
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
                "AddressName" character varying(120) NOT NULL DEFAULT 'Primary',
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
            ADD COLUMN IF NOT EXISTS "AddressName" character varying(120) NOT NULL DEFAULT 'Primary';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            WITH numbered_addresses AS (
                SELECT "Id",
                       ROW_NUMBER() OVER (PARTITION BY "CompanyId" ORDER BY "CreatedAtUtc", "Id") AS row_number
                FROM company_addresses
                WHERE COALESCE(TRIM("AddressName"), '') = ''
            )
            UPDATE company_addresses addresses
            SET "AddressName" = CASE
                WHEN numbered_addresses.row_number = 1 THEN 'Primary'
                ELSE 'Address ' || numbered_addresses.row_number::text
            END
            FROM numbered_addresses
            WHERE addresses."Id" = numbered_addresses."Id";
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

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "ProductGroups" (
                "Id" uuid NOT NULL,
                "SubscriberId" uuid NOT NULL,
                "Name" character varying(150) NOT NULL,
                "Description" character varying(1000) NOT NULL DEFAULT '',
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_ProductGroups" PRIMARY KEY ("Id")
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_ProductGroups_SubscriberId"
            ON "ProductGroups" ("SubscriberId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ProductGroups_SubscriberId_Name"
            ON "ProductGroups" ("SubscriberId", "Name");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "products"
            ADD COLUMN IF NOT EXISTS "HasCustomSalesPrices" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "products"
            ADD COLUMN IF NOT EXISTS "CustomSalesPricesJson" text NOT NULL DEFAULT '[]';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "products"
            ADD COLUMN IF NOT EXISTS "HasCustomPurchasePrices" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "products"
            ADD COLUMN IF NOT EXISTS "CustomPurchasePricesJson" text NOT NULL DEFAULT '[]';
            """, cancellationToken);
    }
}
