using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260719120000_AddJournalEntries")]
public partial class AddJournalEntries : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "JournalEntrySequence", table: "Companies", type: "integer", nullable: false, defaultValue: 1);
        migrationBuilder.CreateTable(
            name: "JournalEntries",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false), CompanyId = table.Column<Guid>(type: "uuid", nullable: false), JournalNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false), JournalDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false), Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false), ExchangeRate = table.Column<decimal>(type: "numeric(18,8)", precision: 18, scale: 8, nullable: false), ReferenceNo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false), Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false), Status = table.Column<int>(type: "integer", nullable: false), ReversesJournalEntryId = table.Column<Guid>(type: "uuid", nullable: true), ReversedByJournalEntryId = table.Column<Guid>(type: "uuid", nullable: true), PostedByUserId = table.Column<Guid>(type: "uuid", nullable: true), PostedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true), CancelledByUserId = table.Column<Guid>(type: "uuid", nullable: true), CancelledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true), CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false), UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            }, constraints: table => { table.PrimaryKey("PK_JournalEntries", x => x.Id); table.ForeignKey("FK_JournalEntries_Companies_CompanyId", x => x.CompanyId, "Companies", "Id", onDelete: ReferentialAction.Cascade); table.ForeignKey("FK_JournalEntries_JournalEntries_ReversesJournalEntryId", x => x.ReversesJournalEntryId, "JournalEntries", "Id", onDelete: ReferentialAction.Restrict); });
        migrationBuilder.CreateTable(
            name: "JournalEntryLines",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false), JournalEntryId = table.Column<Guid>(type: "uuid", nullable: false), SortOrder = table.Column<int>(type: "integer", nullable: false), AccountId = table.Column<Guid>(type: "uuid", nullable: false), AccountCodeSnapshot = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false), AccountNameSnapshot = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false), Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false), DebitAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false), CreditAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false), BaseDebitAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false), BaseCreditAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false), CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false), UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            }, constraints: table => { table.PrimaryKey("PK_JournalEntryLines", x => x.Id); table.ForeignKey("FK_JournalEntryLines_Accounts_AccountId", x => x.AccountId, "Accounts", "Id", onDelete: ReferentialAction.Restrict); table.ForeignKey("FK_JournalEntryLines_JournalEntries_JournalEntryId", x => x.JournalEntryId, "JournalEntries", "Id", onDelete: ReferentialAction.Cascade); });
        migrationBuilder.CreateIndex(name: "IX_JournalEntries_CompanyId_JournalDateUtc_Status", table: "JournalEntries", columns: new[] { "CompanyId", "JournalDateUtc", "Status" });
        migrationBuilder.CreateIndex(name: "IX_JournalEntries_CompanyId_JournalNumber", table: "JournalEntries", columns: new[] { "CompanyId", "JournalNumber" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_JournalEntries_ReversesJournalEntryId", table: "JournalEntries", column: "ReversesJournalEntryId", unique: true);
        migrationBuilder.CreateIndex(name: "IX_JournalEntryLines_AccountId", table: "JournalEntryLines", column: "AccountId");
        migrationBuilder.CreateIndex(name: "IX_JournalEntryLines_JournalEntryId_SortOrder", table: "JournalEntryLines", columns: new[] { "JournalEntryId", "SortOrder" }, unique: true);
    }
    protected override void Down(MigrationBuilder migrationBuilder) { migrationBuilder.DropTable(name: "JournalEntryLines"); migrationBuilder.DropTable(name: "JournalEntries"); migrationBuilder.DropColumn(name: "JournalEntrySequence", table: "Companies"); }
}
