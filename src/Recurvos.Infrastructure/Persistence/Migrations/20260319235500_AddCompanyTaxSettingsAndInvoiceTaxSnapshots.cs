using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddCompanyTaxSettingsAndInvoiceTaxSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "IsTaxEnabled",
            table: "company_invoice_settings",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "TaxName",
            table: "company_invoice_settings",
            type: "character varying(50)",
            maxLength: 50,
            nullable: false,
            defaultValue: "SST");

        migrationBuilder.AddColumn<decimal>(
            name: "TaxRate",
            table: "company_invoice_settings",
            type: "numeric(5,2)",
            precision: 5,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "TaxRegistrationNo",
            table: "company_invoice_settings",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "TaxAmount",
            table: "Invoices",
            type: "numeric(18,2)",
            precision: 18,
            scale: 2,
            nullable: false,
            defaultValue: 0m);

        migrationBuilder.AddColumn<bool>(
            name: "IsTaxEnabled",
            table: "Invoices",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "TaxName",
            table: "Invoices",
            type: "character varying(50)",
            maxLength: 50,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "TaxRate",
            table: "Invoices",
            type: "numeric(5,2)",
            precision: 5,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "TaxRegistrationNo",
            table: "Invoices",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "IsTaxEnabled", table: "company_invoice_settings");
        migrationBuilder.DropColumn(name: "TaxName", table: "company_invoice_settings");
        migrationBuilder.DropColumn(name: "TaxRate", table: "company_invoice_settings");
        migrationBuilder.DropColumn(name: "TaxRegistrationNo", table: "company_invoice_settings");

        migrationBuilder.DropColumn(name: "TaxAmount", table: "Invoices");
        migrationBuilder.DropColumn(name: "IsTaxEnabled", table: "Invoices");
        migrationBuilder.DropColumn(name: "TaxName", table: "Invoices");
        migrationBuilder.DropColumn(name: "TaxRate", table: "Invoices");
        migrationBuilder.DropColumn(name: "TaxRegistrationNo", table: "Invoices");
    }
}
