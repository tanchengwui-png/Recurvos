using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentConfirmations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PaymentConfirmationTokenHash",
                table: "Invoices",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaymentConfirmationTokenIssuedAtUtc",
                table: "Invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PaymentConfirmationSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PayerName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PaidAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TransactionReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ProofFilePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ProofFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ProofContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentConfirmationSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentConfirmationSubmissions_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_PaymentConfirmationTokenHash",
                table: "Invoices",
                column: "PaymentConfirmationTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentConfirmationSubmissions_CompanyId_InvoiceId_Status",
                table: "PaymentConfirmationSubmissions",
                columns: new[] { "CompanyId", "InvoiceId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentConfirmationSubmissions_InvoiceId",
                table: "PaymentConfirmationSubmissions",
                column: "InvoiceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentConfirmationSubmissions");

            migrationBuilder.DropIndex(
                name: "IX_Invoices_PaymentConfirmationTokenHash",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "PaymentConfirmationTokenHash",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "PaymentConfirmationTokenIssuedAtUtc",
                table: "Invoices");
        }
    }
}
