using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddSubscriberPackageUpgradeState : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "PendingPackageCode",
            table: "Companies",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "PackageBillingCycleStartUtc",
            table: "Companies",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "PendingPackageCode",
            table: "Companies");

        migrationBuilder.DropColumn(
            name: "PackageBillingCycleStartUtc",
            table: "Companies");
    }
}
