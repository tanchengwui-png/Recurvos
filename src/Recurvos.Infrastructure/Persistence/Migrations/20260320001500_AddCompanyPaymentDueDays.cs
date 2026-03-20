using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddCompanyPaymentDueDays : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "PaymentDueDays",
            table: "company_invoice_settings",
            type: "integer",
            nullable: false,
            defaultValue: 7);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "PaymentDueDays",
            table: "company_invoice_settings");
    }
}
