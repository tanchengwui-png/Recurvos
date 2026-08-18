using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260813120000_AddPublicDocumentShares")]
public partial class AddPublicDocumentShares : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "PublicDocumentShares",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                DocumentType = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                RevokedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_PublicDocumentShares", x => x.Id));
        migrationBuilder.CreateIndex(name: "IX_PublicDocumentShares_TokenHash", table: "PublicDocumentShares", column: "TokenHash", unique: true);
        migrationBuilder.CreateIndex(name: "IX_PublicDocumentShares_CompanyId_DocumentType_DocumentId", table: "PublicDocumentShares", columns: new[] { "CompanyId", "DocumentType", "DocumentId" });
        migrationBuilder.CreateIndex(name: "IX_PublicDocumentShares_ExpiresAtUtc_RevokedAtUtc", table: "PublicDocumentShares", columns: new[] { "ExpiresAtUtc", "RevokedAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable(name: "PublicDocumentShares");
}
