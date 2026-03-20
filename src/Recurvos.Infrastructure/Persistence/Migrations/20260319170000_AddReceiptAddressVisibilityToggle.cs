using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    public partial class AddReceiptAddressVisibilityToggle : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ShowCompanyAddressOnReceipt",
                table: "CompanyInvoiceSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ShowCompanyAddressOnReceipt",
                table: "CompanyInvoiceSettings");
        }
    }
}
