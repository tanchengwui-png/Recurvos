using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddEmailDispatchLogMetadata : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" ADD COLUMN IF NOT EXISTS "NotificationType" character varying(50) NULL;""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" ADD COLUMN IF NOT EXISTS "InvoiceId" uuid NULL;""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" ADD COLUMN IF NOT EXISTS "InvoiceNumber" character varying(100) NULL;""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" ADD COLUMN IF NOT EXISTS "CustomerName" character varying(200) NULL;""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" ADD COLUMN IF NOT EXISTS "MessageBody" text NULL;""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" ADD COLUMN IF NOT EXISTS "Status" character varying(30) NOT NULL DEFAULT 'Sent';""");
        migrationBuilder.Sql("""UPDATE "EmailDispatchLogs" SET "Status" = CASE WHEN "Succeeded" THEN 'Sent' ELSE 'Failed' END WHERE "Status" IS NULL OR "Status" = '';""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" DROP COLUMN IF EXISTS "Status";""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" DROP COLUMN IF EXISTS "MessageBody";""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" DROP COLUMN IF EXISTS "CustomerName";""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" DROP COLUMN IF EXISTS "InvoiceNumber";""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" DROP COLUMN IF EXISTS "InvoiceId";""");
        migrationBuilder.Sql("""ALTER TABLE "EmailDispatchLogs" DROP COLUMN IF EXISTS "NotificationType";""");
    }
}
