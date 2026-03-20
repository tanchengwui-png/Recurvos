using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionItemBillingLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<decimal>(
                name: "UnitAmount",
                table: "SubscriptionItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            migrationBuilder.AddColumn<bool>(
                name: "AutoRenew",
                table: "SubscriptionItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "BillingType",
                table: "SubscriptionItems",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Recurring");

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "SubscriptionItems",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "MYR");

            migrationBuilder.AddColumn<DateTime>(
                name: "CurrentPeriodEndUtc",
                table: "SubscriptionItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CurrentPeriodStartUtc",
                table: "SubscriptionItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EndedAtUtc",
                table: "SubscriptionItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "IntervalCount",
                table: "SubscriptionItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "IntervalUnit",
                table: "SubscriptionItems",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.AddColumn<DateTime>(
                name: "NextBillingUtc",
                table: "SubscriptionItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TrialEndUtc",
                table: "SubscriptionItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TrialStartUtc",
                table: "SubscriptionItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE "SubscriptionItems" AS si
                SET
                    "AutoRenew" = s."AutoRenew",
                    "BillingType" = 'Recurring',
                    "Currency" = COALESCE(NULLIF(s."Currency", ''), 'MYR'),
                    "CurrentPeriodStartUtc" = s."CurrentPeriodStartUtc",
                    "CurrentPeriodEndUtc" = s."CurrentPeriodEndUtc",
                    "EndedAtUtc" = s."EndedAtUtc",
                    "IntervalCount" = s."IntervalCount",
                    "IntervalUnit" = s."IntervalUnit",
                    "NextBillingUtc" = s."NextBillingUtc",
                    "TrialStartUtc" = s."TrialStartUtc",
                    "TrialEndUtc" = s."TrialEndUtc"
                FROM "Subscriptions" AS s
                WHERE s."Id" = si."SubscriptionId";
                """);

            migrationBuilder.AddColumn<Guid>(
                name: "SubscriptionItemId",
                table: "InvoiceLineItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLineItems_SubscriptionItemId",
                table: "InvoiceLineItems",
                column: "SubscriptionItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_InvoiceLineItems_SubscriptionItems_SubscriptionItemId",
                table: "InvoiceLineItems",
                column: "SubscriptionItemId",
                principalTable: "SubscriptionItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InvoiceLineItems_SubscriptionItems_SubscriptionItemId",
                table: "InvoiceLineItems");

            migrationBuilder.DropIndex(
                name: "IX_InvoiceLineItems_SubscriptionItemId",
                table: "InvoiceLineItems");

            migrationBuilder.DropColumn(
                name: "AutoRenew",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "BillingType",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "CurrentPeriodEndUtc",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "CurrentPeriodStartUtc",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "EndedAtUtc",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "IntervalCount",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "IntervalUnit",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "NextBillingUtc",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "TrialEndUtc",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "TrialStartUtc",
                table: "SubscriptionItems");

            migrationBuilder.DropColumn(
                name: "SubscriptionItemId",
                table: "InvoiceLineItems");

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitAmount",
                table: "SubscriptionItems",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);
        }
    }
}
