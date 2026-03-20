using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceLifecycleFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PeriodEndUtc",
                table: "Invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PeriodStartUtc",
                table: "Invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SourceType",
                table: "Invoices",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.Sql("""
                UPDATE "Invoices"
                SET "SourceType" = CASE
                    WHEN "SubscriptionId" IS NOT NULL THEN 2
                    ELSE 1
                END,
                "PeriodStartUtc" = COALESCE("PeriodStartUtc", "IssueDateUtc"),
                "PeriodEndUtc" = COALESCE("PeriodEndUtc", "DueDateUtc");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PeriodEndUtc",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "PeriodStartUtc",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "SourceType",
                table: "Invoices");
        }
    }
}
