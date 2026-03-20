using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyInvoiceSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "company_invoice_settings",
                columns: table => new
                {
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Prefix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    NextNumber = table.Column<int>(type: "integer", nullable: false),
                    Padding = table.Column<int>(type: "integer", nullable: false),
                    ResetYearly = table.Column<bool>(type: "boolean", nullable: false),
                    LastResetYear = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_company_invoice_settings", x => x.CompanyId);
                    table.ForeignKey(
                        name: "FK_company_invoice_settings_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql(
                """
                INSERT INTO company_invoice_settings ("CompanyId", "Prefix", "NextNumber", "Padding", "ResetYearly", "LastResetYear")
                SELECT "Id", 'INV-', CASE WHEN "InvoiceSequence" > 0 THEN "InvoiceSequence" ELSE 1001 END, 6, FALSE, NULL
                FROM "Companies"
                WHERE NOT EXISTS (
                    SELECT 1 FROM company_invoice_settings s WHERE s."CompanyId" = "Companies"."Id"
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "company_invoice_settings");
        }
    }
}
