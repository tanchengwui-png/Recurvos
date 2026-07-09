using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddCompanyAddresses : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS company_addresses (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
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
            CREATE INDEX IF NOT EXISTS "IX_company_addresses_CompanyId" ON company_addresses ("CompanyId");
            ALTER TABLE "Invoices" ADD COLUMN IF NOT EXISTS "CompanyAddressSnapshot" character varying(2000) NULL;
            """);

        migrationBuilder.Sql("""
            UPDATE "Invoices"
            SET "CompanyAddressSnapshot" = "Companies"."Address"
            FROM "Companies"
            WHERE "Invoices"."CompanyId" = "Companies"."Id"
              AND "Invoices"."CompanyAddressSnapshot" IS NULL
              AND COALESCE(TRIM("Companies"."Address"), '') <> '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "Invoices" DROP COLUMN IF EXISTS "CompanyAddressSnapshot";
            DROP TABLE IF EXISTS company_addresses;
            """);
    }
}
