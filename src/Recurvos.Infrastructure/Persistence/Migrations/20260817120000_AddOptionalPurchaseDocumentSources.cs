using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260817120000_AddOptionalPurchaseDocumentSources")]
public partial class AddOptionalPurchaseDocumentSources : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<Guid>(name: "PurchaseOrderId", table: "GoodsReceivedNotes", type: "uuid", nullable: true, oldClrType: typeof(Guid), oldType: "uuid");
        migrationBuilder.AlterColumn<Guid>(name: "CreatedFromDocumentId", table: "GoodsReceivedNotes", type: "uuid", nullable: true, oldClrType: typeof(Guid), oldType: "uuid");
        migrationBuilder.AlterColumn<Guid>(name: "PurchaseOrderLineId", table: "GoodsReceivedNoteLines", type: "uuid", nullable: true, oldClrType: typeof(Guid), oldType: "uuid");
        migrationBuilder.AlterColumn<Guid>(name: "CreatedFromDocumentId", table: "PurchaseBills", type: "uuid", nullable: true, oldClrType: typeof(Guid), oldType: "uuid");
        migrationBuilder.Sql("ALTER TABLE \"PurchaseBillLines\" DROP CONSTRAINT IF EXISTS \"CK_PurchaseBillLine_SourceReference\";");
        migrationBuilder.AddCheckConstraint(name: "CK_PurchaseBillLine_SourceReference", table: "PurchaseBillLines", sql: "(CASE WHEN \"PurchaseOrderLineId\" IS NULL THEN 0 ELSE 1 END + CASE WHEN \"GoodsReceivedNoteLineId\" IS NULL THEN 0 ELSE 1 END) <= 1");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE \"PurchaseBillLines\" DROP CONSTRAINT IF EXISTS \"CK_PurchaseBillLine_SourceReference\";");
        migrationBuilder.AddCheckConstraint(name: "CK_PurchaseBillLine_SourceReference", table: "PurchaseBillLines", sql: "(CASE WHEN \"PurchaseOrderLineId\" IS NULL THEN 0 ELSE 1 END + CASE WHEN \"GoodsReceivedNoteLineId\" IS NULL THEN 0 ELSE 1 END) >= 1");
        migrationBuilder.AlterColumn<Guid>(name: "PurchaseOrderId", table: "GoodsReceivedNotes", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.AlterColumn<Guid>(name: "CreatedFromDocumentId", table: "GoodsReceivedNotes", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.AlterColumn<Guid>(name: "PurchaseOrderLineId", table: "GoodsReceivedNoteLines", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.AlterColumn<Guid>(name: "CreatedFromDocumentId", table: "PurchaseBills", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
    }
}
