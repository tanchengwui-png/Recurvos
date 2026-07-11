using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddInvoiceLineTaxSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "InvoiceLineItems"
            ADD COLUMN IF NOT EXISTS "TaxCodeId" uuid NULL;
            """);

        migrationBuilder.Sql("""
            ALTER TABLE "InvoiceLineItems"
            ADD COLUMN IF NOT EXISTS "TaxRate" numeric(5,2) NOT NULL DEFAULT 0;
            """);

        migrationBuilder.Sql("""
            ALTER TABLE "InvoiceLineItems"
            ADD COLUMN IF NOT EXISTS "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0;
            """);

        migrationBuilder.Sql("""
            ALTER TABLE "InvoiceLineItems"
            ADD COLUMN IF NOT EXISTS "LineTotal" numeric(18,2) NOT NULL DEFAULT 0;
            """);

        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS "IX_InvoiceLineItems_TaxCodeId" ON "InvoiceLineItems" ("TaxCodeId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_InvoiceLineItems_TaxCodeId";""");
        migrationBuilder.Sql("""ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "LineTotal";""");
        migrationBuilder.Sql("""ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "TaxAmount";""");
        migrationBuilder.Sql("""ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "TaxRate";""");
        migrationBuilder.Sql("""ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "TaxCodeId";""");
    }
}
