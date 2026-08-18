using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260812090000_AddSingleCompanyOwnershipToCustomers")]
public partial class AddSingleCompanyOwnershipToCustomers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "CompanyId",
            table: "Customers",
            type: "uuid",
            nullable: true);

        // Move only unambiguous legacy records. Multi-workspace and unassigned
        // contacts are deliberately quarantined for review rather than silently
        // assigned to a company or duplicated without reconciling their records.
        migrationBuilder.Sql("""
            UPDATE "Customers"
            SET "CompanyId" = ("CompanyIdsJson"::jsonb ->> 0)::uuid
            WHERE jsonb_typeof("CompanyIdsJson"::jsonb) = 'array'
              AND jsonb_array_length("CompanyIdsJson"::jsonb) = 1;
            """);

        migrationBuilder.CreateTable(
            name: "LegacyCustomerOwnershipIssues",
            columns: table => new
            {
                CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                CompanyIdsJson = table.Column<string>(type: "text", nullable: false),
                Reason = table.Column<string>(type: "text", nullable: false),
                ReportedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_LegacyCustomerOwnershipIssues", x => x.CustomerId));

        migrationBuilder.Sql("""
            INSERT INTO "LegacyCustomerOwnershipIssues" ("CustomerId", "CompanyIdsJson", "Reason", "ReportedAtUtc")
            SELECT "Id", "CompanyIdsJson",
                   CASE WHEN jsonb_array_length("CompanyIdsJson"::jsonb) = 0
                        THEN 'No company assignment in legacy contact.'
                        ELSE 'Multiple company assignments in legacy contact. Review and split into separate contacts as needed.' END,
                   NOW()
            FROM "Customers"
            WHERE "CompanyId" IS NULL;
            """);

        migrationBuilder.CreateIndex(
            name: "IX_Customers_CompanyId",
            table: "Customers",
            column: "CompanyId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "LegacyCustomerOwnershipIssues");
        migrationBuilder.DropIndex(name: "IX_Customers_CompanyId", table: "Customers");
        migrationBuilder.DropColumn(name: "CompanyId", table: "Customers");
    }
}
