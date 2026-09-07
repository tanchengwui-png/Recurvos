using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260818150000_AddSalesPaymentAllocations")]
public partial class AddSalesPaymentAllocations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(name: "SalesPaymentAllocations", columns: table => new { Id = table.Column<Guid>(type: "uuid", nullable: false), PaymentId = table.Column<Guid>(type: "uuid", nullable: false), InvoiceId = table.Column<Guid>(type: "uuid", nullable: false), Amount = table.Column<decimal>(type: "numeric(18,2)", nullable: false), CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false), UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true) }, constraints: table => { table.PrimaryKey("PK_SalesPaymentAllocations", x => x.Id); table.ForeignKey("FK_SalesPaymentAllocations_Payments_PaymentId", x => x.PaymentId, "Payments", "Id", onDelete: ReferentialAction.Cascade); table.ForeignKey("FK_SalesPaymentAllocations_Invoices_InvoiceId", x => x.InvoiceId, "Invoices", "Id", onDelete: ReferentialAction.Restrict); });
        migrationBuilder.CreateIndex(name: "IX_SalesPaymentAllocations_InvoiceId", table: "SalesPaymentAllocations", column: "InvoiceId");
        migrationBuilder.CreateIndex(name: "IX_SalesPaymentAllocations_PaymentId_InvoiceId", table: "SalesPaymentAllocations", columns: new[] { "PaymentId", "InvoiceId" }, unique: true);
        migrationBuilder.Sql("INSERT INTO \"SalesPaymentAllocations\" (\"Id\", \"PaymentId\", \"InvoiceId\", \"Amount\", \"CreatedAtUtc\") SELECT gen_random_uuid(), \"Id\", \"InvoiceId\", \"Amount\", \"CreatedAtUtc\" FROM \"Payments\" WHERE NOT EXISTS (SELECT 1 FROM \"SalesPaymentAllocations\" allocation WHERE allocation.\"PaymentId\" = \"Payments\".\"Id\");");
    }
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable(name: "SalesPaymentAllocations");
}
