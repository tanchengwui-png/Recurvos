using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCreditNoteDocumentNumbering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreditNoteNumber",
                table: "CreditNotes",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PdfPath",
                table: "CreditNotes",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CreditNoteLastResetYear",
                table: "company_invoice_settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CreditNoteNextNumber",
                table: "company_invoice_settings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "CreditNotePadding",
                table: "company_invoice_settings",
                type: "integer",
                nullable: false,
                defaultValue: 6);

            migrationBuilder.AddColumn<string>(
                name: "CreditNotePrefix",
                table: "company_invoice_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "CN");

            migrationBuilder.AddColumn<bool>(
                name: "CreditNoteResetYearly",
                table: "company_invoice_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql("""
                UPDATE "CreditNotes" AS cn
                SET "CreditNoteNumber" = generated."CreditNoteNumber"
                FROM (
                    SELECT
                        "Id",
                        CONCAT(
                            'CN-',
                            TO_CHAR(COALESCE("IssuedAtUtc", "CreatedAtUtc"), 'YYYY'),
                            '-',
                            LPAD(
                                ROW_NUMBER() OVER (
                                    PARTITION BY "CompanyId"
                                    ORDER BY COALESCE("IssuedAtUtc", "CreatedAtUtc"), "CreatedAtUtc", "Id"
                                )::text,
                                6,
                                '0'
                            )
                        ) AS "CreditNoteNumber"
                    FROM "CreditNotes"
                ) AS generated
                WHERE cn."Id" = generated."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_CreditNotes_CompanyId_CreditNoteNumber",
                table: "CreditNotes",
                columns: new[] { "CompanyId", "CreditNoteNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CreditNotes_CompanyId_CreditNoteNumber",
                table: "CreditNotes");

            migrationBuilder.DropColumn(
                name: "CreditNoteNumber",
                table: "CreditNotes");

            migrationBuilder.DropColumn(
                name: "PdfPath",
                table: "CreditNotes");

            migrationBuilder.DropColumn(
                name: "CreditNoteLastResetYear",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "CreditNoteNextNumber",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "CreditNotePadding",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "CreditNotePrefix",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "CreditNoteResetYearly",
                table: "company_invoice_settings");
        }
    }
}
