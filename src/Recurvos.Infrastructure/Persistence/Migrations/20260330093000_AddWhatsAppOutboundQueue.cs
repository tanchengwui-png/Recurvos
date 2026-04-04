using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddWhatsAppOutboundQueue : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "WhatsAppOutboundQueues",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                ReminderScheduleId = table.Column<Guid>(type: "uuid", nullable: true),
                RecipientPhoneNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                Message = table.Column<string>(type: "text", nullable: false),
                Template = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                Reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                NotBeforeUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                AttemptCount = table.Column<int>(type: "integer", nullable: false),
                LastAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                ExternalMessageId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                ErrorMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_WhatsAppOutboundQueues", x => x.Id);
                table.ForeignKey(
                    name: "FK_WhatsAppOutboundQueues_Invoices_InvoiceId",
                    column: x => x.InvoiceId,
                    principalTable: "Invoices",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_WhatsAppOutboundQueues_ReminderSchedules_ReminderScheduleId",
                    column: x => x.ReminderScheduleId,
                    principalTable: "ReminderSchedules",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateIndex(
            name: "IX_WhatsAppOutboundQueues_CompanyId_Status_NextAttemptAtUtc",
            table: "WhatsAppOutboundQueues",
            columns: new[] { "CompanyId", "Status", "NextAttemptAtUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_WhatsAppOutboundQueues_CompanyId_Status_NotBeforeUtc",
            table: "WhatsAppOutboundQueues",
            columns: new[] { "CompanyId", "Status", "NotBeforeUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_WhatsAppOutboundQueues_InvoiceId",
            table: "WhatsAppOutboundQueues",
            column: "InvoiceId");

        migrationBuilder.CreateIndex(
            name: "IX_WhatsAppOutboundQueues_ReminderScheduleId",
            table: "WhatsAppOutboundQueues",
            column: "ReminderScheduleId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "WhatsAppOutboundQueues");
    }
}
