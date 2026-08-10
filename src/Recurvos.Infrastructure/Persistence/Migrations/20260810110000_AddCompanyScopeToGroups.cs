using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260810110000_AddCompanyScopeToGroups")]
public partial class AddCompanyScopeToGroups : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "CompanyId", table: "ContactGroups", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<Guid>(name: "CompanyId", table: "ProductGroups", type: "uuid", nullable: true);

        // Legacy groups were subscriber-owned. Assign them to the subscriber's
        // oldest workspace; records with no workspace are retained against the
        // platform workspace rather than being deleted.
        migrationBuilder.Sql("""
            UPDATE "ContactGroups" g SET "CompanyId" = COALESCE(
                (SELECT c."Id" FROM "Companies" c WHERE c."SubscriberId" = g."SubscriberId" ORDER BY c."CreatedAtUtc" LIMIT 1),
                (SELECT c."Id" FROM "Companies" c WHERE c."IsPlatformAccount" ORDER BY c."CreatedAtUtc" LIMIT 1));
            UPDATE "ProductGroups" g SET "CompanyId" = COALESCE(
                (SELECT c."Id" FROM "Companies" c WHERE c."SubscriberId" = g."SubscriberId" ORDER BY c."CreatedAtUtc" LIMIT 1),
                (SELECT c."Id" FROM "Companies" c WHERE c."IsPlatformAccount" ORDER BY c."CreatedAtUtc" LIMIT 1));
            """);

        migrationBuilder.AlterColumn<Guid>(name: "CompanyId", table: "ContactGroups", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.AlterColumn<Guid>(name: "CompanyId", table: "ProductGroups", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.DropIndex(name: "IX_ContactGroups_SubscriberId_Name", table: "ContactGroups");
        migrationBuilder.DropIndex(name: "IX_ProductGroups_SubscriberId_Name", table: "ProductGroups");
        migrationBuilder.CreateIndex(name: "IX_ContactGroups_CompanyId_Name", table: "ContactGroups", columns: new[] { "CompanyId", "Name" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_ProductGroups_CompanyId_Name", table: "ProductGroups", columns: new[] { "CompanyId", "Name" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_ContactGroups_CompanyId_Name", table: "ContactGroups");
        migrationBuilder.DropIndex(name: "IX_ProductGroups_CompanyId_Name", table: "ProductGroups");
        migrationBuilder.CreateIndex(name: "IX_ContactGroups_SubscriberId_Name", table: "ContactGroups", columns: new[] { "SubscriberId", "Name" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_ProductGroups_SubscriberId_Name", table: "ProductGroups", columns: new[] { "SubscriberId", "Name" }, unique: true);
        migrationBuilder.DropColumn(name: "CompanyId", table: "ContactGroups");
        migrationBuilder.DropColumn(name: "CompanyId", table: "ProductGroups");
    }
}
