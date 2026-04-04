using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformStripeGateway : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PlatformPaymentGatewayProvider",
                table: "company_invoice_settings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "billplz");

            migrationBuilder.AddColumn<string>(
                name: "ProductionPlatformPaymentGatewayProvider",
                table: "company_invoice_settings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "billplz");

            migrationBuilder.AddColumn<string>(
                name: "ProductionStripePublishableKey",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProductionStripeSecretKey",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProductionStripeWebhookSecret",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripePublishableKey",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeSecretKey",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeWebhookSecret",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PlatformPaymentGatewayProvider",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "ProductionPlatformPaymentGatewayProvider",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "ProductionStripePublishableKey",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "ProductionStripeSecretKey",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "ProductionStripeWebhookSecret",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "StripePublishableKey",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "StripeSecretKey",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "StripeWebhookSecret",
                table: "company_invoice_settings");
        }
    }
}
