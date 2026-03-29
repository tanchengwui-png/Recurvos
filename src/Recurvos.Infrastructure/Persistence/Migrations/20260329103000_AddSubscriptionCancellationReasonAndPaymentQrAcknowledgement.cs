using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    public partial class AddSubscriptionCancellationReasonAndPaymentQrAcknowledgement : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Subscriptions"
                ADD COLUMN IF NOT EXISTS "CancellationReason" character varying(1000) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "PaymentQrResponsibilityAcceptedAtUtc" timestamp with time zone NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "PaymentQrResponsibilityStatement" character varying(1000) NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "PaymentQrResponsibilityStatement";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "PaymentQrResponsibilityAcceptedAtUtc";""");
            migrationBuilder.Sql("""ALTER TABLE "Subscriptions" DROP COLUMN IF EXISTS "CancellationReason";""");
        }
    }
}
