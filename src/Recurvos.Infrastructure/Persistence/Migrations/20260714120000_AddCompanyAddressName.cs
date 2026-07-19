using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddCompanyAddressName : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE company_addresses
            ADD COLUMN IF NOT EXISTS "AddressName" character varying(120) NOT NULL DEFAULT 'Primary';
            """);

        migrationBuilder.Sql("""
            WITH numbered_addresses AS (
                SELECT "Id",
                       ROW_NUMBER() OVER (PARTITION BY "CompanyId" ORDER BY "CreatedAtUtc", "Id") AS row_number
                FROM company_addresses
                WHERE COALESCE(TRIM("AddressName"), '') = ''
                   OR "AddressName" = 'Primary'
            )
            UPDATE company_addresses addresses
            SET "AddressName" = CASE
                WHEN numbered_addresses.row_number = 1 THEN 'Primary'
                ELSE 'Address ' || numbered_addresses.row_number::text
            END
            FROM numbered_addresses
            WHERE addresses."Id" = numbered_addresses."Id";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE company_addresses
            DROP COLUMN IF EXISTS "AddressName";
            """);
    }
}
