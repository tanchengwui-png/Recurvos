using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveCustomerCompanyBinding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Customers_Companies_CompanyId",
                table: "Customers");

            migrationBuilder.RenameColumn(
                name: "CompanyId",
                table: "Customers",
                newName: "SubscriberId");

            migrationBuilder.RenameIndex(
                name: "IX_Customers_CompanyId",
                table: "Customers",
                newName: "IX_Customers_SubscriberId");

            migrationBuilder.Sql("""
                UPDATE "Customers" c
                SET "SubscriberId" = co."SubscriberId"
                FROM "Companies" co
                WHERE c."SubscriberId" = co."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "SubscriberId",
                table: "Customers",
                newName: "CompanyId");

            migrationBuilder.RenameIndex(
                name: "IX_Customers_SubscriberId",
                table: "Customers",
                newName: "IX_Customers_CompanyId");

            migrationBuilder.AddForeignKey(
                name: "FK_Customers_Companies_CompanyId",
                table: "Customers",
                column: "CompanyId",
                principalTable: "Companies",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
