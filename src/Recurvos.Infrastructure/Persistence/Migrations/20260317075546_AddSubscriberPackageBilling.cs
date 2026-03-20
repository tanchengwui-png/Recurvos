using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriberPackageBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Amount",
                table: "PlatformPackages",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "PlatformPackages",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "IntervalCount",
                table: "PlatformPackages",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "IntervalUnit",
                table: "PlatformPackages",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ReceiptPdfPath",
                table: "Payments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SubscriberCompanyId",
                table: "Invoices",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_SubscriberCompanyId_SourceType",
                table: "Invoices",
                columns: new[] { "SubscriberCompanyId", "SourceType" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Invoices_SubscriberCompanyId_SourceType",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "Amount",
                table: "PlatformPackages");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "PlatformPackages");

            migrationBuilder.DropColumn(
                name: "IntervalCount",
                table: "PlatformPackages");

            migrationBuilder.DropColumn(
                name: "IntervalUnit",
                table: "PlatformPackages");

            migrationBuilder.DropColumn(
                name: "ReceiptPdfPath",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "SubscriberCompanyId",
                table: "Invoices");
        }
    }
}
