using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPackageGracePeriod : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "GracePeriodDays",
                table: "PlatformPackages",
                type: "integer",
                nullable: false,
                defaultValue: 7);

            migrationBuilder.AddColumn<DateTime>(
                name: "PackageGracePeriodEndsAtUtc",
                table: "Companies",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GracePeriodDays",
                table: "PlatformPackages");

            migrationBuilder.DropColumn(
                name: "PackageGracePeriodEndsAtUtc",
                table: "Companies");
        }
    }
}
