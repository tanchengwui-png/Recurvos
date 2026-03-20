using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class ExpandCompanyPackageStatusLength : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "PackageStatus",
            table: "Companies",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(20)",
            oldMaxLength: 20,
            oldNullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "PackageStatus",
            table: "Companies",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(40)",
            oldMaxLength: 40,
            oldNullable: true);
    }
}
