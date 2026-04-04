using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PreserveReminderHistoryByOffset : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ReminderSchedules_DunningRules_DunningRuleId",
                table: "ReminderSchedules");

            migrationBuilder.DropIndex(
                name: "IX_ReminderSchedules_CompanyId_InvoiceId_DunningRuleId",
                table: "ReminderSchedules");

            migrationBuilder.AlterColumn<Guid>(
                name: "DunningRuleId",
                table: "ReminderSchedules",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<int>(
                name: "OffsetDays",
                table: "ReminderSchedules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ReminderName",
                table: "ReminderSchedules",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE "ReminderSchedules" AS rs
                SET
                    "OffsetDays" = dr."OffsetDays",
                    "ReminderName" = COALESCE(NULLIF(dr."Name", ''), 'Reminder')
                FROM "DunningRules" AS dr
                WHERE rs."DunningRuleId" = dr."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_ReminderSchedules_CompanyId_InvoiceId_OffsetDays",
                table: "ReminderSchedules",
                columns: new[] { "CompanyId", "InvoiceId", "OffsetDays" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ReminderSchedules_DunningRules_DunningRuleId",
                table: "ReminderSchedules",
                column: "DunningRuleId",
                principalTable: "DunningRules",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ReminderSchedules_DunningRules_DunningRuleId",
                table: "ReminderSchedules");

            migrationBuilder.DropIndex(
                name: "IX_ReminderSchedules_CompanyId_InvoiceId_OffsetDays",
                table: "ReminderSchedules");

            migrationBuilder.DropColumn(
                name: "OffsetDays",
                table: "ReminderSchedules");

            migrationBuilder.DropColumn(
                name: "ReminderName",
                table: "ReminderSchedules");

            migrationBuilder.AlterColumn<Guid>(
                name: "DunningRuleId",
                table: "ReminderSchedules",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReminderSchedules_CompanyId_InvoiceId_DunningRuleId",
                table: "ReminderSchedules",
                columns: new[] { "CompanyId", "InvoiceId", "DunningRuleId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ReminderSchedules_DunningRules_DunningRuleId",
                table: "ReminderSchedules",
                column: "DunningRuleId",
                principalTable: "DunningRules",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
