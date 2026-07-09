using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddCompanyAddressBillingShippingDefaults : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE company_addresses ADD COLUMN IF NOT EXISTS "IsDefaultBilling" boolean NOT NULL DEFAULT FALSE;
            ALTER TABLE company_addresses ADD COLUMN IF NOT EXISTS "IsDefaultShipping" boolean NOT NULL DEFAULT FALSE;

            UPDATE company_addresses
            SET "IsDefaultBilling" = COALESCE("IsDefaultBilling", FALSE) OR COALESCE("IsDefault", FALSE),
                "IsDefaultShipping" = COALESCE("IsDefaultShipping", FALSE) OR COALESCE("IsDefault", FALSE);

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
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE company_addresses DROP COLUMN IF EXISTS "IsDefaultShipping";
            ALTER TABLE company_addresses DROP COLUMN IF EXISTS "IsDefaultBilling";
            """);
    }
}
