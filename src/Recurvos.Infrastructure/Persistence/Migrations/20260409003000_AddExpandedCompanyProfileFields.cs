using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddExpandedCompanyProfileFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        AddColumnIfNotExists(migrationBuilder, "Companies", "LegalName", "character varying(200) NULL");
        AddColumnIfNotExists(migrationBuilder, "Companies", "RegistrationNumberType", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "Companies", "OldRegistrationNumber", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "Companies", "Tin", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "Companies", "MsicCode", "character varying(50) NULL");
        AddColumnIfNotExists(migrationBuilder, "Companies", "TourismTaxRegistrationNumber", "character varying(100) NULL");
        AddColumnIfNotExists(migrationBuilder, "Companies", "HomeCountry", "character varying(100) NULL");

        migrationBuilder.Sql("""
            UPDATE "Companies"
            SET "LegalName" = COALESCE(NULLIF(TRIM("Name"), ''), "LegalName")
            WHERE "LegalName" IS NULL OR TRIM("LegalName") = '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        DropColumnIfExists(migrationBuilder, "Companies", "HomeCountry");
        DropColumnIfExists(migrationBuilder, "Companies", "TourismTaxRegistrationNumber");
        DropColumnIfExists(migrationBuilder, "Companies", "MsicCode");
        DropColumnIfExists(migrationBuilder, "Companies", "Tin");
        DropColumnIfExists(migrationBuilder, "Companies", "OldRegistrationNumber");
        DropColumnIfExists(migrationBuilder, "Companies", "RegistrationNumberType");
        DropColumnIfExists(migrationBuilder, "Companies", "LegalName");
    }

    private static void AddColumnIfNotExists(MigrationBuilder migrationBuilder, string tableName, string columnName, string definition)
    {
        migrationBuilder.Sql($$"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
            WHERE table_name = '{{tableName}}'
              AND column_name = '{{columnName}}'
                ) THEN
                    EXECUTE 'ALTER TABLE "{{tableName}}" ADD COLUMN "{{columnName}}" {{definition}}';
                END IF;
            END
            $$;
            """);
    }

    private static void DropColumnIfExists(MigrationBuilder migrationBuilder, string tableName, string columnName)
    {
        migrationBuilder.Sql($$"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
            WHERE table_name = '{{tableName}}'
                      AND column_name = '{{columnName}}'
                ) THEN
                    EXECUTE 'ALTER TABLE "{{tableName}}" DROP COLUMN "{{columnName}}"';
                END IF;
            END
            $$;
            """);
    }
}
