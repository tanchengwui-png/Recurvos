using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260721150000_AddSubscriberAccounts")]
public partial class AddSubscriberAccounts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "SubscriberAccounts",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                AccountBillingEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                ReconciledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                ReconciliationWarning = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SubscriberAccounts", x => x.Id);
                table.ForeignKey(name: "FK_SubscriberAccounts_Users_OwnerUserId", column: x => x.OwnerUserId, principalTable: "Users", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.AddColumn<Guid>(name: "SubscriberAccountId", table: "Companies", type: "uuid", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_SubscriberAccounts_OwnerUserId", table: "SubscriberAccounts", column: "OwnerUserId", unique: true);
        migrationBuilder.CreateIndex(name: "IX_Companies_SubscriberAccountId", table: "Companies", column: "SubscriberAccountId");
        migrationBuilder.AddForeignKey(name: "FK_Companies_SubscriberAccounts_SubscriberAccountId", table: "Companies", column: "SubscriberAccountId", principalTable: "SubscriberAccounts", principalColumn: "Id", onDelete: ReferentialAction.Restrict);

        migrationBuilder.Sql("""
            INSERT INTO "SubscriberAccounts" ("Id", "OwnerUserId", "AccountBillingEnabled", "CreatedAtUtc", "UpdatedAtUtc")
            SELECT gen_random_uuid(), u."Id", FALSE, NOW(), NOW()
            FROM "Users" u
            WHERE NOT u."IsPlatformOwner"
            ON CONFLICT ("OwnerUserId") DO NOTHING;

            UPDATE "Companies" c
            SET "SubscriberAccountId" = a."Id"
            FROM "SubscriberAccounts" a
            WHERE a."OwnerUserId" = COALESCE(c."SubscriberId", (SELECT u."Id" FROM "Users" u WHERE u."CompanyId" = c."Id" LIMIT 1))
              AND c."SubscriberAccountId" IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(name: "FK_Companies_SubscriberAccounts_SubscriberAccountId", table: "Companies");
        migrationBuilder.DropTable(name: "SubscriberAccounts");
        migrationBuilder.DropIndex(name: "IX_Companies_SubscriberAccountId", table: "Companies");
        migrationBuilder.DropColumn(name: "SubscriberAccountId", table: "Companies");
    }
}
