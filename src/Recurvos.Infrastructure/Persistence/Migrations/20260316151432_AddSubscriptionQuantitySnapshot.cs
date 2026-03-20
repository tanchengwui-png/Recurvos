using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionQuantitySnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Quantity",
                table: "Subscriptions",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.Sql("""
                UPDATE "Subscriptions" s
                SET "Quantity" = COALESCE(items."TotalQuantity", 1)
                FROM (
                    SELECT "SubscriptionId", SUM("Quantity") AS "TotalQuantity"
                    FROM "SubscriptionItems"
                    GROUP BY "SubscriptionId"
                ) items
                WHERE s."Id" = items."SubscriptionId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Quantity",
                table: "Subscriptions");
        }
    }
}
