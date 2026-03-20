using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddReceiptNumberingSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ReceiptPrefix",
            table: "CompanyInvoiceSettings",
            type: "character varying(20)",
            maxLength: 20,
            nullable: false,
            defaultValue: "RCT");

        migrationBuilder.AddColumn<int>(
            name: "ReceiptNextNumber",
            table: "CompanyInvoiceSettings",
            type: "integer",
            nullable: false,
            defaultValue: 1);

        migrationBuilder.AddColumn<int>(
            name: "ReceiptPadding",
            table: "CompanyInvoiceSettings",
            type: "integer",
            nullable: false,
            defaultValue: 6);

        migrationBuilder.AddColumn<bool>(
            name: "ReceiptResetYearly",
            table: "CompanyInvoiceSettings",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<int>(
            name: "ReceiptLastResetYear",
            table: "CompanyInvoiceSettings",
            type: "integer",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "ReceiptPrefix",
            table: "CompanyInvoiceSettings");

        migrationBuilder.DropColumn(
            name: "ReceiptNextNumber",
            table: "CompanyInvoiceSettings");

        migrationBuilder.DropColumn(
            name: "ReceiptPadding",
            table: "CompanyInvoiceSettings");

        migrationBuilder.DropColumn(
            name: "ReceiptResetYearly",
            table: "CompanyInvoiceSettings");

        migrationBuilder.DropColumn(
            name: "ReceiptLastResetYear",
            table: "CompanyInvoiceSettings");
    }
}
