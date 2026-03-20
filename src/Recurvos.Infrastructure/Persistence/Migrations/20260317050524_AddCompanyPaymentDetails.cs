using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyPaymentDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "BankName" character varying(100) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "BankAccount" character varying(100) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "PaymentLink" character varying(500) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "PaymentQrPath" character varying(500) NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "PaymentQrPath";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "PaymentLink";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "BankAccount";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "BankName";""");
        }
    }
}
