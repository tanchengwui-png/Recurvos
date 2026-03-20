using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWhatsAppReminderSettingsAndLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "WhatsAppEnabled" boolean NOT NULL DEFAULT FALSE;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "WhatsAppApiUrl" character varying(500) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "WhatsAppAccessToken" character varying(500) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "WhatsAppSenderId" character varying(100) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ADD COLUMN IF NOT EXISTS "WhatsAppTemplate" character varying(100) NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "PlatformPackages"
                ADD COLUMN IF NOT EXISTS "MaxWhatsAppRemindersPerMonth" integer NOT NULL DEFAULT 0;
                """);

            migrationBuilder.CreateTable(
                name: "WhatsAppNotifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReminderScheduleId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecipientPhoneNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ExternalMessageId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WhatsAppNotifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WhatsAppNotifications_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WhatsAppNotifications_ReminderSchedules_ReminderScheduleId",
                        column: x => x.ReminderScheduleId,
                        principalTable: "ReminderSchedules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppNotifications_CompanyId_CreatedAtUtc",
                table: "WhatsAppNotifications",
                columns: new[] { "CompanyId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppNotifications_InvoiceId",
                table: "WhatsAppNotifications",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppNotifications_ReminderScheduleId",
                table: "WhatsAppNotifications",
                column: "ReminderScheduleId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WhatsAppNotifications");

            migrationBuilder.Sql("""ALTER TABLE "PlatformPackages" DROP COLUMN IF EXISTS "MaxWhatsAppRemindersPerMonth";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "WhatsAppTemplate";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "WhatsAppSenderId";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "WhatsAppAccessToken";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "WhatsAppApiUrl";""");
            migrationBuilder.Sql("""ALTER TABLE company_invoice_settings DROP COLUMN IF EXISTS "WhatsAppEnabled";""");
        }
    }
}
