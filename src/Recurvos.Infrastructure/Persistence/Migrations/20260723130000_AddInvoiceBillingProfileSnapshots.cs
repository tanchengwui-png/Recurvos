using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddInvoiceBillingProfileSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "BillingAddressSnapshot", table: "Invoices", type: "character varying(2000)", maxLength: 2000, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingContactNameSnapshot", table: "Invoices", type: "character varying(200)", maxLength: 200, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingEmailSnapshot", table: "Invoices", type: "character varying(200)", maxLength: 200, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingPhoneSnapshot", table: "Invoices", type: "character varying(50)", maxLength: 50, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingTaxIdNumberSnapshot", table: "Invoices", type: "character varying(100)", maxLength: 100, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingTaxIdTypeSnapshot", table: "Invoices", type: "character varying(50)", maxLength: 50, nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "BillingProfileSnapshotAtUtc", table: "Invoices", type: "timestamp with time zone", nullable: true);

        migrationBuilder.Sql("""
            UPDATE "Invoices" AS invoice
            SET "BillingContactNameSnapshot" = customer."Name",
                "BillingEmailSnapshot" = customer."Email",
                "BillingPhoneSnapshot" = customer."PhoneNumber",
                "BillingAddressSnapshot" = customer."BillingAddress",
                "BillingProfileSnapshotAtUtc" = invoice."IssueDateUtc"
            FROM "Customers" AS customer
            WHERE invoice."CustomerId" = customer."Id"
              AND invoice."SourceType" = 3
              AND invoice."BillingProfileSnapshotAtUtc" IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "BillingAddressSnapshot", table: "Invoices");
        migrationBuilder.DropColumn(name: "BillingContactNameSnapshot", table: "Invoices");
        migrationBuilder.DropColumn(name: "BillingEmailSnapshot", table: "Invoices");
        migrationBuilder.DropColumn(name: "BillingPhoneSnapshot", table: "Invoices");
        migrationBuilder.DropColumn(name: "BillingTaxIdNumberSnapshot", table: "Invoices");
        migrationBuilder.DropColumn(name: "BillingTaxIdTypeSnapshot", table: "Invoices");
        migrationBuilder.DropColumn(name: "BillingProfileSnapshotAtUtc", table: "Invoices");
    }
}
