using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddPlatformWhatsAppProviderAndSessionState : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "WhatsAppProvider",
            table: "company_invoice_settings",
            type: "character varying(50)",
            maxLength: 50,
            nullable: false,
            defaultValue: "generic_api");

        migrationBuilder.AddColumn<string>(
            name: "WhatsAppSessionStatus",
            table: "company_invoice_settings",
            type: "character varying(50)",
            maxLength: 50,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "WhatsAppSessionPhone",
            table: "company_invoice_settings",
            type: "character varying(50)",
            maxLength: 50,
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "WhatsAppSessionLastSyncedAtUtc",
            table: "company_invoice_settings",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "WhatsAppProvider", table: "company_invoice_settings");
        migrationBuilder.DropColumn(name: "WhatsAppSessionStatus", table: "company_invoice_settings");
        migrationBuilder.DropColumn(name: "WhatsAppSessionPhone", table: "company_invoice_settings");
        migrationBuilder.DropColumn(name: "WhatsAppSessionLastSyncedAtUtc", table: "company_invoice_settings");
    }
}
