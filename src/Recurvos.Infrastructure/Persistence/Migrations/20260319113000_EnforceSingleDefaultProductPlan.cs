using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnforceSingleDefaultProductPlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE product_plans target
                SET "IsDefault" = FALSE
                FROM (
                    SELECT "ProductId", "Id"
                    FROM (
                        SELECT
                            "ProductId",
                            "Id",
                            ROW_NUMBER() OVER (
                                PARTITION BY "ProductId"
                                ORDER BY
                                    CASE WHEN "IsActive" THEN 0 ELSE 1 END,
                                    "SortOrder",
                                    "CreatedAtUtc",
                                    "Id"
                            ) AS row_number
                        FROM product_plans
                        WHERE "IsDefault" = TRUE
                    ) ranked
                    WHERE ranked.row_number > 1
                ) duplicates
                WHERE target."Id" = duplicates."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_product_plans_ProductId_IsDefault_True",
                table: "product_plans",
                columns: new[] { "ProductId", "IsDefault" },
                unique: true,
                filter: "\"IsDefault\" = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_product_plans_ProductId_IsDefault_True",
                table: "product_plans");
        }
    }
}
