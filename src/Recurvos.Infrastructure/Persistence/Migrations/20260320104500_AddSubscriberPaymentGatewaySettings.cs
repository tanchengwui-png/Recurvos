using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    public partial class AddSubscriberPaymentGatewaySettings : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PaymentGatewayProvider",
                table: "company_invoice_settings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "none");

            migrationBuilder.AddColumn<bool>(
                name: "PaymentGatewayTermsAccepted",
                table: "company_invoice_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaymentGatewayTermsAcceptedAtUtc",
                table: "company_invoice_settings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriberBillplzApiKey",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriberBillplzBaseUrl",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriberBillplzCollectionId",
                table: "company_invoice_settings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SubscriberBillplzRequireSignatureVerification",
                table: "company_invoice_settings",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriberBillplzXSignatureKey",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PaymentGatewayProvider", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "PaymentGatewayTermsAccepted", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "PaymentGatewayTermsAcceptedAtUtc", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "SubscriberBillplzApiKey", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "SubscriberBillplzBaseUrl", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "SubscriberBillplzCollectionId", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "SubscriberBillplzRequireSignatureVerification", table: "company_invoice_settings");
            migrationBuilder.DropColumn(name: "SubscriberBillplzXSignatureKey", table: "company_invoice_settings");
        }
    }
}
