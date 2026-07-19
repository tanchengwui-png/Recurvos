using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddInvoiceLineItemOrderLineReferences : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "InvoiceLineItems"
            ADD COLUMN IF NOT EXISTS "SalesOrderLineId" uuid NULL;
            """);

        migrationBuilder.Sql("""
            ALTER TABLE "InvoiceLineItems"
            ADD COLUMN IF NOT EXISTS "DeliveryOrderLineId" uuid NULL;
            """);

        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS "IX_InvoiceLineItems_SalesOrderLineId" ON "InvoiceLineItems" ("SalesOrderLineId");
            """);

        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS "IX_InvoiceLineItems_DeliveryOrderLineId" ON "InvoiceLineItems" ("DeliveryOrderLineId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_InvoiceLineItems_DeliveryOrderLineId";""");
        migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_InvoiceLineItems_SalesOrderLineId";""");
        migrationBuilder.Sql("""ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "DeliveryOrderLineId";""");
        migrationBuilder.Sql("""ALTER TABLE "InvoiceLineItems" DROP COLUMN IF EXISTS "SalesOrderLineId";""");
    }
}
