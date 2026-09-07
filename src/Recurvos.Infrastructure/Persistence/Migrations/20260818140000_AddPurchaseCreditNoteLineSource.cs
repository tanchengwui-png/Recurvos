using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260818140000_AddPurchaseCreditNoteLineSource")]
public partial class AddPurchaseCreditNoteLineSource : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "PurchaseBillLineId", table: "PurchaseCreditNoteLines", type: "uuid", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_PurchaseCreditNoteLines_PurchaseBillLineId", table: "PurchaseCreditNoteLines", column: "PurchaseBillLineId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_PurchaseCreditNoteLines_PurchaseBillLineId", table: "PurchaseCreditNoteLines");
        migrationBuilder.DropColumn(name: "PurchaseBillLineId", table: "PurchaseCreditNoteLines");
    }
}
