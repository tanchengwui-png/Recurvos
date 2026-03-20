using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionLifecycleSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "CancelAtUtc",
                table: "Subscriptions",
                newName: "CanceledAtUtc");

            migrationBuilder.Sql("""
                UPDATE "Subscriptions"
                SET "UpdatedAtUtc" = COALESCE("UpdatedAtUtc", "CreatedAtUtc", NOW());
                """);

            migrationBuilder.AlterColumn<DateTime>(
                name: "UpdatedAtUtc",
                table: "Subscriptions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Notes",
                table: "Subscriptions",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<bool>(
                name: "AutoRenew",
                table: "Subscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EndedAtUtc",
                table: "Subscriptions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "Subscriptions",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "MYR");

            migrationBuilder.AddColumn<int>(
                name: "IntervalCount",
                table: "Subscriptions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "IntervalUnit",
                table: "Subscriptions",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                table: "Subscriptions",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql("""
                UPDATE "Subscriptions" s
                SET
                    "UnitPrice" = COALESCE(si."UnitAmount", 0),
                    "Currency" = COALESCE(pp."Currency", 'MYR'),
                    "IntervalUnit" = COALESCE(pp."IntervalUnit", 'None'),
                    "IntervalCount" = COALESCE(pp."IntervalCount", 0),
                    "AutoRenew" = CASE WHEN COALESCE(pp."IntervalUnit", 'None') = 'None' THEN FALSE ELSE TRUE END
                FROM "SubscriptionItems" si
                LEFT JOIN "product_plans" pp ON pp."Id" = si."ProductPlanId"
                WHERE si."SubscriptionId" = s."Id"
                  AND si."Id" = (
                      SELECT si2."Id"
                      FROM "SubscriptionItems" si2
                      WHERE si2."SubscriptionId" = s."Id"
                      ORDER BY si2."CreatedAtUtc"
                      LIMIT 1
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AutoRenew",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "EndedAtUtc",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "IntervalCount",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "IntervalUnit",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                table: "Subscriptions");

            migrationBuilder.RenameColumn(
                name: "CanceledAtUtc",
                table: "Subscriptions",
                newName: "CancelAtUtc");

            migrationBuilder.AlterColumn<DateTime>(
                name: "UpdatedAtUtc",
                table: "Subscriptions",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone");

            migrationBuilder.AlterColumn<string>(
                name: "Notes",
                table: "Subscriptions",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(1000)",
                oldMaxLength: 1000,
                oldNullable: true);
        }
    }
}
