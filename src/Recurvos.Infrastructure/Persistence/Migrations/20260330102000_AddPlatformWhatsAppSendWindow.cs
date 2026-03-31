using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddPlatformWhatsAppSendWindow : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "WhatsAppSendWindowEndHourUtc",
            table: "company_invoice_settings",
            type: "integer",
            nullable: false,
            defaultValue: 18);

        migrationBuilder.AddColumn<int>(
            name: "WhatsAppSendWindowStartHourUtc",
            table: "company_invoice_settings",
            type: "integer",
            nullable: false,
            defaultValue: 9);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "WhatsAppSendWindowEndHourUtc",
            table: "company_invoice_settings");

        migrationBuilder.DropColumn(
            name: "WhatsAppSendWindowStartHourUtc",
            table: "company_invoice_settings");
    }
}
