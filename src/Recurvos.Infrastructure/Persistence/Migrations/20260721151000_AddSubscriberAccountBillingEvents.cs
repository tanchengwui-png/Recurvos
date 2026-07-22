using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260721151000_AddSubscriberAccountBillingEvents")]
public partial class AddSubscriberAccountBillingEvents : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "SubscriberAccountBillingEvents",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                SubscriberAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                EventType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                Severity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                Details = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SubscriberAccountBillingEvents", x => x.Id);
                table.ForeignKey(name: "FK_SubscriberAccountBillingEvents_SubscriberAccounts_SubscriberAccountId", column: x => x.SubscriberAccountId, principalTable: "SubscriberAccounts", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
            });
        migrationBuilder.CreateIndex(name: "IX_SubscriberAccountBillingEvents_SubscriberAccountId_CreatedAtUtc", table: "SubscriberAccountBillingEvents", columns: new[] { "SubscriberAccountId", "CreatedAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable(name: "SubscriberAccountBillingEvents");
}
