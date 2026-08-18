using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260815110000_AddOptionalDeliveryOrderSources")]
public partial class AddOptionalDeliveryOrderSources : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<Guid>(name: "SalesOrderId", table: "DeliveryOrders", type: "uuid", nullable: true, oldClrType: typeof(Guid), oldType: "uuid");
        migrationBuilder.AlterColumn<Guid>(name: "SalesOrderLineId", table: "DeliveryOrderLines", type: "uuid", nullable: true, oldClrType: typeof(Guid), oldType: "uuid");
        migrationBuilder.AddColumn<Guid>(name: "SalesQuotationId", table: "DeliveryOrders", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<Guid>(name: "SourceQuotationLineId", table: "DeliveryOrderLines", type: "uuid", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_DeliveryOrders_SalesQuotationId", table: "DeliveryOrders", column: "SalesQuotationId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_DeliveryOrders_SalesQuotationId", table: "DeliveryOrders");
        migrationBuilder.DropColumn(name: "SalesQuotationId", table: "DeliveryOrders");
        migrationBuilder.DropColumn(name: "SourceQuotationLineId", table: "DeliveryOrderLines");
        migrationBuilder.AlterColumn<Guid>(name: "SalesOrderId", table: "DeliveryOrders", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.AlterColumn<Guid>(name: "SalesOrderLineId", table: "DeliveryOrderLines", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
    }
}
