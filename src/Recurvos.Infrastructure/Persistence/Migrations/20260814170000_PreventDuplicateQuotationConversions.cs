using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260814170000_PreventDuplicateQuotationConversions")]
public partial class PreventDuplicateQuotationConversions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.CreateIndex(
        name: "IX_SalesOrders_SalesQuotationId",
        table: "SalesOrders",
        column: "SalesQuotationId");

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropIndex(
        name: "IX_SalesOrders_SalesQuotationId",
        table: "SalesOrders");
}
