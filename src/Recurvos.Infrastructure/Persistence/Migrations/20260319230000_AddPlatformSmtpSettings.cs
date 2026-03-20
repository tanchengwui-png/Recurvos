using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformSmtpSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SmtpFromEmail",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpFromName",
                table: "company_invoice_settings",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpHost",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpPassword",
                table: "company_invoice_settings",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SmtpPort",
                table: "company_invoice_settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SmtpUseSsl",
                table: "company_invoice_settings",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpUsername",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SmtpFromEmail",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "SmtpFromName",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "SmtpHost",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "SmtpPassword",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "SmtpPort",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "SmtpUseSsl",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "SmtpUsername",
                table: "company_invoice_settings");
        }
    }
}
