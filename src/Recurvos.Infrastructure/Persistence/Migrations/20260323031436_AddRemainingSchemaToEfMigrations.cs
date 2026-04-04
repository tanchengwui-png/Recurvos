using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddRemainingSchemaToEfMigrations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        AddColumnIfNotExists(migrationBuilder, "\"Users\"", "IsActive", "boolean NOT NULL DEFAULT TRUE");

        AddColumnIfNotExists(migrationBuilder, "\"PlatformPackages\"", "MaxPlans", "integer NOT NULL DEFAULT 0");
        AddColumnIfNotExists(migrationBuilder, "\"PlatformPackages\"", "MaxWhatsAppRemindersPerMonth", "integer NOT NULL DEFAULT 0");

        AddColumnIfNotExists(migrationBuilder, "\"Invoices\"", "IsTaxEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"Invoices\"", "TaxAmount", "numeric(18,2) NOT NULL DEFAULT 0");
        AddColumnIfNotExists(migrationBuilder, "\"Invoices\"", "TaxName", "character varying(50) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"Invoices\"", "TaxRate", "numeric(5,2) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"Invoices\"", "TaxRegistrationNo", "character varying(100) NULL");

        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "AutoCompressUploads", "boolean NOT NULL DEFAULT TRUE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "AutoSendInvoices", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzApiKey", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzBaseUrl", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzCollectionId", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzRequireSignatureVerification", "boolean NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzXSignatureKey", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "CcSubscriberOnCustomerEmails", "boolean NOT NULL DEFAULT TRUE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "EmailShieldAddress", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "EmailShieldEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "FeedbackNotificationEmail", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "IsTaxEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "LocalEmailCaptureEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentDueDays", "integer NOT NULL DEFAULT 7");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentGatewayProvider", "character varying(40) NOT NULL DEFAULT 'none'");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentGatewayTermsAccepted", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentGatewayTermsAcceptedAtUtc", "timestamp with time zone NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzApiKey", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzBaseUrl", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzCollectionId", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzRequireSignatureVerification", "boolean NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzXSignatureKey", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionEmailShieldAddress", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionEmailShieldEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerAddress", "character varying(500) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerBillingEmail", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerCompanyName", "character varying(150) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerPhone", "character varying(50) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerRegistrationNumber", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionLocalEmailCaptureEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpFromEmail", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpFromName", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpHost", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpPassword", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpPort", "integer NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpUseSsl", "boolean NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpUsername", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptLastResetYear", "integer NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptNextNumber", "integer NOT NULL DEFAULT 0");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptPadding", "integer NOT NULL DEFAULT 0");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptPrefix", "text NOT NULL DEFAULT ''");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptResetYearly", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ShowCompanyAddressOnInvoice", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "ShowCompanyAddressOnReceipt", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpFromEmail", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpFromName", "character varying(150) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpHost", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpPassword", "character varying(500) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpPort", "integer NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpUseSsl", "boolean NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpUsername", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzApiKey", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzBaseUrl", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzCollectionId", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzRequireSignatureVerification", "boolean NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzXSignatureKey", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "TaxName", "character varying(50) NOT NULL DEFAULT 'SST'");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "TaxRate", "numeric(5,2) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "TaxRegistrationNo", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "UploadImageMaxDimension", "integer NOT NULL DEFAULT 1600");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "UploadImageQuality", "integer NOT NULL DEFAULT 80");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "UploadMaxBytes", "integer NOT NULL DEFAULT 2097152");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "UseProductionPlatformSettings", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppAccessToken", "character varying(500) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppApiUrl", "character varying(500) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppEnabled", "boolean NOT NULL DEFAULT FALSE");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppProvider", "character varying(50) NOT NULL DEFAULT ''");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSenderId", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSessionLastSyncedAtUtc", "timestamp with time zone NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSessionPhone", "character varying(50) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSessionStatus", "character varying(50) NULL");
        AddColumnIfNotExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppTemplate", "character varying(2000) NULL");

        migrationBuilder.Sql("""
            ALTER TABLE "Companies"
            ALTER COLUMN "PackageStatus" TYPE character varying(40);
            """);

        AddColumnIfNotExists(migrationBuilder, "\"Companies\"", "Industry", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"Companies\"", "NatureOfBusiness", "text NULL");
        AddColumnIfNotExists(migrationBuilder, "\"Companies\"", "PackageBillingCycleStartUtc", "timestamp with time zone NULL");
        AddColumnIfNotExists(migrationBuilder, "\"Companies\"", "PendingPackageCode", "character varying(20) NULL");

        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "EmailDispatchLogs" (
                "Id" uuid NOT NULL,
                "OriginalRecipient" character varying(200) NOT NULL,
                "EffectiveRecipient" character varying(200) NOT NULL,
                "Subject" character varying(300) NOT NULL,
                "DeliveryMode" character varying(50) NOT NULL,
                "WasRedirected" boolean NOT NULL,
                "RedirectReason" character varying(100) NULL,
                "Succeeded" boolean NOT NULL,
                "ErrorMessage" character varying(1000) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                "CompanyId" uuid NOT NULL,
                CONSTRAINT "PK_EmailDispatchLogs" PRIMARY KEY ("Id")
            );
            """);

        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "FeedbackItems" (
                "Id" uuid NOT NULL,
                "SubmittedByUserId" uuid NULL,
                "SubmittedByName" character varying(150) NOT NULL,
                "SubmittedByEmail" character varying(200) NOT NULL,
                "Subject" character varying(150) NOT NULL,
                "Category" character varying(40) NOT NULL,
                "Priority" character varying(20) NOT NULL,
                "Message" character varying(2000) NOT NULL,
                "StepsToReproduce" text NULL,
                "ExpectedResult" text NULL,
                "ActualResult" text NULL,
                "PageUrl" text NULL,
                "BrowserInfo" text NULL,
                "ScreenshotPath" text NULL,
                "ScreenshotFileName" text NULL,
                "ScreenshotContentType" text NULL,
                "Status" character varying(30) NOT NULL,
                "AdminNote" character varying(1000) NULL,
                "ReviewedAtUtc" timestamp with time zone NULL,
                "ReviewedByUserId" uuid NULL,
                "LastPlatformResponseAtUtc" timestamp with time zone NULL,
                "SubscriberLastViewedAtUtc" timestamp with time zone NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                "CompanyId" uuid NOT NULL,
                CONSTRAINT "PK_FeedbackItems" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_FeedbackItems_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_FeedbackItems_Users_ReviewedByUserId" FOREIGN KEY ("ReviewedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL,
                CONSTRAINT "FK_FeedbackItems_Users_SubmittedByUserId" FOREIGN KEY ("SubmittedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL
            );
            """);

        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "WhatsAppNotifications" (
                "Id" uuid NOT NULL,
                "InvoiceId" uuid NOT NULL,
                "ReminderScheduleId" uuid NULL,
                "RecipientPhoneNumber" character varying(50) NOT NULL,
                "Status" character varying(40) NOT NULL,
                "ExternalMessageId" character varying(200) NULL,
                "ErrorMessage" character varying(1000) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                "CompanyId" uuid NOT NULL,
                CONSTRAINT "PK_WhatsAppNotifications" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_WhatsAppNotifications_Invoices_InvoiceId" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_WhatsAppNotifications_ReminderSchedules_ReminderScheduleId" FOREIGN KEY ("ReminderScheduleId") REFERENCES "ReminderSchedules" ("Id") ON DELETE SET NULL
            );
            """);

        migrationBuilder.Sql("""CREATE UNIQUE INDEX IF NOT EXISTS "IX_product_plans_ProductId_IsDefault_True" ON "product_plans" ("ProductId", "IsDefault") WHERE "IsDefault" = TRUE;""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_EmailDispatchLogs_CompanyId_CreatedAtUtc" ON "EmailDispatchLogs" ("CompanyId", "CreatedAtUtc");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_CompanyId_LastPlatformResponseAtUtc" ON "FeedbackItems" ("CompanyId", "LastPlatformResponseAtUtc");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_CompanyId_Status_CreatedAtUtc" ON "FeedbackItems" ("CompanyId", "Status", "CreatedAtUtc");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_ReviewedByUserId" ON "FeedbackItems" ("ReviewedByUserId");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_SubmittedByUserId" ON "FeedbackItems" ("SubmittedByUserId");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_WhatsAppNotifications_CompanyId_CreatedAtUtc" ON "WhatsAppNotifications" ("CompanyId", "CreatedAtUtc");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_WhatsAppNotifications_InvoiceId" ON "WhatsAppNotifications" ("InvoiceId");""");
        migrationBuilder.Sql("""CREATE INDEX IF NOT EXISTS "IX_WhatsAppNotifications_ReminderScheduleId" ON "WhatsAppNotifications" ("ReminderScheduleId");""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_WhatsAppNotifications_ReminderScheduleId";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_WhatsAppNotifications_InvoiceId";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_WhatsAppNotifications_CompanyId_CreatedAtUtc";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_FeedbackItems_SubmittedByUserId";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_FeedbackItems_ReviewedByUserId";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_FeedbackItems_CompanyId_Status_CreatedAtUtc";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_FeedbackItems_CompanyId_LastPlatformResponseAtUtc";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_EmailDispatchLogs_CompanyId_CreatedAtUtc";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_product_plans_ProductId_IsDefault_True";""");

        migrationBuilder.Sql("""DROP TABLE IF EXISTS "WhatsAppNotifications";""");
        migrationBuilder.Sql("""DROP TABLE IF EXISTS "FeedbackItems";""");
        migrationBuilder.Sql("""DROP TABLE IF EXISTS "EmailDispatchLogs";""");

        DropColumnIfExists(migrationBuilder, "\"Companies\"", "PendingPackageCode");
        DropColumnIfExists(migrationBuilder, "\"Companies\"", "PackageBillingCycleStartUtc");
        DropColumnIfExists(migrationBuilder, "\"Companies\"", "NatureOfBusiness");
        DropColumnIfExists(migrationBuilder, "\"Companies\"", "Industry");
        migrationBuilder.Sql("""
            ALTER TABLE "Companies"
            ALTER COLUMN "PackageStatus" TYPE character varying(20);
            """);

        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppTemplate");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSessionStatus");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSessionPhone");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSessionLastSyncedAtUtc");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppSenderId");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppProvider");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppEnabled");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppApiUrl");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "WhatsAppAccessToken");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "UseProductionPlatformSettings");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "UploadMaxBytes");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "UploadImageQuality");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "UploadImageMaxDimension");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "TaxRegistrationNo");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "TaxRate");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "TaxName");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzXSignatureKey");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzRequireSignatureVerification");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzCollectionId");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzBaseUrl");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SubscriberBillplzApiKey");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpUsername");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpUseSsl");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpPort");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpPassword");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpHost");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpFromName");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "SmtpFromEmail");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ShowCompanyAddressOnReceipt");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ShowCompanyAddressOnInvoice");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptResetYearly");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptPrefix");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptPadding");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptNextNumber");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ReceiptLastResetYear");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpUsername");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpUseSsl");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpPort");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpPassword");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpHost");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpFromName");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionSmtpFromEmail");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionLocalEmailCaptureEnabled");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerRegistrationNumber");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerPhone");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerCompanyName");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerBillingEmail");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionIssuerAddress");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionEmailShieldEnabled");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionEmailShieldAddress");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzXSignatureKey");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzRequireSignatureVerification");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzCollectionId");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzBaseUrl");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "ProductionBillplzApiKey");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentGatewayTermsAcceptedAtUtc");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentGatewayTermsAccepted");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentGatewayProvider");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "PaymentDueDays");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "LocalEmailCaptureEnabled");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "IsTaxEnabled");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "FeedbackNotificationEmail");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "EmailShieldEnabled");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "EmailShieldAddress");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "CcSubscriberOnCustomerEmails");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzXSignatureKey");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzRequireSignatureVerification");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzCollectionId");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzBaseUrl");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "BillplzApiKey");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "AutoSendInvoices");
        DropColumnIfExists(migrationBuilder, "\"company_invoice_settings\"", "AutoCompressUploads");

        DropColumnIfExists(migrationBuilder, "\"Invoices\"", "TaxRegistrationNo");
        DropColumnIfExists(migrationBuilder, "\"Invoices\"", "TaxRate");
        DropColumnIfExists(migrationBuilder, "\"Invoices\"", "TaxName");
        DropColumnIfExists(migrationBuilder, "\"Invoices\"", "TaxAmount");
        DropColumnIfExists(migrationBuilder, "\"Invoices\"", "IsTaxEnabled");

        DropColumnIfExists(migrationBuilder, "\"PlatformPackages\"", "MaxWhatsAppRemindersPerMonth");
        DropColumnIfExists(migrationBuilder, "\"PlatformPackages\"", "MaxPlans");

        DropColumnIfExists(migrationBuilder, "\"Users\"", "IsActive");
    }

    private static void AddColumnIfNotExists(MigrationBuilder migrationBuilder, string tableName, string columnName, string columnDefinition)
    {
        migrationBuilder.Sql($$"""
            ALTER TABLE {{tableName}}
            ADD COLUMN IF NOT EXISTS "{{columnName}}" {{columnDefinition}};
            """);
    }

    private static void DropColumnIfExists(MigrationBuilder migrationBuilder, string tableName, string columnName)
    {
        migrationBuilder.Sql($$"""
            ALTER TABLE {{tableName}}
            DROP COLUMN IF EXISTS "{{columnName}}";
            """);
    }
}
