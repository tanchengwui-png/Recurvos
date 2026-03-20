using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriberOwnedCompanies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "Companies",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "Companies",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "SubscriberId",
                table: "Companies",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Companies" c
                SET "SubscriberId" = u."Id"
                FROM "Users" u
                WHERE u."CompanyId" = c."Id"
                  AND c."SubscriberId" IS NULL
                  AND u."IsOwner" = TRUE;
                """);

            migrationBuilder.Sql("""
                UPDATE "Companies" c
                SET "SubscriberId" = u."Id"
                FROM "Users" u
                WHERE u."CompanyId" = c."Id"
                  AND c."SubscriberId" IS NULL;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "SubscriberId",
                table: "Companies",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_CompanyId",
                table: "Subscriptions",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_Companies_SubscriberId",
                table: "Companies",
                column: "SubscriberId");

            migrationBuilder.AddForeignKey(
                name: "FK_Companies_Users_SubscriberId",
                table: "Companies",
                column: "SubscriberId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Subscriptions_Companies_CompanyId",
                table: "Subscriptions",
                column: "CompanyId",
                principalTable: "Companies",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Companies_Users_SubscriberId",
                table: "Companies");

            migrationBuilder.DropForeignKey(
                name: "FK_Subscriptions_Companies_CompanyId",
                table: "Subscriptions");

            migrationBuilder.DropIndex(
                name: "IX_Subscriptions_CompanyId",
                table: "Subscriptions");

            migrationBuilder.DropIndex(
                name: "IX_Companies_SubscriberId",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "Address",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SubscriberId",
                table: "Companies");
        }
    }
}
