using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformUploadPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AutoCompressUploads",
                table: "CompanyInvoiceSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "UploadImageMaxDimension",
                table: "CompanyInvoiceSettings",
                type: "integer",
                nullable: false,
                defaultValue: 1600);

            migrationBuilder.AddColumn<int>(
                name: "UploadImageQuality",
                table: "CompanyInvoiceSettings",
                type: "integer",
                nullable: false,
                defaultValue: 80);

            migrationBuilder.AddColumn<int>(
                name: "UploadMaxBytes",
                table: "CompanyInvoiceSettings",
                type: "integer",
                nullable: false,
                defaultValue: 2000000);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AutoCompressUploads",
                table: "CompanyInvoiceSettings");

            migrationBuilder.DropColumn(
                name: "UploadImageMaxDimension",
                table: "CompanyInvoiceSettings");

            migrationBuilder.DropColumn(
                name: "UploadImageQuality",
                table: "CompanyInvoiceSettings");

            migrationBuilder.DropColumn(
                name: "UploadMaxBytes",
                table: "CompanyInvoiceSettings");
        }
    }
}
