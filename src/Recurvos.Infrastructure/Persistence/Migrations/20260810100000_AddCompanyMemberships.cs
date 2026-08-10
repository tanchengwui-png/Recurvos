using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260810100000_AddCompanyMemberships")]
public partial class AddCompanyMemberships : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CompanyMemberships",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                UserId = table.Column<Guid>(type: "uuid", nullable: false),
                CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                Role = table.Column<int>(type: "integer", nullable: false),
                IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CompanyMemberships", x => x.Id);
                table.ForeignKey(name: "FK_CompanyMemberships_Companies_CompanyId", column: x => x.CompanyId, principalTable: "Companies", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                table.ForeignKey(name: "FK_CompanyMemberships_Users_UserId", column: x => x.UserId, principalTable: "Users", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(name: "IX_CompanyMemberships_UserId_CompanyId", table: "CompanyMemberships", columns: new[] { "UserId", "CompanyId" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_CompanyMemberships_UserId_IsActive", table: "CompanyMemberships", columns: new[] { "UserId", "IsActive" });
        migrationBuilder.CreateIndex(name: "IX_CompanyMemberships_CompanyId_IsActive", table: "CompanyMemberships", columns: new[] { "CompanyId", "IsActive" });

        // Preserve all current access. SubscriberId remains the billing/legacy owner,
        // while the user's initial CompanyId also becomes an owner membership.
        migrationBuilder.Sql("""
            INSERT INTO "CompanyMemberships" ("Id", "UserId", "CompanyId", "Role", "IsActive", "CreatedAtUtc")
            SELECT gen_random_uuid(), c."SubscriberId", c."Id", 1, TRUE, NOW()
            FROM "Companies" c
            WHERE c."SubscriberId" IS NOT NULL
            ON CONFLICT ("UserId", "CompanyId") DO NOTHING;

            INSERT INTO "CompanyMemberships" ("Id", "UserId", "CompanyId", "Role", "IsActive", "CreatedAtUtc")
            SELECT gen_random_uuid(), u."Id", u."CompanyId", 1, TRUE, NOW()
            FROM "Users" u
            WHERE u."CompanyId" IS NOT NULL AND NOT u."IsPlatformOwner"
            ON CONFLICT ("UserId", "CompanyId") DO NOTHING;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CompanyMemberships");
    }
}
